#!/usr/bin/env bash
# One-way copy of the production database from Neon into the project's Postgres container.
# Never prints the connection string. Neon is only READ (pg_dump / SELECT count); it is never written.
#
#   ./migrate-from-neon.sh check      row counts + size on Neon (read-only)
#   ./migrate-from-neon.sh rehearse   dump Neon, restore into a disposable DB, compare counts
#   ./migrate-from-neon.sh apply      dump Neon, restore into the project DB (must be EMPTY; stop the
#                                     app first; needs I_UNDERSTAND=1), compare counts
#
# Source URL: file deploy/secrets/neon_url (mode 600, one line), created by the owner on the server.
# NOTE: pg_dump from Neon counts as Neon data transfer; with the free quota exhausted it may be refused.
# Test hook: SRC_NETWORK=<docker network> lets the dump container reach a local stand-in source.
set -euo pipefail
umask 077
here="$(cd "$(dirname "$0")" && pwd)"
URL_FILE="${NEON_URL_FILE:-$here/secrets/neon_url}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/mulia}"
CLIENT_IMAGE="${CLIENT_IMAGE:-postgres:17-alpine}"
COMPOSE=(docker compose -f "$here/docker-compose.yml")
TABLES=(rooms members tracks playback)
mode="${1:-}"
[ -r "$URL_FILE" ] || { echo "missing $URL_FILE (owner creates it; never paste it in chat)" >&2; exit 1; }
[ "$(stat -c %a "$URL_FILE")" = "600" ] || { echo "$URL_FILE must be mode 600" >&2; exit 1; }

net=()
[ -n "${SRC_NETWORK:-}" ] && net=(--network "$SRC_NETWORK")
# Run a postgres client tool against the source; the URL is read inside the container from a read-only mount.
src() { docker run --rm -i "${net[@]}" --memory 192m -v "$URL_FILE:/run/src_url:ro" "$CLIENT_IMAGE" sh -c "$1"; }
src_count() { src "psql \"\$(cat /run/src_url)\" -tAc 'SELECT count(*) FROM $1'" | tr -d '[:space:]'; }

declare -A src_counts
read_counts() {
  for t in "${TABLES[@]}"; do src_counts[$t]="$(src_count "$t")"; done
}
print_counts() { for t in "${TABLES[@]}"; do printf '  %-9s source=%s\n' "$t" "${src_counts[$t]}"; done; }

dump_source() {
  mkdir -p "$BACKUP_DIR"
  dump="$BACKUP_DIR/neon-$(date +%Y%m%d-%H%M%S).dump"
  src 'pg_dump "$(cat /run/src_url)" -Fc --no-owner --no-acl' >"$dump.part"
  [ "$(stat -c %s "$dump.part")" -ge 2048 ] || { rm -f "$dump.part"; echo "dump too small, refusing" >&2; exit 1; }
  mv "$dump.part" "$dump"
  echo "dump: $dump ($(stat -c %s "$dump") bytes)"
}

compare() { # $1 = command prefix that runs psql against the target and takes the SQL as last arg
  local bad=0 got
  for t in "${TABLES[@]}"; do
    got="$("$@" "SELECT count(*) FROM $t" | tr -d '[:space:]')"
    printf '  %-9s source=%s target=%s\n' "$t" "${src_counts[$t]}" "$got"
    [ "$got" = "${src_counts[$t]}" ] || bad=1
  done
  orphans="$("$@" "SELECT (SELECT count(*) FROM members m LEFT JOIN rooms r ON r.id=m.room_id WHERE r.id IS NULL) + (SELECT count(*) FROM tracks x LEFT JOIN rooms r ON r.id=x.room_id WHERE r.id IS NULL) + (SELECT count(*) FROM playback p LEFT JOIN rooms r ON r.id=p.room_id WHERE r.id IS NULL)" | tr -d '[:space:]')"
  echo "  orphan rows (foreign keys): $orphans"
  [ "$orphans" = "0" ] || bad=1
  return "$bad"
}

case "$mode" in
  check)
    read_counts; print_counts
    echo "  size: $(src 'psql "$(cat /run/src_url)" -tAc "SELECT pg_size_pretty(pg_database_size(current_database()))"' | tr -d '\r')"
    echo "  server: $(src 'psql "$(cat /run/src_url)" -tAc "SHOW server_version"' | tr -d '\r')"
    ;;
  rehearse)
    read_counts; dump_source
    name="mulia-rehearse-$$"; trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
    docker run -d --name "$name" --network none --memory 192m -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=drill "$CLIENT_IMAGE" >/dev/null
    for _ in $(seq 1 30); do docker exec "$name" pg_isready -U postgres -d drill >/dev/null 2>&1 && break; sleep 1; done
    docker exec -i "$name" pg_restore -U postgres -d drill --no-owner --no-acl --exit-on-error <"$dump"
    if compare docker exec "$name" psql -U postgres -d drill -tAc; then echo "REHEARSAL: PASS"; else echo "REHEARSAL: FAIL" >&2; exit 1; fi
    ;;
  apply)
    [ "${I_UNDERSTAND:-}" = "1" ] || { echo "set I_UNDERSTAND=1 (the app must be stopped, the target DB empty)" >&2; exit 1; }
    if "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx app; then echo "stop the app first: docker compose stop app" >&2; exit 1; fi
    existing="$("${COMPOSE[@]}" exec -T db psql -U mulia -d mulia -tAc "SELECT coalesce((SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='rooms'),0)" | tr -d '[:space:]')"
    if [ "$existing" != "0" ]; then
      rows="$("${COMPOSE[@]}" exec -T db psql -U mulia -d mulia -tAc "SELECT count(*) FROM rooms" | tr -d '[:space:]')"
      [ "$rows" = "0" ] || { echo "target database already has $rows rooms; refusing to overwrite" >&2; exit 1; }
      "${COMPOSE[@]}" exec -T db psql -U mulia -d mulia -q -c "DROP TABLE IF EXISTS tracks, playback, members, rooms CASCADE"
    fi
    read_counts; dump_source
    "${COMPOSE[@]}" exec -T db pg_restore -U mulia -d mulia --no-owner --no-acl --exit-on-error <"$dump"
    if compare "${COMPOSE[@]}" exec -T db psql -U mulia -d mulia -tAc; then echo "APPLY: PASS (start the app, run the smoke test)"; else echo "APPLY: FAIL (do not switch traffic)" >&2; exit 1; fi
    ;;
  *) echo "usage: $0 check|rehearse|apply" >&2; exit 2 ;;
esac
