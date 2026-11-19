/**
 * Plain `pg` driver, used only when DB_DRIVER=pg is set explicitly (tests/QA, and the self-hosted
 * production container). Unset means the Neon serverless path, unchanged.
 *
 * Where the database may live:
 *  - loopback (localhost, 127.0.0.1, ::1): tests/QA, no TLS needed;
 *  - a host named in DB_PG_ALLOWED_HOSTS (comma list, e.g. the compose service name `db`): a private
 *    container network, no TLS needed;
 *  - anything else is refused unless DB_PG_ALLOW_REMOTE=1, and then TLS with certificate checks is
 *    mandatory (sslmode=disable is rejected). DB_PG_CA may hold a PEM CA to trust.
 */
import type * as PgModule from "pg";

const LOOPBACK = ["localhost", "127.0.0.1", "::1", "[::1]"];

type Env = Record<string, string | undefined>;

export type PgTarget = {
  connectionString: string;
  ssl: false | { rejectUnauthorized: true; ca?: string };
};

function intFrom(raw: string | undefined, fallback: number, min: number, max: number) {
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

/** Pure: decides whether the target is acceptable and how to secure the connection. */
export function resolvePgTarget(connectionString: string, env: Env = process.env): PgTarget {
  const url = new URL(connectionString);
  const host = url.hostname;
  const allowed = (env.DB_PG_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (LOOPBACK.includes(host) || allowed.includes(host)) {
    return { connectionString, ssl: false };
  }
  if (env.DB_PG_ALLOW_REMOTE !== "1") {
    throw new Error(
      `DB_DRIVER=pg is test-only for remote hosts (got ${host}); set DB_PG_ALLOWED_HOSTS for a private container host or DB_PG_ALLOW_REMOTE=1 with TLS`,
    );
  }
  if (url.searchParams.get("sslmode") === "disable") {
    throw new Error(`a remote Postgres (${host}) must use TLS; sslmode=disable is not allowed`);
  }
  // pg reads sslmode from the URL with loose semantics; drop it and pass an explicit, strict setting.
  url.searchParams.delete("sslmode");
  const ca = env.DB_PG_CA?.trim();
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
  };
}

export function createLocalPool(connectionString: string, env: Env = process.env) {
  const target = resolvePgTarget(connectionString, env);
  // Lazy require: only loaded behind the DB_DRIVER=pg switch.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pg = require("pg") as typeof PgModule;
  const types = {
    getTypeParser: ((oid: number, format?: "text" | "binary") =>
      oid === 20 ? (value: string) => Number(value) : pg.types.getTypeParser(oid, format)) as typeof pg.types.getTypeParser,
  };
  return new pg.Pool({
    connectionString: target.connectionString,
    ssl: target.ssl,
    types,
    max: intFrom(env.DB_POOL_MAX, 10, 1, 50),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: intFrom(env.DB_STATEMENT_TIMEOUT_MS, 10_000, 1_000, 120_000),
  });
}
