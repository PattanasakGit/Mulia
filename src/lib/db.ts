import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, types, neonConfig, type PoolClient } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
types.setTypeParser(20, (value) => Number(value));

type SqlValue = string | number | null;
type Runner = Pool | PoolClient;

const transaction = new AsyncLocalStorage<PoolClient>();

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new Pool({ connectionString });
    // Neon drops idle connections; without a listener that surfaces as an uncaught exception.
    pool.on("error", (error: Error) => console.error("idle database client failed", error));
  }
  return pool;
}

function toPostgres(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

async function runner(): Promise<Runner> {
  return transaction.getStore() ?? getPool();
}

async function ensureSchema() {
  if (transaction.getStore()) return;
  if (!schemaReady) {
    schemaReady = migrate().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

async function migrate() {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      opened_by TEXT,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS members (
      id TEXT NOT NULL,
      room_id TEXT NOT NULL REFERENCES rooms(id),
      name TEXT NOT NULL,
      hue INTEGER NOT NULL,
      emoji TEXT,
      last_seen BIGINT NOT NULL,
      PRIMARY KEY (id, room_id)
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id),
      youtube_id TEXT NOT NULL,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      thumbnail TEXT,
      duration_sec INTEGER,
      added_by TEXT NOT NULL,
      added_at BIGINT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playback (
      room_id TEXT PRIMARY KEY REFERENCES rooms(id),
      track_id TEXT,
      status TEXT NOT NULL,
      position_ms BIGINT NOT NULL,
      anchor_ms BIGINT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tracks_room ON tracks (room_id, status, added_at);
    CREATE INDEX IF NOT EXISTS idx_members_room ON members (room_id, last_seen);

    ALTER TABLE rooms ADD COLUMN IF NOT EXISTS opened_by TEXT;

    UPDATE rooms AS room
    SET opened_by = earliest.id
    FROM (
      SELECT DISTINCT ON (room_id) room_id, id
      FROM members
      ORDER BY room_id, last_seen ASC
    ) AS earliest
    WHERE room.id = earliest.room_id
      AND room.opened_by IS NULL;
  `);
}

const TRANSIENT = /Connection terminated|ECONNRESET|ETIMEDOUT|EPIPE|timeout exceeded|Client has encountered a connection error/i;

function isTransient(error: unknown) {
  return error instanceof Error && TRANSIENT.test(error.message);
}

async function run(sql: string, params: SqlValue[]) {
  await ensureSchema();
  const text = toPostgres(sql);
  try {
    return await (await runner()).query(text, params);
  } catch (error) {
    // A pooled connection that Neon closed while idle fails once; the retry gets a fresh one.
    if (transaction.getStore() || !isTransient(error)) throw error;
    return (await runner()).query(text, params);
  }
}

export async function query<T>(sql: string, params: SqlValue[] = []) {
  const result = await run(sql, params);
  return result.rows as T[];
}

export async function queryOne<T>(sql: string, params: SqlValue[] = []) {
  const rows = await query<T>(sql, params);
  return rows[0];
}

export async function execute(sql: string, params: SqlValue[] = []) {
  const result = await run(sql, params);
  return result.rowCount ?? 0;
}

async function openTransaction() {
  for (let attempt = 0; ; attempt += 1) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      return client;
    } catch (error) {
      client.release(true);
      if (attempt > 0 || !isTransient(error)) throw error;
    }
  }
}

export async function withTransaction<T>(work: () => Promise<T>) {
  if (transaction.getStore()) return work();
  await ensureSchema();
  const client = await openTransaction();
  let broken = false;
  try {
    const result = await transaction.run(client, work);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
      broken = true;
    });
    throw error;
  } finally {
    client.release(broken);
  }
}

export function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}
