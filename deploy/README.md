# MULIA self-hosted stack (app + Postgres in Docker)

Local test only until the owner approves a production cutover. Nothing here touches Neon.

## Layout
- `docker-compose.yml` — `db` (Postgres 17, private network, no published port, 256 MB) and `app` (Next standalone, bound to `127.0.0.1:${APP_PORT:-3000}`, 320 MB, read-only filesystem, non-root, all capabilities dropped).
- `../Dockerfile` — multi-stage build; the build caps the Node heap at 1 GB.
- `entrypoint.sh` — builds `DATABASE_URL` and `MULIA_ADMIN_TOKEN` from secret files at start-up.
- `backup.sh`, `restore-drill.sh` — daily dump + restore proof (see MULIA-DBMOVE-01).

## First start (on the server)
```bash
cd deploy
mkdir -p secrets && chmod 700 secrets
# letters and digits only (the password goes into a URL); 16+ chars for the admin token
( umask 077; head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' > secrets/mulia_db_password )
( umask 077; head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' > secrets/mulia_admin_token )
printf 'APP_UID=%s\nAPP_GID=%s\n' "$(id -u)" "$(id -g)" > .env
nice -n 15 docker compose build        # quiet host recommended: RAM is tight
docker compose up -d
docker compose ps                      # both services should become healthy
```
Never print or paste the secret files. `docker compose config` shows paths only, not values.

## Reverse proxy (Caddy is already on 80/443; snippet only, not applied)
The host runs Caddy 2.11.4 (`/etc/caddy/Caddyfile`, root-owned; other vhosts: kuma, hermes). Add a site block for the real domain (placeholder below), then `caddy validate` and reload — a root/owner action, not done by DEV:
```
mulia.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
```
### Client IP and TRUST_PROXY_HOPS (rate limiting)
- `src/lib/ratelimit.ts` takes the Nth address from the right of `X-Forwarded-For` (N = `TRUST_PROXY_HOPS`).
- `mulia.pattanasak.com` is proxied by Cloudflare, so two proxies sit in front of the app (Cloudflare, then Caddy): set `TRUST_PROXY_HOPS=2` in `deploy/.env`. Use `1` only if Caddy faces the internet directly.
- The site block in `caddy/mulia.caddy` lists Cloudflare's published ranges in `reverse_proxy { trusted_proxies ... }`. Only a request whose TCP peer is a Cloudflare edge keeps its forwarded chain; any other peer gets its `X-Forwarded-For` replaced by Caddy.
- Verified locally with a stand-in proxy in front of the real app (hops=2): (A) same real visitor with rotating spoofed left-hand entries and `X-Real-IP` -> 429 after 6 creates; (B) different real visitors -> separate buckets; (C) direct origin hit with rotating spoofed headers -> limited by the real peer. `X-Real-IP` / `X-Vercel-Forwarded-For` are ignored outside Vercel.
- Cloudflare dashboard: SSL/TLS mode **Full (strict)**. Re-check the ranges (https://www.cloudflare.com/ips-v4, /ips-v6) every few months.
- Verify again through the real domain after deploy (TESTER): more than 6 `POST /api/rooms` per minute from one client still returns 429, with and without forged headers.

## Operations
- Logs: `docker compose logs -f app`. Restart: `docker compose restart app`.
- DB shell: `docker compose exec db psql -U mulia -d mulia`.
- Backups: cron `0 3 * * * cd /path/to/Mulia/deploy && ./backup.sh`, then copy `BACKUP_DIR` off the server (owner chooses where). Run `restore-drill.sh <dump>` after setup and monthly.
- The app creates and migrates its own schema on the first query; a restored database needs nothing extra.

## Known limits
- Healthcheck is liveness only (`GET /`); there is no database readiness endpoint.
- Single instance; the in-memory rate limiter and caches are per process.
- Build on a quiet host or elsewhere: peak build memory was not measured under load.
