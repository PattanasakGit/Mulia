/**
 * TEST/QA-ONLY database driver, used only when DB_DRIVER=pg is set explicitly.
 * Connects with the plain `pg` driver to a LOCAL Postgres via DATABASE_URL.
 * Production never sets DB_DRIVER, so the Neon serverless path is unchanged.
 */
import type * as PgModule from "pg";

export function createLocalPool(connectionString: string) {
  const host = new URL(connectionString).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`DB_DRIVER=pg is test-only and must target a local Postgres (got ${host})`);
  }
  // Lazy require: `pg` is a devDependency and only loaded behind the switch.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pg = require("pg") as typeof PgModule;
  const types = {
    getTypeParser: ((oid: number, format?: "text" | "binary") =>
      oid === 20 ? (value: string) => Number(value) : pg.types.getTypeParser(oid, format)) as typeof pg.types.getTypeParser,
  };
  return new pg.Pool({ connectionString, types });
}
