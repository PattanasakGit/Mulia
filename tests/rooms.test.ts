import { beforeEach, describe, expect, it } from "vitest";
import { execute, queryOne } from "@/lib/db";
import {
  ArchiveError, applyPlayback, closeRoom, createRoom, enqueue, getLiveNow, getSnapshot,
  joinRoom, listRooms, normalizeCode, playQueued, removeQueued, reorderQueued,
} from "@/lib/rooms";
import { A, B, resetAll, tick, vid } from "./helpers";

beforeEach(resetAll);

async function room(name?: string) {
  return createRoom({ name, memberId: A, memberName: "  Dev   P ", emoji: "x" });
}
async function withTracks(n: number) {
  const r = await room();
  let s = r;
  for (let i = 1; i <= n; i += 1) { tick(1); s = await enqueue(r.room.code, vid(i), "Dev"); }
  return s;
}
const err = (p: Promise<unknown>) => p.then(() => { throw new Error("no throw"); }, (e: ArchiveError) => e);

describe("rooms: create/join/list", () => {
  it("creates a room with code, idle playback and opener as member", async () => {
    const s = await room();
    expect(s.room.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(s.room.name).toBe("ห้องของ Dev P");
    expect(s.room.openedBy).toBe(A);
    expect(s.members.map((m) => m.name)).toEqual(["Dev P"]);
    expect(s.playback).toMatchObject({ status: "idle", positionMs: 0, trackId: null });
    expect(s.queue).toEqual([]);
  });
  it("uses a custom name and validates input", async () => {
    expect((await room(" Jazz ")).room.name).toBe("Jazz");
    expect((await err(createRoom({ memberId: "nope", memberName: "a" }))).status).toBe(400);
    expect((await err(createRoom({ memberId: A, memberName: "" }))).status).toBe(400);
    expect((await err(createRoom({ memberId: A, memberName: 5 }))).status).toBe(400);
    expect((await err(createRoom({ memberId: A, memberName: "a".repeat(33) }))).status).toBe(400);
    expect((await err(createRoom({ name: "n".repeat(49), memberId: A, memberName: "a" }))).status).toBe(400);
  });
  it("join adds member (case-insensitive code) and presence expires after 90s", async () => {
    const s = await room();
    const j = await joinRoom(s.room.code.toLowerCase(), B, "Bee");
    expect(j.members.map((m) => m.name).sort()).toEqual(["Bee", "Dev P"]);
    tick(91_000);
    expect((await getSnapshot(s.room.code))!.members).toEqual([]);
    expect((await err(joinRoom("ZZZZZZ", B, "Bee"))).status).toBe(404);
    expect(await getSnapshot("ZZZZZZ")).toBeNull();
    expect(normalizeCode(" ab ")).toBe("AB");
  });
  it("listRooms and getLiveNow", async () => {
    expect((await getLiveNow()).roomCode).toBeNull();
    const s = await withTracks(1);
    const list = await listRooms();
    expect(list[0]).toMatchObject({ code: s.room.code, listeners: 1, status: "playing", title: `T-${"1".padStart(11, "v")}` });
    const live = await getLiveNow();
    expect(live).toMatchObject({ roomCode: s.room.code, listeners: 1, status: "playing" });
  });
});

describe("rooms: queue", () => {
  it("first enqueue auto-starts; later ones queue", async () => {
    const s = await withTracks(3);
    expect(s.queue.map((t) => t.status)).toEqual(["current", "queued", "queued"]);
    expect(s.playback.status).toBe("playing");
    expect(s.current!.id).toBe(s.queue[0].id);
  });
  it("uses fallback metadata when oEmbed fails", async () => {
    const r = await room();
    const s = await enqueue(r.room.code, "https://youtu.be/xxxxxxxxxxx", "Dev");
    expect(s.queue[0]).toMatchObject({ title: "บันทึกไม่มีชื่อ", author: "YouTube" });
  });
  it("rejects bad urls/names and a full queue", async () => {
    const r = await room();
    expect((await err(enqueue(r.room.code, 1, "Dev"))).status).toBe(400);
    expect((await err(enqueue(r.room.code, "https://vimeo.com/1", "Dev"))).status).toBe(400);
    expect((await err(enqueue(r.room.code, vid(1), ""))).status).toBe(400);
    const roomId = r.room.id;
    for (let i = 0; i < 100; i += 1) {
      await execute("INSERT INTO tracks VALUES (?, ?, 'aaaaaaaaaaa', 't', 'a', NULL, NULL, 'Dev', ?, 'queued')", [`t${i}`, roomId, i]);
    }
    expect((await err(enqueue(r.room.code, vid(1), "Dev"))).message).toMatch(/คิวเต็ม/);
  });
  it("reorders, ignores unknown ids, no-op when unchanged, validates", async () => {
    const s = await withTracks(3);
    const [a, b, c] = s.queue.map((t) => t.id);
    expect((await reorderQueued(s.room.code, [a, b, c])).queue.map((t) => t.id)).toEqual([a, b, c]);
    expect((await reorderQueued(s.room.code, [c, "ghost", a])).queue.map((t) => t.id)).toEqual([c, a, b]);
    expect((await err(reorderQueued(s.room.code, "x"))).status).toBe(400);
    expect((await err(reorderQueued(s.room.code, [a, a]))).status).toBe(400);
    expect((await err(reorderQueued(s.room.code, Array(101).fill("q")))).status).toBe(400);
    expect((await err(reorderQueued(s.room.code, Array.from({ length: 2001 }, (_, i) => `q${i}`)))).status).toBe(400);
  });
  it("playQueued jumps; validates", async () => {
    const s = await withTracks(3);
    const p = await playQueued(s.room.code, s.queue[2].id);
    expect(p.current!.id).toBe(s.queue[2].id);
    expect(p.queue.map((t) => t.status)).toEqual(["played", "queued", "current"]);
    expect((await err(playQueued(s.room.code, ""))).status).toBe(400);
    expect((await err(playQueued(s.room.code, "ghost"))).status).toBe(404);
  });
  it("removeQueued: current -> next, last -> previous, only -> idle", async () => {
    const s = await withTracks(3);
    const [a, b, c] = s.queue.map((t) => t.id);
    expect((await removeQueued(s.room.code, a)).current!.id).toBe(b);
    await playQueued(s.room.code, c);
    expect((await removeQueued(s.room.code, c)).current!.id).toBe(b);
    const idle = await removeQueued(s.room.code, b);
    expect(idle.playback).toMatchObject({ status: "idle", trackId: null });
    expect((await err(removeQueued(s.room.code, "ghost"))).status).toBe(404);
    expect((await err(removeQueued(s.room.code, 3))).status).toBe(400);
  });
  it("remove non-current keeps playback", async () => {
    const s = await withTracks(2);
    const r = await removeQueued(s.room.code, s.queue[1].id);
    expect(r.current!.id).toBe(s.queue[0].id);
  });
});

describe("rooms: playback state machine", () => {
  const pos = async (code: string) => (await getSnapshot(code))!.playback;
  it("pause captures position; play resumes; seek clamps to duration", async () => {
    const s = await withTracks(2);
    const t = s.queue[0].id;
    tick(5000);
    await applyPlayback(s.room.code, "pause", {});
    expect(await pos(s.room.code)).toMatchObject({ status: "paused", positionMs: 5001 });
    await applyPlayback(s.room.code, "pause", {}); // no-op when not playing
    tick(9999);
    await applyPlayback(s.room.code, "play", {});
    expect(await pos(s.room.code)).toMatchObject({ status: "playing", positionMs: 5001 });
    await applyPlayback(s.room.code, "duration", { trackId: t, durationSec: 60 });
    await applyPlayback(s.room.code, "seek", { positionMs: 999_999 });
    expect((await pos(s.room.code)).positionMs).toBe(60_000);
    await applyPlayback(s.room.code, "seek", { positionMs: 12_345.6 });
    expect((await pos(s.room.code)).positionMs).toBe(12_346);
    expect((await err(applyPlayback(s.room.code, "seek", { positionMs: "x" }))).status).toBe(400);
  });
  it("duration ignores invalid values", async () => {
    const s = await withTracks(1);
    for (const extras of [{ trackId: s.queue[0].id, durationSec: 0 }, { trackId: s.queue[0].id, durationSec: 43_201 }, { durationSec: 10 }, { trackId: s.queue[0].id, durationSec: "9" }]) {
      await applyPlayback(s.room.code, "duration", extras);
    }
    expect((await getSnapshot(s.room.code))!.queue[0].durationSec).toBeNull();
  });
  it("play near end restarts from 0; play while idle starts first track", async () => {
    const s = await withTracks(1);
    await applyPlayback(s.room.code, "duration", { trackId: s.queue[0].id, durationSec: 10 });
    await applyPlayback(s.room.code, "seek", { positionMs: 9_800 });
    await applyPlayback(s.room.code, "pause", {});
    await applyPlayback(s.room.code, "play", {});
    expect((await pos(s.room.code)).positionMs).toBe(0);
    await execute("UPDATE playback SET status='idle', track_id=NULL");
    await applyPlayback(s.room.code, "play", {});
    expect((await pos(s.room.code)).trackId).toBe(s.queue[0].id);
  });
  it("next advances; at end pauses at duration (or position)", async () => {
    const s = await withTracks(2);
    const [a, b] = s.queue.map((t) => t.id);
    await applyPlayback(s.room.code, "next", {});
    expect((await pos(s.room.code)).trackId).toBe(b);
    tick(4000);
    await applyPlayback(s.room.code, "next", {});
    expect(await pos(s.room.code)).toMatchObject({ trackId: b, status: "paused", positionMs: 0 });
    await applyPlayback(s.room.code, "duration", { trackId: b, durationSec: 30 });
    await applyPlayback(s.room.code, "next", {});
    expect((await pos(s.room.code)).positionMs).toBe(30_000);
    expect(a).toBeTruthy();
  });
  it("ended only advances if trackId matches current", async () => {
    const s = await withTracks(2);
    const [a, b] = s.queue.map((t) => t.id);
    await applyPlayback(s.room.code, "ended", { trackId: b });
    expect((await pos(s.room.code)).trackId).toBe(a);
    await applyPlayback(s.room.code, "ended", {});
    await applyPlayback(s.room.code, "ended", { trackId: a });
    expect((await pos(s.room.code)).trackId).toBe(b);
  });
  it("previous: >3s restarts, else goes back, at first restarts", async () => {
    const s = await withTracks(2);
    const [a, b] = s.queue.map((t) => t.id);
    await applyPlayback(s.room.code, "previous", {});
    expect(await pos(s.room.code)).toMatchObject({ trackId: a, positionMs: 0, status: "playing" });
    await playQueued(s.room.code, b);
    tick(5000);
    await applyPlayback(s.room.code, "pause", {});
    await applyPlayback(s.room.code, "previous", {});
    expect(await pos(s.room.code)).toMatchObject({ trackId: b, positionMs: 0, status: "paused" });
    await applyPlayback(s.room.code, "previous", {});
    expect((await pos(s.room.code)).trackId).toBe(a);
  });
  it("no-ops without a track; unknown action throws", async () => {
    const s = await room();
    for (const a of ["pause", "seek", "previous", "next", "play"]) await applyPlayback(s.room.code, a, { positionMs: 1 });
    expect((await pos(s.room.code)).status).toBe("idle");
    expect((await err(applyPlayback(s.room.code, "boom", {}))).status).toBe(400);
    expect((await err(applyPlayback("ZZZZZZ", "play", {}))).status).toBe(404);
  });
  it("snapshot heals overrun: advances when next exists, else pauses at cap", async () => {
    const s = await withTracks(2);
    const [a, b] = s.queue.map((t) => t.id);
    await applyPlayback(s.room.code, "duration", { trackId: a, durationSec: 10 });
    tick(11_500);
    expect((await pos(s.room.code)).trackId).toBe(b);
    await applyPlayback(s.room.code, "duration", { trackId: b, durationSec: 10 });
    tick(11_500);
    expect(await pos(s.room.code)).toMatchObject({ trackId: b, status: "paused", positionMs: 10_000 });
    tick(500);
    expect(await pos(s.room.code)).toMatchObject({ status: "paused" });
  });
});

describe("rooms: close", () => {
  it("opener closes and everything is deleted; others get 403", async () => {
    const s = await withTracks(1);
    expect((await err(closeRoom(s.room.code, B, "Bee"))).status).toBe(403);
    expect((await err(closeRoom(s.room.code, "bad"))).status).toBe(400);
    await closeRoom(s.room.code, A);
    expect(await getSnapshot(s.room.code)).toBeNull();
    expect(await queryOne("SELECT 1 FROM tracks")).toBeUndefined();
  });
});

describe("rooms: reorder keeps working once played tracks pile up", () => {
  it("accepts an order with more than 100 rows (played + queued)", async () => {
    const s = await withTracks(2);
    for (let i = 0; i < 100; i += 1) {
      await execute(
        "INSERT INTO tracks (id, room_id, youtube_id, title, author, thumbnail, duration_sec, added_by, added_at, status) VALUES (?, ?, ?, ?, ?, NULL, 200, ?, ?, 'played')",
        [`played-${i}`, s.room.id, "aaaaaaaaaaa", `P${i}`, "x", "Dev", 1_600_000_000_000 + i],
      );
    }
    const before = (await getSnapshot(s.room.code))!.queue.map((t) => t.id);
    expect(before.length).toBe(102);
    const swapped = [...before];
    [swapped[100], swapped[101]] = [swapped[101], swapped[100]];
    const after = (await reorderQueued(s.room.code, swapped)).queue.map((t) => t.id);
    expect(after.slice(100)).toEqual([before[101], before[100]]);
  });
});
