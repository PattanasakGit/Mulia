import { randomInt, randomUUID } from "node:crypto";
import { getDb, withTransaction } from "@/lib/db";
import { animalOrSeed } from "@/lib/animals";
import { hueFromName } from "@/lib/hue";
import type {
  LiveNow,
  Playback,
  PlaybackStatus,
  RoomCard,
  RoomSnapshot,
  Track,
} from "@/lib/types";
import { parseYoutubeUrl, safeThumbnail } from "@/lib/youtube";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PRESENCE_MS = 90_000;
const QUEUE_LIMIT = 100;

export class ArchiveError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type RoomRow = { id: string; code: string; name: string; created_at: number };
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

function requireRoom(code: string) {
  const room = getDb()
    .prepare("SELECT id, code, name, created_at FROM rooms WHERE code = ?")
    .get(normalizeCode(code)) as RoomRow | undefined;
  if (!room) throw new ArchiveError("ไม่พบห้องนี้ใน MULIA", 404);
  return room;
}

function playbackOf(roomId: string) {
  const row = getDb()
    .prepare(
      "SELECT track_id, status, position_ms, anchor_ms FROM playback WHERE room_id = ?",
    )
    .get(roomId) as PlaybackRow | undefined;
  if (!row) throw new ArchiveError("ห้องนี้ยังไม่มีสถานะการเล่น", 500);
  return row;
}

function durationMsOf(trackId: string | null) {
  if (!trackId) return null;
  const row = getDb()
    .prepare("SELECT duration_sec FROM tracks WHERE id = ?")
    .get(trackId) as { duration_sec: number | null } | undefined;
  if (!row?.duration_sec || row.duration_sec <= 0) return null;
  return row.duration_sec * 1000;
}

function computedPosition(row: PlaybackRow, now: number) {
  const raw = row.status === "playing"
    ? row.position_ms + Math.max(0, now - row.anchor_ms)
    : row.position_ms;
  const cap = durationMsOf(row.track_id);
  if (cap === null) return raw;
  return Math.min(raw, cap);
}

function healPlayback(roomId: string, now: number) {
  const playback = playbackOf(roomId);
  if (!playback.track_id || playback.status === "idle") return;
  const cap = durationMsOf(playback.track_id);
  if (cap === null) return;
  const raw = playback.status === "playing"
    ? playback.position_ms + Math.max(0, now - playback.anchor_ms)
    : playback.position_ms;
  if (raw <= cap + 1000) return;
  if (neighborTrack(roomId, playback.track_id, 1)) {
    advance(roomId, now, playback.track_id);
    return;
  }
  setPlayback(roomId, playback.track_id, "paused", cap, now);
}

function setPlayback(
  roomId: string,
  trackId: string | null,
  status: PlaybackStatus,
  positionMs: number,
  now: number,
) {
  getDb()
    .prepare(
      `UPDATE playback
       SET track_id = ?, status = ?, position_ms = ?, anchor_ms = ?
       WHERE room_id = ?`,
    )
    .run(trackId, status, Math.max(0, Math.round(positionMs)), now, roomId);
}

function startTrack(roomId: string, trackId: string, now: number) {
  const db = getDb();
  db.prepare(
    "UPDATE tracks SET status = 'played' WHERE room_id = ? AND status = 'current'",
  ).run(roomId);
  const result = db
    .prepare("UPDATE tracks SET status = 'current' WHERE id = ? AND room_id = ?")
    .run(trackId, roomId);
  if (result.changes === 0) throw new ArchiveError("ไม่พบเพลงนี้แล้ว", 404);
  setPlayback(roomId, trackId, "playing", 0, now);
}

function neighborTrack(roomId: string, trackId: string | null, direction: 1 | -1) {
  const rows = getDb()
    .prepare(
      `SELECT id FROM tracks
       WHERE room_id = ?
       ORDER BY added_at ASC, id ASC`,
    )
    .all(roomId) as { id: string }[];
  if (rows.length === 0) return undefined;
  if (!trackId) return direction === 1 ? rows[0] : undefined;
  const index = rows.findIndex((row) => row.id === trackId);
  if (index < 0) return direction === 1 ? rows[0] : undefined;
  return rows[index + direction];
}

function advance(roomId: string, now: number, expectedTrackId?: string) {
  const playback = playbackOf(roomId);
  if (expectedTrackId && playback.track_id !== expectedTrackId) return;
  const next = neighborTrack(roomId, playback.track_id, 1);
  if (next) {
    startTrack(roomId, next.id, now);
    return;
  }
  if (!playback.track_id) return;
  const cap = durationMsOf(playback.track_id) ?? playback.position_ms;
  setPlayback(roomId, playback.track_id, "paused", cap, now);
}

