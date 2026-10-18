import { beforeEach, describe, expect, it, vi } from "vitest";
import { execute, queryOne, withTransaction } from "@/lib/db";
import { applyPlayback, closeRoom, createRoom, enqueue, getSnapshot, joinRoom, playQueued, removeQueued } from "@/lib/rooms";
import { safeNext } from "@/lib/time";
import { A, B, resetAll, tick, vid } from "./helpers";

vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), connection: async () => undefined }));
const { GET: roomGet } = await import("@/app/api/rooms/[code]/route");
const { POST: queuePost } = await import("@/app/api/rooms/[code]/queue/route");

beforeEach(resetAll);

describe("fix 3: safeNext open redirect", () => {
  it.each([
    "/\\evil.example", "/\\/evil.example", "/\\\\evil.example", "/a\\b", "/\t/evil.example", "/\n/evil.example",
    "//evil.example", "///evil.example", "https://evil.example", "javascript:alert(1)", "/enter", "/enter?next=/x", "/enter/", "/enter#x", "/enter%3Fnext=/x", "", null, "r/ABC", "/%2F%2Fevil.example", "/%5Cevil.example", "/%E0%A4%A", "/x://y",
  ])("rejects %j", (value) => expect(safeNext(value)).toBe("/archive"));
  it.each(["/r/ABC234", "/archive", "/", "/r/ABC?x=1#h", "/r/A%20B", "/a:b", "/entertainment", "/enterprise/x"])("keeps same-origin %j", (value) =>
    expect(safeNext(value)).toBe(value));
});

describe("fix 4: API 404 instead of 500", () => {
  it("GET /api/rooms/%00 → 404", async () => {
    const res = await roomGet(new Request("http://t/api/rooms/%00"), { params: Promise.resolve({ code: "\u0000" }) });
    expect(res.status).toBe(404);
    expect(await getSnapshot("AB\u0000C")).toBeNull();
    await expect(joinRoom("\u0000", A, "x")).rejects.toMatchObject({ status: 404 });
  });
  it("adding a track while the room is closing → 404, never 500, no orphan rows", async () => {
    for (let i = 0; i < 8; i += 1) {
      const s = await createRoom({ memberId: A, memberName: "Owner" });
      await enqueue(s.room.code, vid(1), "Owner");
      const req = new Request("http://t", { method: "POST", body: JSON.stringify({ url: vid(2), memberName: "Owner" }) });
      const [res] = await Promise.all([
        queuePost(req, { params: Promise.resolve({ code: s.room.code }) }),
        closeRoom(s.room.code, A),
      ]);
      expect([200, 404]).toContain(res.status);
    }
    expect(await queryOne("SELECT 1 FROM tracks")).toBeUndefined();
    expect(await queryOne("SELECT 1 FROM rooms")).toBeUndefined();
  });
  it("other mutations racing a close don't 500 either", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    const q = await enqueue(s.room.code, vid(1), "Owner");
    const ops = [
      applyPlayback(s.room.code, "pause", {}),
      playQueued(s.room.code, q.queue[0].id),
      removeQueued(s.room.code, q.queue[0].id),
      getSnapshot(s.room.code),
      joinRoom(s.room.code, A, "Owner"),
    ];
    await closeRoom(s.room.code, A);
    for (const r of await Promise.allSettled(ops)) {
      if (r.status === "rejected") expect((r.reason as { status?: number }).status).not.toBe(500);
    }
  });
});

describe("join vs close (join runs under the room lock)", () => {
  it("join that already saw the room, blocked by an in-flight close → 404, not an FK 500", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    let ready!: () => void;
    let release!: () => void;
    const deleted = new Promise<void>((r) => (ready = r));
    const gate = new Promise<void>((r) => (release = r));
    // A close that holds the row lock with its deletes not yet committed.
    const closing = withTransaction(async () => {
      await execute("SELECT id FROM rooms WHERE code = ? FOR UPDATE", [s.room.code]);
      await execute("DELETE FROM playback WHERE room_id = ?", [s.room.id]);
      await execute("DELETE FROM members WHERE room_id = ?", [s.room.id]);
      await execute("DELETE FROM rooms WHERE id = ?", [s.room.id]);
      ready();
      await gate;
    });
    await deleted;
    const join = joinRoom(s.room.code, B, "Late").then(
      () => ({ ok: true as const }),
      (e: { status?: number; code?: string }) => ({ ok: false as const, status: e.status, code: e.code }),
    );
    await new Promise((r) => setTimeout(r, 150)); // join is now waiting on the lock
    release();
    await closing;
    expect(await join).toEqual({ ok: false, status: 404, code: undefined });
    expect(await queryOne("SELECT 1 FROM members")).toBeUndefined();
  });

  it("join to a missing room → 404", async () => {
    await expect(joinRoom("ZZZZZZ", A, "x")).rejects.toMatchObject({ status: 404 });
  });

  it("concurrent joins + close: every join is 200 or 404, never 500, no orphan members", async () => {
    for (let i = 0; i < 8; i += 1) {
      const s = await createRoom({ memberId: A, memberName: "Owner" });
      const joins = Array.from({ length: 5 }, (_, k) => joinRoom(s.room.code, `3333333${k}-3333-4333-8333-333333333333`, `J${k}`));
      const [, ...settled] = await Promise.allSettled([closeRoom(s.room.code, A), ...joins]);
      for (const r of settled) {
        if (r.status === "rejected") expect((r.reason as { status?: number }).status).toBe(404);
      }
    }
    expect(await queryOne("SELECT 1 FROM members")).toBeUndefined();
    expect(await queryOne("SELECT 1 FROM rooms")).toBeUndefined();
  });
});

describe("join + snapshot vs close (QA: ~1/100 500 'ห้องนี้ยังไม่มีสถานะการเล่น')", () => {
  it("8 joins + 1 close concurrently, x100: every join is 200 or 404, never 500", async () => {
    const statuses = new Map<number | string, number>();
    const unexpected: string[] = [];
    for (let round = 0; round < 100; round += 1) {
      const s = await createRoom({ memberId: A, memberName: "Owner" });
      const joins = Array.from({ length: 8 }, (_, k) =>
        joinRoom(s.room.code, `4444444${k}-4444-4444-8444-444444444444`, `J${k}`),
      );
      const settled = await Promise.allSettled([...joins, closeRoom(s.room.code, A)]);
      for (const r of settled.slice(0, 8)) {
        const status = r.status === "fulfilled" ? 200 : ((r.reason as { status?: number }).status ?? "error");
        statuses.set(status, (statuses.get(status) ?? 0) + 1);
        if (status !== 200 && status !== 404) unexpected.push(`${status}: ${(r as PromiseRejectedResult).reason?.message}`);
      }
    }
    expect(unexpected).toEqual([]);
    expect([...statuses.keys()].every((k) => k === 200 || k === 404)).toBe(true);
    expect(await queryOne("SELECT 1 FROM members")).toBeUndefined();
  }, 60_000);

  it("snapshot that loses its playback row to a close mid-read → null (404), not 500", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    const ops = Array.from({ length: 20 }, () => getSnapshot(s.room.code));
    await closeRoom(s.room.code, A);
    for (const r of await Promise.allSettled(ops)) expect(r.status).toBe("fulfilled");
  });
});

describe("heal + close", () => {
  it("snapshot after close is null", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    await closeRoom(s.room.code, A);
    tick(1);
    expect(await getSnapshot(s.room.code)).toBeNull();
    await execute("SELECT 1");
  });
});
