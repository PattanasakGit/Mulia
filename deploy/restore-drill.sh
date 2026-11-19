#!/usr/bin/env bash
# Restore drill (release gate): proves a backup is USABLE, not just readable.
# Usage: ./restore-drill.sh /path/to/mulia-YYYYMMDD-HHMMSS.dump
# Restores into a disposable, network-less Postgres container, then compares per-table row counts
# against the live project DB and checks foreign keys. Exits non-zero on any mismatch.
# Run on a quiet DB (or accept that rows written after the dump will differ: pass ALLOW_DRIFT=1).
set -euo pipefail
dump="${1:?usage: restore-drill.sh <dump-file>}"
[ -s "$dump" ] || { echo "dump missing or empty: $dump" >&2; exit 1; }
COMPOSE=(docker compose -f "$(dirname "$0")/docker-compose.db.yml")
name="mulia-drill-$$"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$name" --network none --memory 192m \
  -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=drill postgres:17-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$name" pg_isready -U postgres -d drill >/dev/null 2>&1 && break
  sleep 1
done
docker exec -i "$name" pg_restore -U postgres -d drill --no-owner --no-acl --exit-on-error <"$dump"
tables=(rooms members tracks playback)
status=0
for t in "${tables[@]}"; do
  restored="$(docker exec "$name" psql -U postgres -d drill -tAc "SELECT count(*) FROM $t")"
  live="$("${COMPOSE[@]}" exec -T db psql -U mulia -d mulia -tAc "SELECT count(*) FROM $t")"
  printf '%-10s live=%s restored=%s\n' "$t" "$live" "$restored"
  if [ "$live" != "$restored" ] && [ "${ALLOW_DRIFT:-0}" != "1" ]; then status=1; fi
done
orphans="$(docker exec "$name" psql -U postgres -d drill -tAc "
  SELECT (SELECT count(*) FROM members m LEFT JOIN rooms r ON r.id=m.room_id WHERE r.id IS NULL)
       + (SELECT count(*) FROM tracks  x LEFT JOIN rooms r ON r.id=x.room_id WHERE r.id IS NULL)
       + (SELECT count(*) FROM playback p LEFT JOIN rooms r ON r.id=p.room_id WHERE r.id IS NULL)")"
echo "orphan rows (foreign-key check): $orphans"
[ "$orphans" = "0" ] || status=1
if [ "$status" = 0 ]; then echo "RESTORE DRILL: PASS (data check only; still run the app smoke test against the restored DB)"; else echo "RESTORE DRILL: FAIL" >&2; fi
exit "$status"