export function getSnapshot(code: string): RoomSnapshot | null {
  const room = getDb()
    .prepare("SELECT id, code, name, created_at FROM rooms WHERE code = ?")
    .get(normalizeCode(code)) as RoomRow | undefined;
  if (!room) return null;

  const now = Date.now();
  healPlayback(room.id, now);
  const db = getDb();
  const members = (
    db
      .prepare(
        `SELECT id, name, hue, emoji FROM members
         WHERE room_id = ? AND last_seen >= ?
         ORDER BY name COLLATE NOCASE ASC`,
      )
      .all(room.id, now - PRESENCE_MS) as {
      id: string;
      name: string;
      hue: number;
      emoji: string | null;
    }[]
  ).map((member) => ({
    id: member.id,
    name: member.name,
    hue: member.hue,
    emoji: animalOrSeed(member.emoji, member.id),
  }));

  const tracks = db
    .prepare(
      `SELECT t.id, t.youtube_id, t.title, t.author, t.thumbnail, t.duration_sec, t.added_by, t.status,
              m.id AS adder_id, m.hue AS adder_hue, m.emoji AS adder_emoji
       FROM tracks t
       LEFT JOIN members m ON m.room_id = t.room_id AND m.id = (
         SELECT id FROM members
         WHERE room_id = t.room_id AND name = t.added_by
         ORDER BY last_seen DESC
         LIMIT 1
       )
       WHERE t.room_id = ?
       ORDER BY t.added_at ASC, t.id ASC`,
    )
    .all(room.id) as TrackRow[];

  const playback = playbackOf(room.id);
  const current = tracks.find((track) => track.status === "current") ?? null;

  return {
    serverNow: now,
    room: {
      id: room.id,
      code: room.code,
      name: room.name,
      createdAt: room.created_at,
    },
    members,
    current: current ? presentTrack(current) : null,
    queue: tracks.map(presentTrack),
    playback: {
      status: playback.status,
      positionMs: playback.position_ms,
      anchorMs: playback.anchor_ms,
      trackId: playback.track_id,
    } satisfies Playback,
  };
}

function snapshot(code: string) {
  const value = getSnapshot(code);
  if (!value) throw new ArchiveError("ไม่พบห้องนี้ใน MULIA", 404);
  return value;
}

