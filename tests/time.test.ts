import { describe, expect, it } from "vitest";
import { PositionClock, formatTime, projectPosition, safeNext } from "@/lib/time";

describe("time", () => {
  it("formatTime", () => {
    expect(formatTime(-5)).toBe("0:00");
    expect(formatTime(65_900)).toBe("1:05");
    expect(formatTime(3_725_000)).toBe("1:02:05");
  });
  it("projectPosition", () => {
    expect(projectPosition({ status: "paused", positionMs: 500, anchorMs: 0 }, 9, 9, 99)).toBe(500);
    expect(projectPosition({ status: "idle", positionMs: -1, anchorMs: 0 }, 9, 9, 99)).toBe(0);
    expect(projectPosition({ status: "playing", positionMs: 1000, anchorMs: 100 }, 600, 2000, 2300)).toBe(1800);
    expect(projectPosition({ status: "playing", positionMs: 1000, anchorMs: 900 }, 600, 2000, 2000)).toBe(1000);
  });
  it("safeNext only allows same-site relative paths", () => {
    for (const v of [
      null,
      "",
      "http://x",
      "//evil",
      "/\\evil.example",
      "/\\/evil.example",
      "/%2F%2Fevil.example",
      "/enter?x",
      "x",
    ]) {
      expect(safeNext(v)).toBe("/archive");
    }
    expect(safeNext("/r/ABC")).toBe("/r/ABC");
    expect(safeNext("/archive")).toBe("/archive");
  });
});

describe("PositionClock", () => {
  const playing = { status: "playing" as const, positionMs: 0, anchorMs: 1000 };
  it("keeps its own clock when a re-poll only differs by latency", () => {
    const clock = new PositionClock();
    expect(clock.read(playing, 1000, 1000, 1000)).toBe(0);
    expect(clock.read(playing, 1000, 1000, 3000)).toBe(2000);
    // next poll arrives 400ms "late": server says 2400 but we show ~2200 — no step
    const shown = clock.read(playing, 3400, 3200, 3200);
    expect(shown).toBe(2200);
  });
  it("rebases at once on a seek, pause or new anchor", () => {
    const clock = new PositionClock();
    clock.read(playing, 1000, 1000, 2000);
    expect(clock.read({ ...playing, positionMs: 90_000, anchorMs: 2100 }, 2100, 2100, 2100)).toBe(90_000);
    expect(clock.read({ status: "paused", positionMs: 5000, anchorMs: 2200 }, 2200, 2200, 9000)).toBe(5000);
  });
  it("rebases when the server disagrees by more than 1.2s", () => {
    const clock = new PositionClock();
    clock.read(playing, 1000, 1000, 1000);
    expect(clock.read(playing, 21_000, 11_000, 11_000)).toBe(20_000);
  });
});
