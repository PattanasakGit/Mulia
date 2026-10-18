import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/client";
import { startPolling } from "@/lib/poll";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5); // jitter factor 1.0
});
afterEach(() => vi.useRealTimers());

const flush = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms); };

describe("startPolling", () => {
  it("runs once now, then on the server's hinted delay", async () => {
    const run = vi.fn(async () => 3000);
    const p = startPolling(run, { baseMs: 1500, hiddenMs: 10000 });
    await flush(0);
    expect(run).toHaveBeenCalledTimes(1);
    await flush(2900); expect(run).toHaveBeenCalledTimes(1);
    await flush(200); expect(run).toHaveBeenCalledTimes(2);
    p.stop();
  });
  it("never has two requests in flight, even if nudged repeatedly", async () => {
    let active = 0, peak = 0;
    const run = vi.fn(async () => { active += 1; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 500)); active -= 1; });
    const p = startPolling(run, { baseMs: 1500, hiddenMs: 10000 });
    for (let i = 0; i < 20; i += 1) p.nudge();
    await flush(5000);
    expect(peak).toBe(1);
    p.stop();
  });
  it("backs off exponentially on errors and recovers to the normal pace", async () => {
    let fail = true;
    const run = vi.fn(async () => { if (fail) throw new ApiError("x", 500); return undefined; });
    const p = startPolling(run, { baseMs: 1500, hiddenMs: 10000 });
    await flush(0); expect(run).toHaveBeenCalledTimes(1);          // t=0 fails -> wait 2s
    await flush(2000); expect(run).toHaveBeenCalledTimes(2);       // fails -> wait 4s
    await flush(3900); expect(run).toHaveBeenCalledTimes(2);
    await flush(200); expect(run).toHaveBeenCalledTimes(3);        // fails -> wait 8s
    fail = false;
    await flush(8000); expect(run).toHaveBeenCalledTimes(4);       // ok -> back to 1.5s
    await flush(1500); expect(run).toHaveBeenCalledTimes(5);
    p.stop();
  });
  it("waits as long as a 429 asks", async () => {
    let first = true;
    const run = vi.fn(async () => { if (first) { first = false; throw new ApiError("slow down", 429, 7000); } });
    const p = startPolling(run, { baseMs: 1500, hiddenMs: 10000 });
    await flush(0); expect(run).toHaveBeenCalledTimes(1);
    await flush(6900); expect(run).toHaveBeenCalledTimes(1);
    await flush(200); expect(run).toHaveBeenCalledTimes(2);
    p.stop();
  });
  it("stop() ends the loop", async () => {
    const run = vi.fn(async () => undefined);
    const p = startPolling(run, { baseMs: 1000, hiddenMs: 10000 });
    await flush(0); p.stop();
    await flush(10000);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("a hidden tab polls rarely unless told to keep pace (e.g. it is playing audio)", async () => {
    vi.stubGlobal("document", { hidden: true });
    try {
      const slow = vi.fn(async () => undefined);
      const a = startPolling(slow, { baseMs: 1500, hiddenMs: 10000 });
      await flush(0); await flush(9000);
      expect(slow).toHaveBeenCalledTimes(1);
      a.stop();
      const keep = vi.fn(async () => undefined);
      const b = startPolling(keep, { baseMs: 1500, hiddenMs: 10000, slowWhenHidden: () => false });
      await flush(0); await flush(4600);
      expect(keep.mock.calls.length).toBeGreaterThanOrEqual(3);
      b.stop();
    } finally { vi.unstubAllGlobals(); }
  });
});
