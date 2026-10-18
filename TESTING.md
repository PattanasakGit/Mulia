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
