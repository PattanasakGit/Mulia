import { beforeEach, describe, expect, it, vi } from "vitest";
import { execute, queryOne } from "@/lib/db";
import { applyPlayback, claimSpeaker, createRoom, enqueue, getSnapshot, reorderQueued, setSpeakerMode } from "@/lib/rooms";
import { spendRetry, RETRY_RESET_MS } from "@/lib/retry-budget";
import { A, resetAll, setNow, vid } from "./helpers";

beforeEach(resetAll);

describe("MULIA-LOW-01 A2: added_at is taken under the room lock", () => {
  it("a track whose request started before a reorder still lands last", async () => {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    await enqueue(s.room.code, vid(1), "Owner");
    await enqueue(s.room.code, vid(2), "Owner");
    // request arrives at T0 (slow oEmbed), reorder runs at T0+1000, the insert lands after it
    const slow = vi.fn(async () => {
      setNow(1_700_000_001_000);
      const snap = await getSnapshot(s.room.code);
      await reorderQueued(s.room.code, [snap!.queue[1].id, snap!.queue[0].id]);
      return Response.json({ title: "slow", author_name: "Au", thumbnail_url: "https://i.ytimg.com/t.jpg" });
    });
    vi.stubGlobal("fetch", slow);
    setNow(1_700_000_000_000);
    const out = await enqueue(s.room.code, vid(3), "Owner");
    expect(slow).toHaveBeenCalled();
    expect(out.queue[out.queue.length - 1].title).toBe("slow");
  });
});

describe("MULIA-LOW-01 A3: retry budget refills after a quiet spell", () => {
  it("stops after max, refills after RETRY_RESET_MS", () => {
    let b = { count: 0, at: 0 };
    for (let i = 0; i < 3; i++) {
      const r = spendRetry(b, 1000 + i, 3);
      expect(r.allowed).toBe(true);
      b = r.next;
    }
    expect(spendRetry(b, 2000, 3).allowed).toBe(false);
    const later = spendRetry(b, 1002 + RETRY_RESET_MS + 1, 3);
    expect(later.allowed).toBe(true);
    expect(later.next.count).toBe(1);
  });
});

describe("MULIA-LOW-01 B6: duration only from the speaker / first report", () => {
  async function room(mode: "all" | "single") {
    const s = await createRoom({ memberId: A, memberName: "Owner" });
    const q = await enqueue(s.room.code, vid(1), "Owner");
    await setSpeakerMode(s.room.code, mode, "speaker-device-1", "x");
    return { code: s.room.code, id: q.queue[0].id };
  }
  const dur = async (id: string) => (await queryOne<{ duration_sec: number | null }>("SELECT duration_sec FROM tracks WHERE id = ?", [id]))!.duration_sec;

  it("single mode: non-speaker and missing device are ignored; speaker is accepted and may correct", async () => {
    const { code, id } = await room("single");
    await applyPlayback(code, "duration", { trackId: id, durationSec: 5, deviceId: "other-device-2" });
    await applyPlayback(code, "duration", { trackId: id, durationSec: 5 });
    expect(await dur(id)).toBeNull();
    await applyPlayback(code, "duration", { trackId: id, durationSec: 200, deviceId: "speaker-device-1" });
    expect(await dur(id)).toBe(200);
    await applyPlayback(code, "duration", { trackId: id, durationSec: 210, deviceId: "speaker-device-1" });
    expect(await dur(id)).toBe(210);
  });

  it("all mode: first report wins, later reports cannot shorten it", async () => {
    const { code, id } = await room("all");
    await applyPlayback(code, "duration", { trackId: id, durationSec: 200 });
    await applyPlayback(code, "duration", { trackId: id, durationSec: 1 });
    expect(await dur(id)).toBe(200);
  });

  it("a bogus duration from a listener cannot skip the track", async () => {
    const { code, id } = await room("single");
    await claimSpeaker(code, "speaker-device-1", "x");
    await applyPlayback(code, "duration", { trackId: id, durationSec: 1, deviceId: "evil-device-9" });
    expect((await getSnapshot(code))!.playback.trackId).toBe(id);
  });
});

describe("MULIA-LOW-01 B5: playback anchor index exists", () => {
  it("idx_playback_anchor is created", async () => {
    const row = await queryOne<{ indexname: string }>("SELECT indexname FROM pg_indexes WHERE indexname = 'idx_playback_anchor'");
    expect(row?.indexname).toBe("idx_playback_anchor");
    await execute("SELECT 1");
  });
});
