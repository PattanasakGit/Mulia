import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), connection: async () => undefined }));

import { clearMemo } from "@/lib/memo";
import { resetRateLimits } from "@/lib/ratelimit";
import { execute } from "@/lib/db";
import { beatRoom, claimSpeaker, createRoom, getSnapshot, joinRoom, setSpeakerMode } from "@/lib/rooms";
import { POST as speakerPost } from "@/app/api/rooms/[code]/speaker/route";
import { A, B, resetAll, tick } from "./helpers";

const OFFICE = "device-office-0001";
const PHONE = "device-phone-0002";

beforeEach(async () => {
  await resetAll();
  clearMemo();
  resetRateLimits();
});

const err = (p: Promise<unknown>) => p.then(() => { throw new Error("no throw"); }, (e: { status: number }) => e);
const room = (extra: object = {}) => createRoom({ memberId: A, memberName: "Owner", deviceId: OFFICE, deviceLabel: "เครื่องของ Owner", ...extra });

describe("speaker: single mode (default for new rooms)", () => {
  it("the device that opens the room is its speaker", async () => {
    const s = await room();
    expect(s.speaker).toEqual({ mode: "single", mainDeviceId: OFFICE, mainLabel: "เครื่องของ Owner", mainOnline: true });
  });
  it("a client that sends no device leaves the speaker unclaimed", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    expect(s.speaker).toEqual({ mode: "single", mainDeviceId: null, mainLabel: null, mainOnline: false });
  });
  it("anyone can move the speaker; the old device is replaced", async () => {
    const s = await room();
    const moved = await claimSpeaker(s.room.code, PHONE, "  เครื่อง   ของ Bee ");
    expect(moved.speaker).toMatchObject({ mainDeviceId: PHONE, mainLabel: "เครื่อง ของ Bee", mainOnline: true });
    expect((await claimSpeaker(s.room.code, PHONE)).speaker!.mainLabel).toBe("เครื่องลำโพง");
  });
  it("validates the device id", async () => {
    const s = await room();
    expect((await err(claimSpeaker(s.room.code, "x"))).status).toBe(400);
    expect((await err(claimSpeaker(s.room.code, undefined))).status).toBe(400);
    expect((await err(claimSpeaker(s.room.code, "bad id with spaces"))).status).toBe(400);
  });
  it("the main device's heartbeat keeps it online; silence for 90s marks it offline", async () => {
    const s = await room();
    tick(60_000);
    await beatRoom(s.room.code, A, "Owner", undefined, OFFICE);
    tick(60_000);
    expect((await getSnapshot(s.room.code))!.speaker!.mainOnline).toBe(true);
    tick(40_000);
    expect((await getSnapshot(s.room.code))!.speaker!.mainOnline).toBe(false);
  });
  it("another device's heartbeat does not keep the speaker alive", async () => {
    const s = await room();
    await joinRoom(s.room.code, B, "Bee");
    tick(60_000);
    await beatRoom(s.room.code, B, "Bee", undefined, PHONE);
    tick(60_000);
    expect((await getSnapshot(s.room.code))!.speaker!.mainOnline).toBe(false);
  });
  it("joining from the main device refreshes it too (a reload keeps the role)", async () => {
    const s = await room();
    tick(80_000);
    await joinRoom(s.room.code, A, "Owner", undefined, OFFICE);
    tick(50_000);
    expect((await getSnapshot(s.room.code))!.speaker!.mainOnline).toBe(true);
  });
});

describe("speaker: room mode switch", () => {
  it("'all' clears the main speaker and refuses claims", async () => {
    const s = await room();
    const all = await setSpeakerMode(s.room.code, "all");
    expect(all.speaker).toEqual({ mode: "all", mainDeviceId: null, mainLabel: null, mainOnline: false });
    expect((await err(claimSpeaker(s.room.code, PHONE))).status).toBe(409);
  });
  it("back to 'single' makes the switching device the speaker", async () => {
    const s = await room();
    await setSpeakerMode(s.room.code, "all");
    const single = await setSpeakerMode(s.room.code, "single", PHONE, "เครื่องของ Bee");
    expect(single.speaker).toMatchObject({ mode: "single", mainDeviceId: PHONE, mainLabel: "เครื่องของ Bee", mainOnline: true });
  });
  it("'single' needs a device; unknown modes are rejected", async () => {
    const s = await room();
    await setSpeakerMode(s.room.code, "all");
    expect((await err(setSpeakerMode(s.room.code, "single"))).status).toBe(400);
    expect((await err(setSpeakerMode(s.room.code, "party"))).status).toBe(400);
    expect((await getSnapshot(s.room.code))!.speaker!.mode).toBe("all");
  });
  it("rooms that existed before the speaker columns keep playing everywhere", async () => {
    await execute("INSERT INTO rooms (id, code, name, opened_by, created_at) VALUES ('legacy-1', 'LEGACY', 'Old', ?, 1)", [A]);
    await execute("INSERT INTO playback (room_id, track_id, status, position_ms, anchor_ms) VALUES ('legacy-1', NULL, 'idle', 0, 1)");
    expect((await getSnapshot("LEGACY"))!.speaker).toMatchObject({ mode: "all", mainDeviceId: null });
  });
});

describe("speaker: HTTP", () => {
  const ctx = (code: string) => ({ params: Promise.resolve({ code }) });
  const post = (code: string, body: object, ip = "20.0.0.1") =>
    speakerPost(new Request(`http://localhost/api/rooms/${code}/speaker`, { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": ip } }), ctx(code));
  it("claims, switches mode and reports 409 / 400 as JSON errors", async () => {
    const s = await room();
    const claimed = await (await post(s.room.code, { deviceId: PHONE, label: "Bee" })).json();
    expect(claimed.speaker.mainDeviceId).toBe(PHONE);
    const all = await (await post(s.room.code, { action: "mode", mode: "all" })).json();
    expect(all.speaker.mode).toBe("all");
    expect((await post(s.room.code, { deviceId: PHONE })).status).toBe(409);
    expect((await post(s.room.code, { action: "mode", mode: "x" })).status).toBe(400);
  });
  it("cannot be hammered from one address", async () => {
    const s = await room();
    const codes: number[] = [];
    for (let i = 0; i < 60; i += 1) codes.push((await post(s.room.code, { deviceId: PHONE }, "20.0.0.2")).status);
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
  });
});
