import { createHash, randomInt, randomUUID } from "node:crypto";
import { execute, isUniqueViolation, query, queryOne, withTransaction } from "@/lib/db";
import { isSuperAdmin } from "@/lib/admin";
import { animalOrSeed } from "@/lib/animals";
import { hueFromName } from "@/lib/hue";
import { forget, memo } from "@/lib/memo";
import type {
  LiveNow,
  Playback,
  PlaybackStatus,
  RoomCard,
  RoomSnapshot,
  SpeakerMode,
  Track,
} from "@/lib/types";
import { parseYoutubeUrl, safeThumbnail } from "@/lib/youtube";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const CODE_SHAPE = /^[A-HJ-NP-Z2-9]{6}$/;
const PRESENCE_MS = 90_000;
const QUEUE_LIMIT = 100;
// The queue limit counts unplayed tracks only; played ones stay listed, so a reorder carries all rows.
const REORDER_LIMIT = 2000;
// Played tracks are history, not queue: keep the latest ones so a long-lived room's snapshot
// (sent to every listener) stops growing.
const PLAYED_KEEP = 100;
const MEMBERS_LIMIT = 300;
const SNAPSHOT_TTL_MS = 700;
const LIST_TTL_MS = 2000;
const ROOMS_PER_MINUTE = 60;

export class ArchiveError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type RoomRow = {
  id: string;
  code: string;
  name: string;
  opened_by: string | null;
  created_at: number;
  speaker_mode: SpeakerMode;
  main_device: string | null;
  main_label: string | null;
  main_seen: number;
};
const ROOM_COLUMNS = "id, code, name, opened_by, created_at, speaker_mode, main_device, main_label, main_seen";
type TrackRow = {
  id: string;
  youtube_id: string;
  title: string;
  author: string;
  thumbnail: string | null;
  duration_sec: number | null;
  added_by: string;
  status: Track["status"];
  adder_id: string | null;
  adder_hue: number | null;
  adder_emoji: string | null;
};
type PlaybackRow = {
  track_id: string | null;
  status: PlaybackStatus;
  position_ms: number;
  anchor_ms: number;
};

function cleanName(value: unknown, label: string, max: number) {
  if (typeof value !== "string") throw new ArchiveError(`ต้องระบุ${label}`);
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > max) {
    throw new ArchiveError(`${label}ต้องยาว 1–${max} ตัวอักษร`);
  }
  return name;
}

function cleanId(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new ArchiveError("ต้องตั้งชื่อก่อนเข้าฟัง");
  }
  return value;
}

export function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

/** Codes Postgres cannot store (NUL byte) can never match a room. */
function unmatchableCode(code: string) {
  return code.includes("\u0000");
}

