# Testing (local only)

Tests and the QA app use a **local** Postgres. Never production.

```bash
npm run testdb:start      # initdb + start PG on 127.0.0.1:55432, creates mulia_test & mulia_qa
npm run typecheck && npm run lint && npm test   # npm run test:coverage for numbers
npm run build && PORT=3101 npm run start:qa     # app on :3101 against mulia_qa (DB_DRIVER=pg)
npm run seed:qa           # QA fixtures (R1..R4, XSS, 31 fillers); re-run to reset
npm run testdb:stop
```

`DB_DRIVER=pg` (test only) makes `src/lib/db.ts` use the `pg` driver via `src/lib/db-local.ts`, which refuses non-local hosts. Unset (production) means the Neon serverless path, unchanged.

## Load and abuse protection

Limits live at the HTTP edge (`src/lib/ratelimit.ts`, wired in each route via `guard()`); the library in `src/lib/rooms.ts` stays unlimited. They are per server instance. Set `RATE_LIMIT=off` to disable them when load-testing from one machine. Room reads are shared per instance for ~0.7s (`src/lib/memo.ts`) and clients send `?v=<rev>` so an unchanged room answers in ~100 bytes. Tests: `tests/load-protection.test.ts`, `tests/poll.test.ts`.

## Speaker

A room is `single` (one main speaker device, everyone else is a remote or opts in to "listen along") or `all` (every device plays; the mode of rooms created before the feature). Anyone with the code may move the speaker or switch the mode. Device ids are per tab (`sessionStorage`). Tests: `tests/speaker.test.ts` (server), `tests/speaker-role.test.ts` (client role rules).
