import { describe, expect, it } from "vitest";
import { formatTime, projectPosition, safeNext } from "@/lib/time";

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
