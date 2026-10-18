/**
 * QA findings. Group A was approved and fixed (2026-10-17): tests assert the NEW behaviour.
 * Group B is intentional per the user: tests assert CURRENT behaviour; do not change.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { execute, queryOne } from "@/lib/db";
import { applyPlayback, createRoom, enqueue, getSnapshot, joinRoom } from "@/lib/rooms";
import { A, B, resetAll, tick, vid } from "./helpers";

beforeEach(resetAll);

async function seed(n: number, status = "queued") {
  const s = await createRoom({ memberId: A, memberName: "Owner" });
  for (let i = 0; i < n; i += 1) {
    await execute(
      "INSERT INTO tracks VALUES (?, ?, 'aaaaaaaaaaa', 't', 'a', NULL, NULL, 'Owner', ?, ?)",
      [`seed${i}`, s.room.id, i, status],
    );
  }
  return s;
}
const count = async () => (await queryOne<{ n: number }>("SELECT COUNT(*)::int AS n FROM tracks"))!.n;

describe("group A (fixed)", () => {
  it("queue limit counts only unplayed tracks", async () => {
    const s = await seed(100, "played");
    const q = await enqueue(s.room.code, vid(1), "Owner");
    expect(q.queue.filter((t) => t.status !== "played")).toHaveLength(1);
  });

  it("queue limit still applies to 100 unplayed (queued/current) tracks", async () => {
    const s = await seed(100);
    await expect(enqueue(s.room.code, vid(1), "Owner")).rejects.toThrow(/คิวเต็ม/);
  });

  it("concurrent enqueues at 99 never exceed the limit (check is inside the transaction)", async () => {
    const s = await seed(99);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => enqueue(s.room.code, vid(i + 1), "Owner")),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").map((r) => String((r as PromiseRejectedResult).reason?.message))).toEqual(
      Array(4).fill(expect.stringMatching(/คิวเต็ม/)),
    );
    expect(await count()).toBe(100);
  });

  it("'next' with the current track id: a double press skips only one track", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    let snap = s;
    for (let i = 1; i <= 3; i += 1) { tick(1); snap = await enqueue(s.room.code, vid(i), "Owner"); }
    const skipping = snap.queue[0].id;
    await Promise.all([
      applyPlayback(s.room.code, "next", { trackId: skipping }),
      applyPlayback(s.room.code, "next", { trackId: skipping }),
    ]);
    expect((await getSnapshot(s.room.code))!.playback.trackId).toBe(snap.queue[1].id);
  });

  it("'next' without a track id keeps the old behaviour (advances each call)", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    let snap = s;
    for (let i = 1; i <= 3; i += 1) { tick(1); snap = await enqueue(s.room.code, vid(i), "Owner"); }
    await applyPlayback(s.room.code, "next", {});
    await applyPlayback(s.room.code, "next", {});
    expect((await getSnapshot(s.room.code))!.playback.trackId).toBe(snap.queue[2].id);
  });

  it("concurrent GET polls heal an overrun track exactly once (transaction)", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    let snap = s;
    for (let i = 1; i <= 3; i += 1) { tick(1); snap = await enqueue(s.room.code, vid(i), "Owner"); }
    await execute("UPDATE tracks SET duration_sec = 1 WHERE id = ?", [snap.queue[0].id]);
    tick(5000);
    const polls = await Promise.all(Array.from({ length: 6 }, () => getSnapshot(s.room.code)));
    // advanced to track 2, not further (track 2 has no duration yet, so it can't overrun)
    expect(polls.every((p) => p!.playback.trackId === snap.queue[1].id)).toBe(true);
    expect((await getSnapshot(s.room.code))!.queue.map((t) => t.status)).toEqual(["played", "current", "queued"]);
  });
});

describe("group B (intentional, current behaviour; do not change)", () => {
  // group B: /join with another member's id overwrites that member
  it("join with someone else's memberId overwrites their name", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    const j = await joinRoom(s.room.code, A, "Impostor");
    expect(j.members.map((m) => m.name)).toEqual(["Impostor"]);
    expect(j.room.openedBy).toBe(A);
  });

  // group B: duration is client-reported and trusted
  it("any client can set track duration, which caps seek", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    const q = await enqueue(s.room.code, vid(1), "Owner");
    await applyPlayback(s.room.code, "duration", { trackId: q.queue[0].id, durationSec: 2 });
    await applyPlayback(s.room.code, "seek", { positionMs: 60_000 });
    expect((await getSnapshot(s.room.code))!.playback.positionMs).toBe(2000);
  });

  // group B: memberId regex /^[0-9a-f-]{36}$/ accepts dash-only ids
  it("dash-only memberId is accepted", async () => {
    const s = await createRoom({ memberId: "-".repeat(36), memberName: "Dashes" });
    expect(s.room.openedBy).toBe("-".repeat(36));
    await joinRoom(s.room.code, "0".repeat(36), "Zeros");
    expect(B).toBeTruthy();
  });

  // group B: ?carry= acceptance semantics -> tests/carry-script.test.ts
});
