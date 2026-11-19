#!/usr/bin/env bash
# Daily logical backup of the project DB container. Run from cron on the host:
#   0 3 * * *  cd /path/to/Mulia/deploy && ./backup.sh
# Writes a custom-format dump, checks it is non-trivial, and keeps 7 daily + 4 weekly files.
# Copy BACKUP_DIR to a second location off this server; same-VPS-only is not a real backup.
set -euo pipefail
umask 077
BACKUP_DIR="${BACKUP_DIR:-/var/backups/mulia}"
COMPOSE=(docker compose -f "$(dirname "$0")/docker-compose.db.yml")
MIN_BYTES="${MIN_BYTES:-2048}"
mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
tmp="$BACKUP_DIR/.mulia-$stamp.part"
out="$BACKUP_DIR/mulia-$stamp.dump"
trap 'rm -f "$tmp"' EXIT
"${COMPOSE[@]}" exec -T db pg_dump -U mulia -d mulia -Fc --no-owner --no-acl >"$tmp"
size="$(stat -c %s "$tmp")"
if [ "$size" -lt "$MIN_BYTES" ]; then
  echo "backup too small ($size bytes), refusing to keep it" >&2
  exit 1
fi
mv "$tmp" "$out"
echo "backup ok: $(basename "$out") ($size bytes)"
# Retention: newest 7 daily files, plus the newest file of each of the last 4 ISO weeks.
mapfile -t all < <(ls -1 "$BACKUP_DIR"/mulia-*.dump | sort -r)
keep=()
for f in "${all[@]:0:7}"; do keep+=("$f"); done
declare -A week_seen=()
for f in "${all[@]}"; do
  d="$(basename "$f" | sed -E 's/mulia-([0-9]{8}).*/\1/')"
  w="$(date -d "${d:0:4}-${d:4:2}-${d:6:2}" +%G-%V)"
  if [ -z "${week_seen[$w]:-}" ] && [ "${#week_seen[@]}" -lt 4 ]; then
    week_seen[$w]=1
    keep+=("$f")
  fi
done
for f in "${all[@]}"; do
  printf '%s\n' "${keep[@]}" | grep -qxF "$f" || rm -f "$f"
done
