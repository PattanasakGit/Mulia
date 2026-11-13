/**
 * PM decision (2026-10-15): these behaviours are INTENTIONAL.
 * The tests lock them in so any change is a deliberate, reviewed decision.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const qr = vi.hoisted(() => ({ links: [] as string[] }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), connection: async () => undefined }));
vi.mock("qrcode", () => ({
  default: { toString: async (link: string) => { qr.links.push(link); return "<svg/>"; } },
}));
import { execute } from "@/lib/db";
import { isAdminToken } from "@/lib/admin";
import { applyPlayback, closeRoom, createRoom, enqueue, getSnapshot, removeQueued, reorderQueued } from "@/lib/rooms";
import { A, resetAll, vid } from "./helpers";
import { GET as qrGet } from "@/app/api/rooms/[code]/qr/route";

beforeEach(resetAll);

describe("intentional security behaviour (do not change without PM)", () => {
  it("a display name never grants admin: THEPAT is just a name (MUTIA-BUGHUNT-01 #2)", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    await expect(closeRoom(s.room.code, { adminToken: "THEPAT" })).rejects.toMatchObject({ status: 403 });
    expect(await getSnapshot(s.room.code)).not.toBeNull();
  });
  it("admin needs MULIA_ADMIN_TOKEN (16+ chars) held on the server", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    const secret = "correct-horse-battery-staple";
    vi.stubEnv("MULIA_ADMIN_TOKEN", "short");
    expect(isAdminToken("short")).toBe(false);
    vi.stubEnv("MULIA_ADMIN_TOKEN", secret);
    expect(isAdminToken(secret + "x")).toBe(false);
    expect(isAdminToken(undefined)).toBe(false);
    await expect(closeRoom(s.room.code, { adminToken: "nope" })).rejects.toMatchObject({ status: 403 });
    await closeRoom(s.room.code, { adminToken: secret });
    expect(await getSnapshot(s.room.code)).toBeNull();
    vi.unstubAllEnvs();
    expect(isAdminToken(secret)).toBe(false);
  });
  it("only the owner token closes a room; the public openedBy member id is not enough (#1)", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    expect(typeof s.ownerToken).toBe("string");
    const snap = (await getSnapshot(s.room.code))!;
    expect(JSON.stringify(snap)).not.toContain(s.ownerToken);
    await expect(closeRoom(s.room.code, { ownerToken: snap.room.openedBy })).rejects.toMatchObject({ status: 403 });
    await expect(closeRoom(s.room.code, { ownerToken: "" })).rejects.toMatchObject({ status: 403 });
    await closeRoom(s.room.code, { ownerToken: s.ownerToken });
    expect(await getSnapshot(s.room.code)).toBeNull();
  });
  it("a legacy room without an owner hash cannot be closed with an empty or guessed token", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    await execute("UPDATE rooms SET owner_hash = NULL WHERE code = ?", [s.room.code]);
    await expect(closeRoom(s.room.code, { ownerToken: "" })).rejects.toMatchObject({ status: 403 });
    await expect(closeRoom(s.room.code, { ownerToken: "anything" })).rejects.toMatchObject({ status: 403 });
  });
  it("snapshot exposes openedBy (creator member id)", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    expect((await getSnapshot(s.room.code))!.room.openedBy).toBe(A);
  });
  it("queue and playback are open to anyone with the room code (no membership check)", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    const q = await enqueue(s.room.code, vid(1), "Stranger");
    await enqueue(s.room.code, vid(2), "Stranger");
    await applyPlayback(s.room.code, "pause", {});
    await reorderQueued(s.room.code, [q.queue[0].id]);
    const r = await removeQueued(s.room.code, q.queue[0].id);
    expect(r.queue).toHaveLength(1);
  });
  it("the library itself has no rate limit (limits live at the HTTP edge: see load-protection.test.ts)", async () => {
    const all = await Promise.all(Array.from({ length: 20 }, () => createRoom({ memberId: A, memberName: "x" })));
    expect(new Set(all.map((s) => s.room.code)).size).toBe(20);
  });
  it("QR link uses the request origin (Host-derived)", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    const { NextRequest } = await import("next/server");
    const res = await qrGet(new NextRequest(`http://attacker.example/api/rooms/${s.room.code}/qr`), {
      params: Promise.resolve({ code: s.room.code }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(qr.links.at(-1)).toBe(`http://attacker.example/r/${s.room.code}`);
  });
});