function makeCode() {
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

function presentTrack(row: TrackRow): Track {
  return {
    id: row.id,
    youtubeId: row.youtube_id,
    title: row.title,
    author: row.author,
    thumbnail: row.thumbnail,
    durationSec: row.duration_sec,
    addedBy: row.added_by,
    adder: {
      hue: row.adder_hue ?? hueFromName(row.added_by),
      emoji: animalOrSeed(row.adder_emoji, row.adder_id ?? row.added_by),
    },
    status: row.status,
  };
}

async function requireRoom(code: string) {
  if (unmatchableCode(code)) throw new ArchiveError("ไม่พบห้องนี้ใน MULIA", 404);
  const room = await queryOne<RoomRow>(
    `SELECT ${ROOM_COLUMNS} FROM rooms WHERE code = ?`,
    [normalizeCode(code)],
  );
  if (!room) throw new ArchiveError("ไม่พบห้องนี้ใน MULIA", 404);
  return room;
}

async function roomExists(roomId: string) {
  return Boolean(await queryOne<{ id: string }>("SELECT id FROM rooms WHERE id = ?", [roomId]));
}

/**
 * Lock the room row for the rest of the transaction. Every mutating transaction takes this
 * first, so changes to one room are serialised in a single lock order (no deadlocks) and a
 * concurrent close is seen as "not found" instead of an FK error (joins included). Close uses
 * FOR UPDATE (it deletes the row); others use FOR NO KEY UPDATE, which doesn't block other
 * transactions' implicit FK (FOR KEY SHARE) checks.
 */
async function lockRoom(roomId: string, mode: "update" | "no-key" = "no-key") {
  const lock = mode === "update" ? "FOR UPDATE" : "FOR NO KEY UPDATE";
  const row = await queryOne<{ id: string }>(`SELECT id FROM rooms WHERE id = ? ${lock}`, [roomId]);
  if (!row) throw new ArchiveError("ไม่พบห้องนี้ใน MULIA", 404);
}

async function playbackOf(roomId: string) {
  const row = await queryOne<PlaybackRow>(
    "SELECT track_id, status, position_ms, anchor_ms FROM playback WHERE room_id = ?",
    [roomId],
  );
  if (!row) throw new ArchiveError("ห้องนี้ยังไม่มีสถานะการเล่น", 500);
  return row;
}

async function durationMsOf(trackId: string | null) {
  if (!trackId) return null;
  const row = await queryOne<{ duration_sec: number | null }>(
    "SELECT duration_sec FROM tracks WHERE id = ?",
    [trackId],
  );
  if (!row?.duration_sec || row.duration_sec <= 0) return null;
  return row.duration_sec * 1000;
}

async function computedPosition(row: PlaybackRow, now: number) {
  const raw = row.status === "playing"
    ? row.position_ms + Math.max(0, now - row.anchor_ms)
    : row.position_ms;
  const cap = await durationMsOf(row.track_id);
  if (cap === null) return raw;
  return Math.min(raw, cap);
}

async function healPlayback(roomId: string, now: number) {
  const playback = await playbackOf(roomId);
  if (!playback.track_id || playback.status === "idle") return;
  const cap = await durationMsOf(playback.track_id);
  if (cap === null) return;
  const raw = playback.status === "playing"
    ? playback.position_ms + Math.max(0, now - playback.anchor_ms)
    : playback.position_ms;
  if (raw <= cap + 1000) return;
  if (await neighborTrack(roomId, playback.track_id, 1)) {
    await advance(roomId, now, playback.track_id);
    return;
  }
  await setPlayback(roomId, playback.track_id, "paused", cap, now);
}

async function setPlayback(
  roomId: string,
  trackId: string | null,
  status: PlaybackStatus,
  positionMs: number,
  now: number,
) {
  await execute(
    `UPDATE playback
     SET track_id = ?, status = ?, position_ms = ?, anchor_ms = ?
     WHERE room_id = ?`,
    [trackId, status, Math.max(0, Math.round(positionMs)), now, roomId],
  );
}

async function startTrack(roomId: string, trackId: string, now: number) {
  await execute(
    "UPDATE tracks SET status = 'played' WHERE room_id = ? AND status = 'current'",
    [roomId],
  );
  const changes = await execute(
    "UPDATE tracks SET status = 'current' WHERE id = ? AND room_id = ?",
    [trackId, roomId],
  );
  if (changes === 0) throw new ArchiveError("ไม่พบเพลงนี้แล้ว", 404);
  await setPlayback(roomId, trackId, "playing", 0, now);
}

async function neighborTrack(roomId: string, trackId: string | null, direction: 1 | -1) {
  const rows = await query<{ id: string }>(
    `SELECT id FROM tracks
     WHERE room_id = ?
     ORDER BY added_at ASC, id ASC`,
    [roomId],
  );
  if (rows.length === 0) return undefined;
  if (!trackId) return direction === 1 ? rows[0] : undefined;
  const index = rows.findIndex((row) => row.id === trackId);
  if (index < 0) return direction === 1 ? rows[0] : undefined;
  return rows[index + direction];
}

async function advance(roomId: string, now: number, expectedTrackId?: string) {
  const playback = await playbackOf(roomId);
  if (expectedTrackId && playback.track_id !== expectedTrackId) return;
  const next = await neighborTrack(roomId, playback.track_id, 1);
  if (next) {
    await startTrack(roomId, next.id, now);
    return;
  }
  if (!playback.track_id) return;
  const cap = (await durationMsOf(playback.track_id)) ?? playback.position_ms;
  await setPlayback(roomId, playback.track_id, "paused", cap, now);
}

export async function getSnapshot(code: string): Promise<RoomSnapshot | null> {
  if (unmatchableCode(code)) return null;
  const room = await queryOne<RoomRow>(
    `SELECT ${ROOM_COLUMNS} FROM rooms WHERE code = ?`,
    [normalizeCode(code)],
  );
  if (!room) return null;

  const now = Date.now();
  try {
    // Common case: one statement (one consistent snapshot), no transaction and no room lock.
    // Taking the lock on every poll serialised all listeners of a room: with ~40ms to the
    // database a room with 20 listeners polled at 4s instead of 1.2s.
    const fresh = await readSnapshot(room, now);
    if (!overran(fresh, now)) return fresh;
    // Rare case: a finished song nobody reported. Heal + re-read under the room lock, so a
    // concurrent close is either fully before (lock finds no row → null) or fully after.
    return await withTransaction(async () => {
      await lockRoom(room.id);
      await healPlayback(room.id, now);
      return readSnapshot(room, now);
    });
  } catch (error) {
    // Defense: room (or its playback row) gone because it was closed → not found, not 500.
    if (error instanceof ArchiveError && !(await roomExists(room.id))) return null;
    throw error;
  }
}

/** Same rule as healPlayback, evaluated on an already-read snapshot. */
function overran(value: RoomSnapshot, now: number) {
  const { playback } = value;
  if (!playback.trackId || playback.status === "idle") return false;
  const durationSec = value.queue.find((track) => track.id === playback.trackId)?.durationSec;
  if (!durationSec || durationSec <= 0) return false;
  const raw = playback.status === "playing"
    ? playback.positionMs + Math.max(0, now - playback.anchorMs)
    : playback.positionMs;
  return raw > durationSec * 1000 + 1000;
}

async function readSnapshot(room: RoomRow, now: number): Promise<RoomSnapshot> {
  const row = await queryOne<{
    playback: PlaybackRow | null;
    members: { id: string; name: string; hue: number; emoji: string | null }[];
    tracks: TrackRow[];
  }>(
    `SELECT
       (SELECT row_to_json(p) FROM (
          SELECT track_id, status, position_ms, anchor_ms FROM playback WHERE room_id = ?
        ) p) AS playback,
       COALESCE((SELECT json_agg(m ORDER BY lower(m.name)) FROM (
          SELECT id, name, hue, emoji FROM members WHERE room_id = ? AND last_seen >= ?
        ) m), '[]'::json) AS members,
       COALESCE((SELECT json_agg(x ORDER BY x.added_at, x.id) FROM (
          SELECT t.id, t.youtube_id, t.title, t.author, t.thumbnail, t.duration_sec, t.added_by, t.status, t.added_at,
                 m.id AS adder_id, m.hue AS adder_hue, m.emoji AS adder_emoji
          FROM tracks t
          LEFT JOIN members m ON m.room_id = t.room_id AND m.id = (
            SELECT id FROM members
            WHERE room_id = t.room_id AND name = t.added_by
            ORDER BY last_seen DESC
            LIMIT 1
          )
          WHERE t.room_id = ?
        ) x), '[]'::json) AS tracks`,
    [room.id, room.id, now - PRESENCE_MS, room.id],
  );
  const playback = row?.playback;
  if (!playback) throw new ArchiveError("ห้องนี้ยังไม่มีสถานะการเล่น", 500);

  const members = row.members.map((member) => ({
    id: member.id,
    name: member.name,
    hue: member.hue,
    emoji: animalOrSeed(member.emoji, member.id),
  }));
  const tracks = row.tracks;
  const current = tracks.find((track) => track.status === "current") ?? null;

  return {
    serverNow: now,
    room: {
      id: room.id,
      code: room.code,
      name: room.name,
      openedBy: room.opened_by,
      createdAt: room.created_at,
    },
    speaker: {
      mode: room.speaker_mode,
      mainDeviceId: room.speaker_mode === "single" ? room.main_device : null,
      mainLabel: room.speaker_mode === "single" ? room.main_label : null,
      mainOnline: room.speaker_mode === "single" && Boolean(room.main_device) && Number(room.main_seen) >= now - PRESENCE_MS,
    },
    members,
    current: current ? presentTrack(current) : null,
    queue: tracks.map(presentTrack),
    playback: {
      status: playback.status,
      positionMs: Number(playback.position_ms),
      anchorMs: Number(playback.anchor_ms),
      trackId: playback.track_id,
    } satisfies Playback,
  };
}

/** Run a mutation and build the returned snapshot in the same transaction/room lock. */
async function mutateThenSnapshot(code: string, mutate: () => Promise<void>) {
  const result = await withTransaction(async () => {
    await mutate();
    return snapshot(code);
  });
  forget(snapshotKey(code));
  return result;
}

function snapshotKey(code: string) {
  return `snap:${normalizeCode(code)}`;
}

function revisionOf(value: RoomSnapshot) {
  return createHash("sha1")
    .update(JSON.stringify({ ...value, serverNow: 0, rev: undefined, pollMs: undefined }))
    .digest("base64url")
    .slice(0, 12);
}

/**
 * Snapshot for polling clients. Listeners of one room share one database read per ~0.7s per
 * instance; `serverNow` is restamped per response so projected positions stay exact.
 */
export async function getSnapshotShared(code: string): Promise<RoomSnapshot | null> {
  // codes are 6 characters from ALPHABET: anything else can't exist, so it never reaches the database
  if (!CODE_SHAPE.test(normalizeCode(code))) return null;
  const base = await memo(snapshotKey(code), SNAPSHOT_TTL_MS, async () => {
    const value = await getSnapshot(code);
    return value ? { value, rev: revisionOf(value) } : null;
  });
  if (!base) return null;
  const members = base.value.members.length;
  return {
    ...base.value,
    serverNow: Date.now(),
    rev: base.rev,
    pollMs: Math.min(4000, 1500 + members * 50),
  };
}

async function snapshot(code: string) {
  const value = await getSnapshot(code);
  if (!value) throw new ArchiveError("ไม่พบห้องนี้ใน MULIA", 404);
  return value;
}

export function listRoomsShared() {
  return memo("rooms:list", LIST_TTL_MS, listRooms);
}

export async function getLiveNowShared(): Promise<LiveNow> {
  const value = await memo("rooms:now", LIST_TTL_MS, getLiveNow);
  return { ...value, serverNow: Date.now() };
}

export async function listRooms(): Promise<RoomCard[]> {
  const now = Date.now();
  const rows = await query<{
    code: string;
    name: string;
    created_at: number;
    listeners: number;
    title: string | null;
    author: string | null;
    thumbnail: string | null;
    status: PlaybackStatus;
  }>(
    `SELECT
       r.code,
       r.name,
       r.created_at,
       (SELECT COUNT(*)::int FROM members m WHERE m.room_id = r.id AND m.last_seen >= ?) AS listeners,
       t.title,
       t.author,
       t.thumbnail,
       COALESCE(p.status, 'idle') AS status
     FROM rooms r
     LEFT JOIN playback p ON p.room_id = r.id
     LEFT JOIN tracks t ON t.id = p.track_id
     ORDER BY COALESCE(p.anchor_ms, r.created_at) DESC
     LIMIT 30`,
    [now - PRESENCE_MS],
  );

  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    listeners: row.listeners,
    title: row.title,
    author: row.author,
    thumbnail: row.thumbnail,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function getLiveNow(): Promise<LiveNow> {
  const now = Date.now();
  const row = await queryOne<{
    code: string;
    name: string;
    listeners: number;
    title: string | null;
    author: string | null;
    thumbnail: string | null;
    youtube_id: string | null;
    duration_sec: number | null;
    status: PlaybackStatus;
    position_ms: number;
    anchor_ms: number;
  }>(
    `SELECT
       r.code,
       r.name,
       (SELECT COUNT(*)::int FROM members m WHERE m.room_id = r.id AND m.last_seen >= ?) AS listeners,
       t.title,
       t.author,
       t.thumbnail,
       t.youtube_id,
       t.duration_sec,
       p.status,
       p.position_ms,
       p.anchor_ms
     FROM rooms r
     JOIN playback p ON p.room_id = r.id
     LEFT JOIN tracks t ON t.id = p.track_id
     WHERE EXISTS (
       SELECT 1 FROM members m
       WHERE m.room_id = r.id AND m.last_seen >= ?
     )
     ORDER BY CASE p.status WHEN 'playing' THEN 0 ELSE 1 END, p.anchor_ms DESC
     LIMIT 1`,
    [now - PRESENCE_MS, now - PRESENCE_MS],
  );

  if (!row) {
    return {
      serverNow: now,
      roomCode: null,
      roomName: null,
      listeners: 0,
      title: null,
      author: null,
      thumbnail: null,
      youtubeId: null,
      status: "idle",
      positionMs: 0,
      anchorMs: now,
      durationSec: null,
    };
  }

  return {
    serverNow: now,
    roomCode: row.code,
    roomName: row.name,
    listeners: row.listeners,
    title: row.title,
    author: row.author,
    thumbnail: row.thumbnail,
    youtubeId: row.youtube_id,
    status: row.status,
    positionMs: row.position_ms,
    anchorMs: row.anchor_ms,
    durationSec: row.duration_sec,
  };
}

export async function createRoom(input: {
  name?: unknown;
  memberId: unknown;
  memberName: unknown;
  emoji?: unknown;
  deviceId?: unknown;
  deviceLabel?: unknown;
}) {
  const memberId = cleanId(input.memberId);
  // The device that opens the room is its speaker; a client that sends none leaves it unclaimed.
  const device = typeof input.deviceId === "string" && DEVICE_ID.test(input.deviceId) ? input.deviceId : null;
  const deviceLabel = device ? cleanLabel(input.deviceLabel) : null;
  const memberName = cleanName(input.memberName, "ชื่อ", 32);
  const emoji = animalOrSeed(input.emoji, memberId);
  const requested =
    typeof input.name === "string" && input.name.trim()
      ? cleanName(input.name, "ชื่อห้อง", 48)
      : `ห้องของ ${memberName}`.slice(0, 48);
  const recent = await queryOne<{ n: number }>("SELECT COUNT(*)::int AS n FROM rooms WHERE created_at >= ?", [
    Date.now() - 60_000,
  ]);
  if ((recent?.n ?? 0) >= ROOMS_PER_MINUTE) {
    throw new ArchiveError("มีคนเปิดห้องพร้อมกันมากเกินไป ลองใหม่ในอีกสักครู่", 429);
  }
  const now = Date.now();
  const insert = (code: string) => withTransaction(async () => {
    const id = randomUUID();
    await execute(
      `INSERT INTO rooms (id, code, name, opened_by, created_at, speaker_mode, main_device, main_label, main_seen)
       VALUES (?, ?, ?, ?, ?, 'single', ?, ?, ?)`,
      [id, code, requested, memberId, now, device, deviceLabel, device ? now : 0],
    );
    await execute(
      "INSERT INTO playback (room_id, track_id, status, position_ms, anchor_ms) VALUES (?, NULL, 'idle', 0, ?)",
      [id, now],
    );
    await execute(
      `INSERT INTO members (id, room_id, name, hue, emoji, last_seen)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id, room_id) DO UPDATE SET
         name = excluded.name,
         hue = excluded.hue,
         emoji = excluded.emoji,
         last_seen = excluded.last_seen`,
      [memberId, id, memberName, hueFromName(memberName), emoji, now],
    );
    return code;
  });

  let code = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    code = makeCode();
    try {
      await insert(code);
      return snapshot(code);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new ArchiveError("เปิดห้องไม่สำเร็จ ลองอีกครั้ง", 500);
}

export async function closeRoom(code: string, memberId: unknown, memberName?: unknown) {
  const id = cleanId(memberId);
  const room = await requireRoom(code);
  if (!isSuperAdmin(memberName) && room.opened_by !== id) {
    throw new ArchiveError("มีแค่คนเปิดห้องที่ปิดได้", 403);
  }
  await withTransaction(async () => {
    await lockRoom(room.id, "update");
    await execute("DELETE FROM tracks WHERE room_id = ?", [room.id]);
    await execute("DELETE FROM playback WHERE room_id = ?", [room.id]);
    await execute("DELETE FROM members WHERE room_id = ?", [room.id]);
    await execute("DELETE FROM rooms WHERE id = ?", [room.id]);
  });
  forget(snapshotKey(room.code));
}

export async function joinRoom(code: string, memberId: unknown, memberName: unknown, emoji?: unknown, deviceId?: unknown) {
  const room = await requireRoom(code);
  const id = cleanId(memberId);
  const name = cleanName(memberName, "ชื่อ", 32);
  const animal = animalOrSeed(emoji, id);
  const now = Date.now();
  // Under the room lock like every other mutation: a join racing a close sees 404, not an FK 500.
  // The snapshot is built in the same transaction, so close can't slip in before it.
  return mutateThenSnapshot(room.code, async () => {
    await lockRoom(room.id);
    await assertRoomHasSpace(room.id, id, now);
    await touchMainSpeaker(room.code, deviceId, now);
    await execute(
      `INSERT INTO members (id, room_id, name, hue, emoji, last_seen)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id, room_id) DO UPDATE SET
         name = excluded.name,
         hue = excluded.hue,
         emoji = excluded.emoji,
         last_seen = excluded.last_seen`,
      [id, room.id, name, hueFromName(name), animal, now],
    );
  });
}

async function assertRoomHasSpace(roomId: string, memberId: string, now: number) {
  const row = await queryOne<{ n: number; known: boolean }>(
    `SELECT COUNT(*) FILTER (WHERE last_seen >= ?)::int AS n,
            COALESCE(BOOL_OR(id = ?), FALSE) AS known
     FROM members WHERE room_id = ?`,
    [now - PRESENCE_MS, memberId, roomId],
  );
  if (!row?.known && (row?.n ?? 0) >= MEMBERS_LIMIT) {
    throw new ArchiveError("ห้องนี้เต็มแล้ว", 403);
  }
}

/**
 * Presence ping: one statement, no lock and no snapshot. (A heartbeat used to be a full join:
 * a locked transaction plus a snapshot nobody read, once per listener every 20s.)
 */
export async function beatRoom(code: string, memberId: unknown, memberName: unknown, emoji?: unknown, deviceId?: unknown) {
  if (unmatchableCode(code)) throw new ArchiveError("ไม่พบห้องนี้ใน MULIA", 404);
  const id = cleanId(memberId);
  const name = cleanName(memberName, "ชื่อ", 32);
  const animal = animalOrSeed(emoji, id);
  const now = Date.now();
  const touched = await execute(
    `INSERT INTO members (id, room_id, name, hue, emoji, last_seen)
     SELECT ?, r.id, ?, ?, ?, ? FROM rooms r WHERE r.code = ?
     ON CONFLICT(id, room_id) DO UPDATE SET
       name = excluded.name,
       hue = excluded.hue,
       emoji = excluded.emoji,
       last_seen = excluded.last_seen`,
    [id, name, hueFromName(name), animal, now, normalizeCode(code)],
  ).catch((error: unknown) => {
    // the room was closed between the insert's lookup and its foreign-key check
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "23503") return 0;
    throw error;
  });
  if (touched === 0) throw new ArchiveError("ไม่พบห้องนี้ใน MULIA", 404);
  await touchMainSpeaker(code, deviceId, now);
}

function cleanDevice(value: unknown) {
  if (typeof value !== "string" || !DEVICE_ID.test(value)) throw new ArchiveError("ไม่รู้จักเครื่องนี้");
  return value;
}

function cleanLabel(value: unknown) {
  const label = typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 32) : "";
  return label || "เครื่องลำโพง";
}

/** Move the main speaker to this device (single mode). The previous speaker learns from its next poll. */
export async function claimSpeaker(code: string, deviceId: unknown, label?: unknown) {
  const room = await requireRoom(code);
  const device = cleanDevice(deviceId);
  const name = cleanLabel(label);
  const now = Date.now();
  return mutateThenSnapshot(room.code, async () => {
    await lockRoom(room.id);
    const changed = await execute(
      "UPDATE rooms SET main_device = ?, main_label = ?, main_seen = ? WHERE id = ? AND speaker_mode = 'single'",
      [device, name, now, room.id],
    );
    if (changed === 0) throw new ArchiveError("ห้องนี้เปิดโหมดทุกเครื่องฟัง ไม่มีลำโพงหลัก", 409);
  });
}

/** Switch the room between one main speaker and everyone playing; allowed while listening. */
export async function setSpeakerMode(code: string, mode: unknown, deviceId?: unknown, label?: unknown) {
  if (mode !== "single" && mode !== "all") throw new ArchiveError("ไม่รู้จักโหมดนี้");
  const room = await requireRoom(code);
  const now = Date.now();
  if (mode === "single") {
    // the device that switches becomes the speaker, so there is never a "single" room with nobody holding it
    const device = cleanDevice(deviceId);
    const name = cleanLabel(label);
    return mutateThenSnapshot(room.code, async () => {
      await lockRoom(room.id);
      await execute(
        "UPDATE rooms SET speaker_mode = 'single', main_device = ?, main_label = ?, main_seen = ? WHERE id = ?",
        [device, name, now, room.id],
      );
    });
  }
  return mutateThenSnapshot(room.code, async () => {
    await lockRoom(room.id);
    await execute(
      "UPDATE rooms SET speaker_mode = 'all', main_device = NULL, main_label = NULL, main_seen = 0 WHERE id = ?",
      [room.id],
    );
  });
}

async function touchMainSpeaker(code: string, deviceId: unknown, now: number) {
  if (typeof deviceId !== "string" || !DEVICE_ID.test(deviceId)) return;
  await execute("UPDATE rooms SET main_seen = ? WHERE code = ? AND main_device = ?", [now, normalizeCode(code), deviceId]);
}

/** Tracks that still count toward the queue limit (played ones don't). */
async function unplayedCount(roomId: string) {
  const row = await queryOne<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM tracks WHERE room_id = ? AND status <> 'played'",
    [roomId],
  );
  return row?.n ?? 0;
}

