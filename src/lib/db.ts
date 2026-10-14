import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";

type SqlRow = Record<string, SQLOutputValue>;

type Statement = {
  run(...params: SQLOutputValue[]): { changes: number };
  get(...params: SQLOutputValue[]): SqlRow | undefined;
  all(...params: SQLOutputValue[]): SqlRow[];
};

type ArchiveDatabase = {
  exec(sql: string): void;
  prepare(sql: string): Statement;
};

const globalForDb = globalThis as unknown as {
  soundIndexDb?: DatabaseSync;
  soundIndexEmoji?: boolean;
};

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS members (
      id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      name TEXT NOT NULL,
      hue INTEGER NOT NULL,
      emoji TEXT,
      last_seen INTEGER NOT NULL,
      PRIMARY KEY (id, room_id),
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      youtube_id TEXT NOT NULL,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      thumbnail TEXT,
      duration_sec INTEGER,
      added_by TEXT NOT NULL,
      added_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    );

    CREATE TABLE IF NOT EXISTS playback (
      room_id TEXT PRIMARY KEY,
      track_id TEXT,
      status TEXT NOT NULL,
      position_ms INTEGER NOT NULL,
      anchor_ms INTEGER NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    );

    CREATE INDEX IF NOT EXISTS idx_tracks_room ON tracks (room_id, status, added_at);
    CREATE INDEX IF NOT EXISTS idx_members_room ON members (room_id, last_seen);
  `);
  ensureEmojiColumn(db);
}

function ensureEmojiColumn(db: DatabaseSync) {
  if (globalForDb.soundIndexEmoji) return;
  const columns = db.prepare("PRAGMA table_info(members)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "emoji")) {
    db.exec("ALTER TABLE members ADD COLUMN emoji TEXT");
  }
  globalForDb.soundIndexEmoji = true;
}

export function getDb() {
  if (!globalForDb.soundIndexDb) {
    const dir = path.join(process.cwd(), "data");
    fs.mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(path.join(dir, "sound-index.db"));
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA busy_timeout = 3000");
    migrate(db);
    globalForDb.soundIndexDb = db;
  }
  ensureEmojiColumn(globalForDb.soundIndexDb);
  return globalForDb.soundIndexDb as unknown as ArchiveDatabase;
}

export function withTransaction<T>(run: () => T) {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = run();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
