import { beforeEach, describe, expect, it } from "vitest";
import { queryOne } from "@/lib/db";
import { POST } from "@/app/api/rooms/[code]/owner/route";
import { closeRoom, createOwnerRecovery, createRoom, redeemOwnerRecovery } from "@/lib/rooms";
import { resetRateLimits } from "@/lib/ratelimit";
import { A, asOwner, resetAll } from "./helpers";

beforeEach(async () => {
  await resetAll();
  resetRateLimits();
});

const fresh = () => createRoom({ memberId: A, memberName: "Owner" });
const hashes = (code: string) =>
  queryOne<{ owner_hash: string | null; recovery_hash: string | null }>("SELECT owner_hash, recovery_hash FROM rooms WHERE code = ?", [code]);

describe("MULIA-A4: create recovery link", () => {
  it("needs the live owner token; wrong, empty, huge or non-string tokens get 403", async () => {
    const s = await fresh();
    for (const bad of ["wrong", "", "x".repeat(129), 42, null, undefined]) {
      await expect(createOwnerRecovery(s.room.code, bad)).rejects.toMatchObject({ status: 403 });
    }
    expect((await hashes(s.room.code))!.recovery_hash).toBeNull();
  });

  it("stores only a hash, keeps the owner token working, and returns a high-entropy token", async () => {
    const s = await fresh();
    const { recoveryToken } = await createOwnerRecovery(s.room.code, s.ownerToken);
    expect(recoveryToken.length).toBeGreaterThanOrEqual(43); // 32 random bytes, base64url
    const row = (await hashes(s.room.code))!;
    expect(row.recovery_hash).not.toBeNull();
    expect(row.recovery_hash).not.toContain(recoveryToken);
    // the owner device is not logged out by making a link
    await createOwnerRecovery(s.room.code, s.ownerToken);
  });

  it("a new link revokes the previous one", async () => {
    const s = await fresh();
    const first = await createOwnerRecovery(s.room.code, s.ownerToken);
    const second = await createOwnerRecovery(s.room.code, s.ownerToken);
    expect(second.recoveryToken).not.toBe(first.recoveryToken);
    await expect(redeemOwnerRecovery(s.room.code, first.recoveryToken)).rejects.toMatchObject({ status: 403 });
    await expect(redeemOwnerRecovery(s.room.code, second.recoveryToken)).resolves.toHaveProperty("ownerToken");
  });

  it("legacy rooms (no owner hash) cannot make links, and nothing breaks for them", async () => {
    const s = await fresh();
    const { execute } = await import("@/lib/db");
    await execute("UPDATE rooms SET owner_hash = NULL WHERE code = ?", [s.room.code]);
    await expect(createOwnerRecovery(s.room.code, "anything")).rejects.toMatchObject({ status: 403 });
    await expect(redeemOwnerRecovery(s.room.code, "anything")).rejects.toMatchObject({ status: 403 });
    await expect(closeRoom(s.room.code, { ownerToken: "" })).rejects.toMatchObject({ status: 403 });
  });
});

describe("MULIA-A4: redeem", () => {
  it("rotates the owner token: new device closes, old device gets 403", async () => {
    const s = await fresh();
    const { recoveryToken } = await createOwnerRecovery(s.room.code, s.ownerToken);
    const { ownerToken: next } = await redeemOwnerRecovery(s.room.code, recoveryToken);
    expect(next).not.toBe(s.ownerToken);
    await expect(createOwnerRecovery(s.room.code, s.ownerToken)).rejects.toMatchObject({ status: 403 });
    await expect(closeRoom(s.room.code, { ownerToken: s.ownerToken })).rejects.toMatchObject({ status: 403 });
    await closeRoom(s.room.code, { ownerToken: next });
  });

  it("is single use, also under concurrency", async () => {
    const s = await fresh();
    const { recoveryToken } = await createOwnerRecovery(s.room.code, s.ownerToken);
    const results = await Promise.allSettled([1, 2, 3, 4].map(() => redeemOwnerRecovery(s.room.code, recoveryToken)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await hashes(s.room.code))!.recovery_hash).toBeNull();
  });

  it("rejects unissued, wrong, empty and oversized tokens; unknown room is 404", async () => {
    const s = await fresh();
    for (const bad of ["nope", "", "x".repeat(500), 1, undefined]) {
      await expect(redeemOwnerRecovery(s.room.code, bad)).rejects.toMatchObject({ status: 403 });
    }
    await expect(redeemOwnerRecovery("ZZZZZZ", "x")).rejects.toMatchObject({ status: 404 });
  });

  it("a recovery token is not an owner token, and an owner token is not a recovery token", async () => {
    const s = await fresh();
    const { ownerToken } = await asOwner(s.room.code);
    const { recoveryToken } = await createOwnerRecovery(s.room.code, ownerToken);
    await expect(closeRoom(s.room.code, { ownerToken: recoveryToken })).rejects.toMatchObject({ status: 403 });
    await expect(redeemOwnerRecovery(s.room.code, ownerToken)).rejects.toMatchObject({ status: 403 });
  });
});

describe("MULIA-A4: HTTP route", () => {
  const ctx = (code: string) => ({ params: Promise.resolve({ code }) });
  const post = (code: string, body: object, ip = "30.0.0.1") =>
    POST(new Request(`http://localhost/api/rooms/${code}/owner`, { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": ip } }), ctx(code));

  it("create then redeem over HTTP; responses are no-store; unknown action is 400", async () => {
    const s = await fresh();
    const created = await post(s.room.code, { action: "create", ownerToken: s.ownerToken });
    expect(created.status).toBe(200);
    expect(created.headers.get("cache-control")).toBe("no-store");
    const { recoveryToken } = await created.json();
    const redeemed = await post(s.room.code, { action: "redeem", recoveryToken });
    expect(redeemed.status).toBe(200);
    expect(typeof (await redeemed.json()).ownerToken).toBe("string");
    expect((await post(s.room.code, { action: "redeem", recoveryToken })).status).toBe(403);
    expect((await post(s.room.code, { action: "boom" })).status).toBe(400);
  });

  it("guessing is rate limited per address", async () => {
    const s = await fresh();
    const codes: number[] = [];
    for (let i = 0; i < 30; i += 1) codes.push((await post(s.room.code, { action: "redeem", recoveryToken: `guess${i}` }, "30.0.0.9")).status);
    expect(codes).toContain(429);
  });
});