async function lookupVideo(youtubeId: string) {
  const fallback = {
    title: "บันทึกไม่มีชื่อ",
    author: "YouTube",
    thumbnail: safeThumbnail(undefined, youtubeId),
  };
  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${youtubeId}`,
    )}&format=json`;
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) return fallback;
    const data = (await response.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    return {
      title: (data.title || fallback.title).slice(0, 180),
      author: (data.author_name || fallback.author).slice(0, 120),
      thumbnail: safeThumbnail(data.thumbnail_url, youtubeId),
    };
  } catch {
    return fallback;
  }
}

export async function enqueue(code: string, url: unknown, memberName: unknown) {
  const room = await requireRoom(code);
  const name = cleanName(memberName, "ชื่อ", 32);
  if (typeof url !== "string") {
    throw new ArchiveError("วางลิงก์ YouTube หรือ YouTube Music");
  }
  const youtubeId = parseYoutubeUrl(url);
  if (!youtubeId) {
    throw new ArchiveError("ลิงก์นี้ต้องเป็นวิดีโอจาก YouTube หรือ YouTube Music");
  }

  // Fast path (no oEmbed fetch for a full queue); the authoritative check is in the transaction.
  if ((await unplayedCount(room.id)) >= QUEUE_LIMIT) {
    throw new ArchiveError("คิวเต็มแล้ว นำเพลงออกก่อนเพิ่มเพลงใหม่");
  }

  const meta = await lookupVideo(youtubeId);
  const now = Date.now();
  const trackId = randomUUID();
  return mutateThenSnapshot(room.code, async () => {
    await lockRoom(room.id);
    if ((await unplayedCount(room.id)) >= QUEUE_LIMIT) {
      throw new ArchiveError("คิวเต็มแล้ว นำเพลงออกก่อนเพิ่มเพลงใหม่");
    }
    await execute(
      `INSERT INTO tracks (
         id, room_id, youtube_id, title, author, thumbnail, duration_sec, added_by, added_at, status
       ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 'queued')`,
      [trackId, room.id, youtubeId, meta.title, meta.author, meta.thumbnail, name, now],
    );
    await execute(
      `DELETE FROM tracks
       WHERE room_id = ? AND status = 'played' AND id NOT IN (
         SELECT id FROM tracks WHERE room_id = ? AND status = 'played'
         ORDER BY added_at DESC, id DESC LIMIT ?
       )`,
      [room.id, room.id, PLAYED_KEEP],
    );
    const playback = await playbackOf(room.id);
    if (playback.status === "idle" || !playback.track_id) await startTrack(room.id, trackId, now);
  });
}