export function listRooms(): RoomCard[] {
  const now = Date.now();
  const rows = getDb()
    .prepare(
      `SELECT
         r.code,
         r.name,
         r.created_at,
         (SELECT COUNT(*) FROM members m WHERE m.room_id = r.id AND m.last_seen >= ?) AS listeners,
         t.title,
         t.author,
         t.thumbnail,
         COALESCE(p.status, 'idle') AS status
       FROM rooms r
       LEFT JOIN playback p ON p.room_id = r.id
       LEFT JOIN tracks t ON t.id = p.track_id
       ORDER BY COALESCE(p.anchor_ms, r.created_at) DESC
       LIMIT 30`,
    )
    .all(now - PRESENCE_MS) as Array<{
    code: string;
    name: string;
    created_at: number;
    listeners: number;
    title: string | null;
    author: string | null;
    thumbnail: string | null;
    status: PlaybackStatus;
  }>;

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

export function getLiveNow(): LiveNow {
  const now = Date.now();
  const row = getDb()
    .prepare(
      `SELECT
         r.code,
         r.name,
         (SELECT COUNT(*) FROM members m WHERE m.room_id = r.id AND m.last_seen >= ?) AS listeners,
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
    )
    .get(now - PRESENCE_MS, now - PRESENCE_MS) as
    | {
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
      }
    | undefined;

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

export function createRoom(input: {
  name?: unknown;
  memberId: unknown;
  memberName: unknown;
  emoji?: unknown;
}) {
  const memberId = cleanId(input.memberId);
  const memberName = cleanName(input.memberName, "ชื่อ", 32);
  const emoji = animalOrSeed(input.emoji, memberId);
  const requested =
    typeof input.name === "string" && input.name.trim()
      ? cleanName(input.name, "ชื่อห้อง", 48)
      : `ห้องของ ${memberName}`.slice(0, 48);
  const db = getDb();
  const now = Date.now();
  const insert = (code: string) => withTransaction(() => {
    const id = randomUUID();
    db.prepare("INSERT INTO rooms (id, code, name, created_at) VALUES (?, ?, ?, ?)").run(
      id,
      code,
      requested,
      now,
    );
    db.prepare(
      "INSERT INTO playback (room_id, track_id, status, position_ms, anchor_ms) VALUES (?, NULL, 'idle', 0, ?)",
    ).run(id, now);
    db.prepare(
      `INSERT INTO members (id, room_id, name, hue, emoji, last_seen)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id, room_id) DO UPDATE SET
         name = excluded.name,
         hue = excluded.hue,
         emoji = excluded.emoji,
         last_seen = excluded.last_seen`,
    ).run(memberId, id, memberName, hueFromName(memberName), emoji, now);
    return code;
  });

  let code = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    code = makeCode();
    try {
      insert(code);
      return snapshot(code);
    } catch (error) {
      const unique =
        error instanceof Error && error.message.toLowerCase().includes("unique");
      if (!unique) throw error;
    }
  }
  throw new ArchiveError("เปิดห้องไม่สำเร็จ ลองอีกครั้ง", 500);
}

export function joinRoom(code: string, memberId: unknown, memberName: unknown, emoji?: unknown) {
  const room = requireRoom(code);
  const id = cleanId(memberId);
  const name = cleanName(memberName, "ชื่อ", 32);
  const animal = animalOrSeed(emoji, id);
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO members (id, room_id, name, hue, emoji, last_seen)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id, room_id) DO UPDATE SET
         name = excluded.name,
         hue = excluded.hue,
         emoji = excluded.emoji,
         last_seen = excluded.last_seen`,
    )
    .run(id, room.id, name, hueFromName(name), animal, now);
  return snapshot(room.code);
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
  const room = requireRoom(code);
  const name = cleanName(memberName, "ชื่อ", 32);
  if (typeof url !== "string") {
    throw new ArchiveError("วางลิงก์ YouTube หรือ YouTube Music");
  }
  const youtubeId = parseYoutubeUrl(url);
  if (!youtubeId) {
    throw new ArchiveError("ลิงก์นี้ต้องเป็นวิดีโอจาก YouTube หรือ YouTube Music");
  }

  const db = getDb();
  const waiting = db
    .prepare("SELECT COUNT(*) AS n FROM tracks WHERE room_id = ?")
    .get(room.id) as { n: number };
  if (waiting.n >= QUEUE_LIMIT) {
    throw new ArchiveError("คิวเต็มแล้ว นำเพลงออกก่อนเพิ่มเพลงใหม่");
  }

  const meta = await lookupVideo(youtubeId);
  const now = Date.now();
  const trackId = randomUUID();
  const insert = () => withTransaction(() => {
    db.prepare(
      `INSERT INTO tracks (
         id, room_id, youtube_id, title, author, thumbnail, duration_sec, added_by, added_at, status
       ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 'queued')`,
    ).run(
      trackId,
      room.id,
      youtubeId,
      meta.title,
      meta.author,
      meta.thumbnail,
      name,
      now,
    );
    const playback = playbackOf(room.id);
    if (playback.status === "idle" || !playback.track_id) startTrack(room.id, trackId, now);
  });
  insert();
  return snapshot(room.code);
}

