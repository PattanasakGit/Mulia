#!/usr/bin/env bash
# Start a production build on PORT (default 3101) against the LOCAL QA Postgres.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-3101}"
export DB_DRIVER=pg
export DATABASE_URL="${QA_DATABASE_URL:-postgresql://mulia@127.0.0.1:55432/mulia_qa}"
exec npx next start -p "$PORT"
