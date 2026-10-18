#!/usr/bin/env bash
# TEST-ONLY local Postgres for unit tests and QA. Never point at production.
set -euo pipefail
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="${MULIA_TESTDB_DIR:-/workspace/development/mulia-testdb}"
PORT="${MULIA_TESTDB_PORT:-55432}"
case "${1:-start}" in
  start)
    if [ ! -d "$DIR/data" ]; then
      mkdir -p "$DIR"
      "$PGBIN/initdb" -D "$DIR/data" -U mulia --auth=trust -E UTF8 >/dev/null
    fi
    "$PGBIN/pg_ctl" -D "$DIR/data" status >/dev/null 2>&1 ||
      "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" -l "$DIR/pg.log" -w start
    for db in mulia_test mulia_qa; do
      "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U mulia -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 ||
        "$PGBIN/createdb" -h 127.0.0.1 -p "$PORT" -U mulia "$db"
    done
    echo "postgresql://mulia@127.0.0.1:$PORT/mulia_test (tests), .../mulia_qa (QA app)";;
  stop) "$PGBIN/pg_ctl" -D "$DIR/data" stop;;
  reset-qa) "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U mulia -d mulia_qa -c "DROP TABLE IF EXISTS tracks, playback, members, rooms CASCADE";;
esac
