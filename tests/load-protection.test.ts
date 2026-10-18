/**
 * Load + abuse protection (2026-10-18, requested by the PM). The library (createRoom etc.) stays
 * unlimited — see security-regression.test.ts; limits live at the HTTP edge and in DB-derived caps.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), connection: async () => undefined }));

import { clearMemo, memo } from "@/lib/memo";
import { checkLimit, resetRateLimits } from "@/lib/ratelimit";
import { execute, queryOne } from "@/lib/db";
import { beatRoom, createRoom, enqueue, getSnapshotShared, joinRoom } from "@/lib/rooms";
import { readJson } from "@/lib/http";
import { A, B, resetAll, tick, vid } from "./helpers";
import { GET as roomGet } from "@/app/api/rooms/[code]/route";
import { POST as playbackPost } from "@/app/api/rooms/[code]/playback/route";
import { POST as createPost } from "@/app/api/rooms/route";
import { POST as beatPost } from "@/app/api/rooms/[code]/beat/route";

beforeEach(async () => {
  await resetAll();
  clearMemo();
  resetRateLimits();
});

const req = (url: string, init: RequestInit & { ip?: string; member?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.ip) headers.set("x-forwarded-for", init.ip);
  if (init.member) headers.set("x-member-id", init.member);
  return new Request(`http://localhost${url}`, { ...init, headers });
};
const ctx = (code: string) => ({ params: Promise.resolve({ code }) });

describe("memo: single-flight cache", () => {
  it("shares one load between concurrent callers and reuses it within the ttl", async () => {
    let loads = 0;
    const load = async () => { loads += 1; await new Promise((r) => setTimeout(r, 20)); return loads; };
    const results = await Promise.all(Array.from({ length: 50 }, () => memo("k", 1000, load)));
    expect(new Set(results)).toEqual(new Set([1]));
    expect(await memo("k", 1000, load)).toBe(1);
    expect(loads).toBe(1);
  });
  it("does not keep a failure", async () => {
    await expect(memo("e", 1000, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await memo("e", 1000, async () => "ok")).toBe("ok");
  });
});

describe("rate limit buckets", () => {
  const at = (ip: string, member?: string) => req("/x", { ip, member });
  it("lets a person act at human speed, cuts a tight loop, and recovers", () => {
    const t0 = 1_000_000;
    // 10 add-track requests in a burst: allowed up to the burst of 8, then told when to retry
    const waits = Array.from({ length: 10 }, () => checkLimit(at("1.1.1.1", A), "add", t0));
    expect(waits.slice(0, 8)).toEqual(Array(8).fill(0));
    expect(waits[8]).toBeGreaterThan(0);
    expect(checkLimit(at("1.1.1.1", A), "add", t0 + 4500)).toBe(0); // one token refilled (0.25/s)
  });
  it("a shared IP (office NAT) keeps working while one noisy member is limited", () => {
    const t0 = 5_000_000;
    for (let i = 0; i < 40; i += 1) checkLimit(at("2.2.2.2", A), "playback", t0);
    expect(checkLimit(at("2.2.2.2", A), "playback", t0)).toBeGreaterThan(0);
    expect(checkLimit(at("2.2.2.2", B), "playback", t0)).toBe(0);
  });
  it("rotating member ids still hits the per-IP bucket", () => {
    const t0 = 9_000_000;
    const ids = Array.from({ length: 400 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const blocked = ids.filter((id) => checkLimit(at("3.3.3.3", id), "create", t0) > 0).length;
    expect(blocked).toBeGreaterThan(390);
  });
  it("is off when RATE_LIMIT=off", () => {
    process.env.RATE_LIMIT = "off";
    try {
      for (let i = 0; i < 1000; i += 1) expect(checkLimit(at("4.4.4.4"), "create", 1)).toBe(0);
    } finally { delete process.env.RATE_LIMIT; }
  });
});

describe("HTTP edge", () => {
  it("room GET: unchanged state costs a tiny body; a change brings the full snapshot", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    const full = await (await roomGet(req(`/api/rooms/${s.room.code}`, { ip: "5.5.5.5" }), ctx(s.room.code))).json();
    expect(full.rev).toBeTruthy();
    expect(full.pollMs).toBeGreaterThanOrEqual(1500);
    const same = await (await roomGet(req(`/api/rooms/${s.room.code}?v=${full.rev}`, { ip: "5.5.5.5" }), ctx(s.room.code))).json();
    expect(same).toMatchObject({ unchanged: true, rev: full.rev });
    expect(same.queue).toBeUndefined();
    tick(10);
    await enqueue(s.room.code, vid(1), "Owner");
    const changed = await (await roomGet(req(`/api/rooms/${s.room.code}?v=${full.rev}`, { ip: "5.5.5.5" }), ctx(s.room.code))).json();
    expect(changed.unchanged).toBeUndefined();
    expect(changed.queue).toHaveLength(1);
  });
  it("room GET: impossible codes 404 without touching the database", async () => {
    const res = await roomGet(req("/api/rooms/nope", { ip: "6.6.6.6" }), ctx("nope"));
    expect(res.status).toBe(404);
    expect(await getSnapshotShared("../etc")).toBeNull();
  });
  it("hammering one endpoint gets 429 with Retry-After; another IP is unaffected", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    let limited = 0;
    for (let i = 0; i < 400; i += 1) {
      const res = await roomGet(req(`/api/rooms/${s.room.code}`, { ip: "7.7.7.7" }), ctx(s.room.code));
      if (res.status === 429) {
        limited += 1;
        expect(Number(res.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
      }
    }
    expect(limited).toBeGreaterThan(0);
    const other = await roomGet(req(`/api/rooms/${s.room.code}`, { ip: "8.8.8.8" }), ctx(s.room.code));
    expect(other.status).toBe(200);
  });
  it("create room: a script is cut off after a small burst", async () => {
    const body = JSON.stringify({ memberId: A, memberName: "Bot" });
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      statuses.push((await createPost(req("/api/rooms", { method: "POST", body, ip: "9.9.9.9" }))).status);
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(6);
    expect(statuses.filter((s) => s === 429)).toHaveLength(6);
  });
  it("playback spam from one browser is limited, then recovers", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    const post = () => playbackPost(
      req(`/api/rooms/${s.room.code}/playback`, { method: "POST", body: JSON.stringify({ action: "pause" }), ip: "10.0.0.1", member: A }),
      ctx(s.room.code),
    );
    const codes: number[] = [];
    for (let i = 0; i < 30; i += 1) codes.push((await post()).status);
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
    expect(codes[0]).toBe(200);
  });
  it("oversized or non-object bodies are ignored, not parsed", async () => {
    const big = JSON.stringify({ memberName: "x".repeat(40_000) });
    expect(await readJson(req("/x", { method: "POST", body: big }))).toEqual({});
    expect(await readJson(req("/x", { method: "POST", body: "[1,2]" }))).toEqual({});
    expect(await readJson(req("/x", { method: "POST", body: '{"a":1}' }))).toEqual({ a: 1 });
  });
});

describe("heartbeat", () => {
  it("beat refreshes presence without a snapshot and 404s for a closed/unknown room", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    await joinRoom(s.room.code, B, "Bee");
    tick(80_000);
    await beatRoom(s.room.code, B, "Bee");
    tick(30_000); // Owner has been silent 110s, Bee only 30s
    const snap = await getSnapshotShared(s.room.code);
    expect(snap!.members.map((m) => m.name)).toEqual(["Bee"]);
    await expect(beatRoom("ABCDEF", B, "Bee")).rejects.toMatchObject({ status: 404 });
  });
  it("beat route answers a small ok body", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    const res = await beatPost(
      req(`/api/rooms/${s.room.code}/beat`, { method: "POST", body: JSON.stringify({ memberId: A, memberName: "Owner" }), ip: "11.0.0.1" }),
      ctx(s.room.code),
    );
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("caps derived from the database", () => {
  it("keeps only the latest 100 played tracks when a new one is added", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    for (let i = 0; i < 130; i += 1) {
      await execute(
        "INSERT INTO tracks (id, room_id, youtube_id, title, author, thumbnail, duration_sec, added_by, added_at, status) VALUES (?, ?, 'aaaaaaaaaaa', 't', 'a', NULL, 200, 'Owner', ?, 'played')",
        [`p${i}`, s.room.id, i + 1],
      );
    }
    const after = await enqueue(s.room.code, vid(1), "Owner");
    expect(after.queue.filter((t) => t.status === "played")).toHaveLength(100);
    expect(after.queue.some((t) => t.id === "p129")).toBe(true);
    expect(after.queue.some((t) => t.id === "p0")).toBe(false);
  });
  it("rejects a 301st listener but lets known members back in", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    for (let i = 0; i < 299; i += 1) {
      await execute(
        "INSERT INTO members (id, room_id, name, hue, emoji, last_seen) VALUES (?, ?, 'm', 1, NULL, ?)",
        [`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, s.room.id, Date.now()],
      );
    }
    await expect(joinRoom(s.room.code, B, "Late")).rejects.toMatchObject({ status: 403 });
    await expect(joinRoom(s.room.code, A, "Owner")).resolves.toBeTruthy();
    expect((await queryOne<{ n: number }>("SELECT COUNT(*)::int AS n FROM members"))!.n).toBe(300);
  });
  it("caps rooms created per minute across everyone", async () => {
    for (let i = 0; i < 60; i += 1) {
      await createRoom({ memberId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, memberName: "x" });
    }
    await expect(createRoom({ memberId: A, memberName: "x" })).rejects.toMatchObject({ status: 429 });
  });
});