export async function reorderQueued(code: string, orderedIds: unknown) {
  const room = await requireRoom(code);
  if (!Array.isArray(orderedIds) || orderedIds.length > REORDER_LIMIT) {
    throw new ArchiveError("ลำดับคิวไม่ถูกต้อง");
  }
  const wanted = orderedIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  if (new Set(wanted).size !== wanted.length) {
    throw new ArchiveError("ลำดับคิวไม่ถูกต้อง");
  }

  const rows = await query<{ id: string }>(
    `SELECT id FROM tracks
     WHERE room_id = ?
     ORDER BY added_at ASC, id ASC`,
    [room.id],
  );
  const current = new Set(rows.map((row) => row.id));
  const next = [
    ...wanted.filter((id) => current.has(id)),
    ...rows.map((row) => row.id).filter((id) => !wanted.includes(id)),
  ];
  const unchanged = next.every((id, index) => id === rows[index]?.id);
  if (unchanged) return snapshot(room.code);

  const base = Date.now();
  return mutateThenSnapshot(room.code, async () => {
    await lockRoom(room.id);
    for (const [index, id] of next.entries()) {
      await execute(
        "UPDATE tracks SET added_at = ? WHERE id = ? AND room_id = ?",
        [base + index, id, room.id],
      );
    }
  });
}