export function reorderQueued(code: string, orderedIds: unknown) {
  const room = requireRoom(code);
  if (!Array.isArray(orderedIds) || orderedIds.length > QUEUE_LIMIT) {
    throw new ArchiveError("ลำดับคิวไม่ถูกต้อง");
  }
  const wanted = orderedIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  if (new Set(wanted).size !== wanted.length) {
    throw new ArchiveError("ลำดับคิวไม่ถูกต้อง");
  }

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id FROM tracks
       WHERE room_id = ?
       ORDER BY added_at ASC, id ASC`,
    )
    .all(room.id) as { id: string }[];
  const current = new Set(rows.map((row) => row.id));
  const next = [
    ...wanted.filter((id) => current.has(id)),
    ...rows.map((row) => row.id).filter((id) => !wanted.includes(id)),
  ];
  const unchanged = next.every((id, index) => id === rows[index]?.id);
  if (unchanged) return snapshot(room.code);

  const base = Date.now();
  withTransaction(() => {
    const update = db.prepare(
      "UPDATE tracks SET added_at = ? WHERE id = ? AND room_id = ?",
    );
    next.forEach((id, index) => update.run(base + index, id, room.id));
  });
  return snapshot(room.code);
}

export function playQueued(code: string, trackId: unknown) {
  const room = requireRoom(code);
  if (typeof trackId !== "string" || !trackId) {
    throw new ArchiveError("เลือกเพลงที่จะเล่น");
  }
  const db = getDb();
  const now = Date.now();
  const run = () => withTransaction(() => {
    const row = db
      .prepare("SELECT id FROM tracks WHERE id = ? AND room_id = ?")
      .get(trackId, room.id) as { id: string } | undefined;
    if (!row) throw new ArchiveError("เพลงนี้ไม่อยู่ในคิวแล้ว", 404);
    startTrack(room.id, trackId, now);
  });
  run();
  return snapshot(room.code);
}

export function removeQueued(code: string, trackId: unknown) {
  const room = requireRoom(code);
  if (typeof trackId !== "string" || !trackId) {
    throw new ArchiveError("เลือกเพลงที่จะนำออก");
  }
  const db = getDb();
  const now = Date.now();
  const run = () => withTransaction(() => {
    const playback = playbackOf(room.id);
    if (playback.track_id === trackId) {
      const next = neighborTrack(room.id, trackId, 1) ?? neighborTrack(room.id, trackId, -1);
      if (next) startTrack(room.id, next.id, now);
      else setPlayback(room.id, null, "idle", 0, now);
    }
    const result = db
      .prepare("DELETE FROM tracks WHERE id = ? AND room_id = ?")
      .run(trackId, room.id);
    if (result.changes === 0) {
      throw new ArchiveError("เพลงนี้ไม่อยู่ในคิวแล้ว", 404);
    }
  });
  run();
  return snapshot(room.code);
}

function cleanMs(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

export function applyPlayback(
  code: string,
  action: unknown,
  extras: { positionMs?: unknown; trackId?: unknown; durationSec?: unknown },
) {
  const room = requireRoom(code);
  const now = Date.now();
  const db = getDb();

  const run = () => withTransaction(() => {
    const playback = playbackOf(room.id);

    if (action === "duration") {
      const seconds = extras.durationSec;
      if (typeof seconds !== "number" || seconds <= 0 || seconds > 60 * 60 * 12) return;
      if (typeof extras.trackId !== "string") return;
      db.prepare(
        "UPDATE tracks SET duration_sec = ? WHERE id = ? AND room_id = ? AND (duration_sec IS NULL OR duration_sec != ?)",
      ).run(Math.round(seconds), extras.trackId, room.id, Math.round(seconds));
      return;
    }

    if (action === "play") {
      if (playback.track_id && playback.status !== "idle") {
        let position =
          playback.status === "playing" ? computedPosition(playback, now) : playback.position_ms;
        const cap = durationMsOf(playback.track_id);
        if (cap !== null && position >= cap - 500) position = 0;
        setPlayback(room.id, playback.track_id, "playing", position, now);
        return;
      }
      const next = neighborTrack(room.id, null, 1);
      if (next) startTrack(room.id, next.id, now);
      return;
    }

    if (action === "pause") {
      if (playback.status !== "playing" || !playback.track_id) return;
      setPlayback(room.id, playback.track_id, "paused", computedPosition(playback, now), now);
      return;
    }

    if (action === "seek") {
      if (!playback.track_id || playback.status === "idle") return;
      const position = cleanMs(extras.positionMs);
      if (position === null) throw new ArchiveError("เลือกตำแหน่งในเพลง");
      const cap = durationMsOf(playback.track_id) ?? position;
      const status = playback.status === "playing" ? "playing" : "paused";
      setPlayback(room.id, playback.track_id, status, Math.min(position, cap), now);
      return;
    }

    if (action === "next") {
      advance(room.id, now);
      return;
    }

    if (action === "ended") {
      if (typeof extras.trackId !== "string") return;
      advance(room.id, now, extras.trackId);
      return;
    }

    if (action === "previous") {
      if (!playback.track_id) return;
      const position = computedPosition(playback, now);
      if (position > 3000) {
        const status = playback.status === "paused" ? "paused" : "playing";
        setPlayback(room.id, playback.track_id, status, 0, now);
        return;
      }
      const previous = neighborTrack(room.id, playback.track_id, -1);
      if (!previous) {
        const status = playback.status === "paused" ? "paused" : "playing";
        setPlayback(room.id, playback.track_id, status, 0, now);
        return;
      }
      startTrack(room.id, previous.id, now);
      return;
    }

    throw new ArchiveError("ไม่รู้จักคำสั่งเล่นนี้");
  });

  run();
  return snapshot(room.code);
}
