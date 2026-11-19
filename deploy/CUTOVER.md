# MULIA production cutover runbook (Neon -> self-hosted Docker)

Status (2026-11-19): superseded. `mulia.pattanasak.com` is already served by this Docker stack (Caddy -> 127.0.0.1:3000, app + Postgres 17 in `deploy/`, persistent volume `mulia_mulia_pgdata`); a rebuild of the app was verified live on this date. The runbook below is kept for the Neon data copy (Phase B) and rollback reference; confirm with the owner whether Phase B was ever run before relying on it. Every step that touches DNS, Caddy or real data still needs the owner's explicit go.

## Owner-only steps (DEV cannot do these)
1. DNS: point an A record for the chosen domain (e.g. `mulia.<your-domain>`) to this server's public IP.
2. Caddy (root): append the block in `deploy/caddy/mulia.caddy` (domain `mulia.pattanasak.com`, Cloudflare ranges, HTTP-01 like the hermes vhost) to `/etc/caddy/Caddyfile`, then `sudo caddy validate --config /etc/caddy/Caddyfile` and `sudo systemctl reload caddy`. In Cloudflare: A record `mulia` -> 45.144.164.7, Proxied, SSL/TLS mode Full (strict). `TRUST_PROXY_HOPS=2` is already set in `deploy/.env` on the server.
3. Secrets on the server (never in chat): `deploy/secrets/mulia_db_password`, `deploy/secrets/mulia_admin_token`,
   and for the data copy `deploy/secrets/neon_url` (mode 600, one line: the Neon connection string).
4. Choose an off-server place for backups (SEARCH: Backblaze B2 or Cloudflare R2) and install the backup cron.

## Phase A — launch on an empty database (no old data at risk)
1. `cd deploy && docker compose build && docker compose up -d` (db + app healthy).
2. Smoke over the real URL (TESTER): home, create room, join by code, add track, playback, recovery link; rate-limit with spoofed headers still 429.
3. Decision point: owner OKs moving the old data.

## Phase B — move the data
1. `./migrate-from-neon.sh check` — row counts, size, Neon server version (read-only on Neon).
   If the Neon quota is exhausted this may fail: wait for the reset or upgrade temporarily; do not retry in a loop.
2. `./migrate-from-neon.sh rehearse` — dump + restore into a throwaway DB; counts and foreign keys must match.
3. Announce a short window. `docker compose stop app`.
4. `I_UNDERSTAND=1 ./migrate-from-neon.sh apply` — refuses unless the target is empty; prints PASS/FAIL.
   (If Phase A created test rooms, restore the volume to empty first: `docker compose down` then remove only the `mulia_pgdata` volume — owner confirms, data is test data only.)
5. `docker compose up -d app`; repeat the smoke test, then `./restore-drill.sh` on a fresh backup.

## Rollback
- Neon is never modified by these scripts. Keep it untouched for at least 7 days.
- Before traffic moves: nothing to roll back (old production still serves).
- After traffic moves: point the domain/old deployment back to the Neon-backed app. Rooms created on the new database after cutover are not on Neon; take `./backup.sh` first if they matter.

## Done criteria (TESTER)
Row counts equal per table, zero orphan rows, full smoke on the production URL, restore drill from an off-server copy.