export async function playQueued(code: string, trackId: unknown) {
  const room = await requireRoom(code);
  if (typeof trackId !== "string" || !trackId) {
    throw new ArchiveError("เลือกเพลงที่จะเล่น");
  }
  const now = Date.now();
  return mutateThenSnapshot(room.code, async () => {
    await lockRoom(room.id);
    const row = await queryOne<{ id: string }>(
      "SELECT id FROM tracks WHERE id = ? AND room_id = ?",
      [trackId, room.id],
    );
    if (!row) throw new ArchiveError("เพลงนี้ไม่อยู่ในคิวแล้ว", 404);
    await startTrack(room.id, trackId, now);
  });
}

export async function removeQueued(code: string, trackId: unknown) {
  const room = await requireRoom(code);
  if (typeof trackId !== "string" || !trackId) {
    throw new ArchiveError("เลือกเพลงที่จะนำออก");
  }
  const now = Date.now();
  return mutateThenSnapshot(room.code, async () => {
    await lockRoom(room.id);
    const playback = await playbackOf(room.id);
    if (playback.track_id === trackId) {
      const next = (await neighborTrack(room.id, trackId, 1)) ?? (await neighborTrack(room.id, trackId, -1));
      if (next) await startTrack(room.id, next.id, now);
      else await setPlayback(room.id, null, "idle", 0, now);
    }
    const changes = await execute(
      "DELETE FROM tracks WHERE id = ? AND room_id = ?",
      [trackId, room.id],
    );
    if (changes === 0) {
      throw new ArchiveError("เพลงนี้ไม่อยู่ในคิวแล้ว", 404);
    }
  });
}

