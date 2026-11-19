#!/bin/sh
# Builds secrets-based env at start so no password sits in compose files or in `docker inspect`.
#   /run/secrets/mulia_db_password  -> DATABASE_URL (host DB_HOST, default db)
#   /run/secrets/mulia_admin_token  -> MULIA_ADMIN_TOKEN (optional)
set -eu
if [ -z "${DATABASE_URL:-}" ] && [ -r /run/secrets/mulia_db_password ]; then
  pw="$(tr -d '\r\n' </run/secrets/mulia_db_password)"
  # Letters and digits only, so the value is safe inside a URL without encoding.
  case "$pw" in
    ""|*[!A-Za-z0-9]*) echo "mulia_db_password must be non-empty letters and digits only" >&2; exit 1 ;;
  esac
  export DATABASE_URL="postgresql://${DB_USER:-mulia}:${pw}@${DB_HOST:-db}:5432/${DB_NAME:-mulia}"
fi
if [ -z "${MULIA_ADMIN_TOKEN:-}" ] && [ -r /run/secrets/mulia_admin_token ]; then
  MULIA_ADMIN_TOKEN="$(tr -d '\r\n' </run/secrets/mulia_admin_token)"
  export MULIA_ADMIN_TOKEN
fi
[ -n "${DATABASE_URL:-}" ] || { echo "DATABASE_URL is not set and no db password secret found" >&2; exit 1; }
exec "$@"