function cleanMs(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

export async function applyPlayback(
  code: string,
  action: unknown,
  extras: { positionMs?: unknown; trackId?: unknown; durationSec?: unknown },
) {
  const room = await requireRoom(code);
  const now = Date.now();

  return mutateThenSnapshot(room.code, async () => {
    await lockRoom(room.id);
    const playback = await playbackOf(room.id);

    if (action === "duration") {
      const seconds = extras.durationSec;
      if (typeof seconds !== "number" || seconds <= 0 || seconds > 60 * 60 * 12) return;
      if (typeof extras.trackId !== "string") return;
      await execute(
        "UPDATE tracks SET duration_sec = ? WHERE id = ? AND room_id = ? AND (duration_sec IS NULL OR duration_sec != ?)",
        [Math.round(seconds), extras.trackId, room.id, Math.round(seconds)],
      );
      return;
    }

    if (action === "play") {
      if (playback.track_id && playback.status !== "idle") {
        let position =
          playback.status === "playing" ? await computedPosition(playback, now) : playback.position_ms;
        const cap = await durationMsOf(playback.track_id);
        if (cap !== null && position >= cap - 500) position = 0;
        await setPlayback(room.id, playback.track_id, "playing", position, now);
        return;
      }
      const next = await neighborTrack(room.id, null, 1);
      if (next) await startTrack(room.id, next.id, now);
      return;
    }

    if (action === "pause") {
      if (playback.status !== "playing" || !playback.track_id) return;
      await setPlayback(
        room.id,
        playback.track_id,
        "paused",
        await computedPosition(playback, now),
        now,
      );
      return;
    }

    if (action === "seek") {
      if (!playback.track_id || playback.status === "idle") return;
      const position = cleanMs(extras.positionMs);
      if (position === null) throw new ArchiveError("เลือกตำแหน่งในเพลง");
      const cap = (await durationMsOf(playback.track_id)) ?? position;
      const status = playback.status === "playing" ? "playing" : "paused";
      await setPlayback(room.id, playback.track_id, status, Math.min(position, cap), now);
      return;
    }

    if (action === "next") {
      // When the client says which track it is skipping, a repeated/concurrent "next"
      // for the same track advances only once.
      await advance(room.id, now, typeof extras.trackId === "string" ? extras.trackId : undefined);
      return;
    }

    if (action === "ended") {
      if (typeof extras.trackId !== "string") return;
      await advance(room.id, now, extras.trackId);
      return;
    }

    if (action === "previous") {
      if (!playback.track_id) return;
      const position = await computedPosition(playback, now);
      if (position > 3000) {
        const status = playback.status === "paused" ? "paused" : "playing";
        await setPlayback(room.id, playback.track_id, status, 0, now);
        return;
      }
      const previous = await neighborTrack(room.id, playback.track_id, -1);
      if (!previous) {
        const status = playback.status === "paused" ? "paused" : "playing";
        await setPlayback(room.id, playback.track_id, status, 0, now);
        return;
      }
      await startTrack(room.id, previous.id, now);
      return;
    }

    throw new ArchiveError("ไม่รู้จักคำสั่งเล่นนี้");
  });
}
