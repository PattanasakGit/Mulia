import { describe, expect, it } from "vitest";
import { announcement, FAILURE_MESSAGES, FAILURE_PHRASES, overlayState } from "@/lib/player-gate";

const base = { hasTrack: true, ready: true, failure: null, gate: false } as const;

describe("overlayState", () => {
  it("is idle without a track, whatever else is set", () => {
    expect(overlayState({ ...base, hasTrack: false, failure: "api", gate: true })).toBe("idle");
  });
  it("is loading until the player is ready", () => {
    expect(overlayState({ ...base, ready: false })).toBe("loading");
    expect(overlayState({ ...base, ready: false, gate: true })).toBe("loading");
  });
  it("shows the gate only once ready", () => {
    expect(overlayState({ ...base, gate: true })).toBe("gate");
  });
  it("error beats loading and gate", () => {
    expect(overlayState({ ...base, ready: false, failure: "timeout" })).toBe("error");
    expect(overlayState({ ...base, gate: true, failure: "video" })).toBe("error");
  });
  it("is idle when playing normally", () => {
    expect(overlayState(base)).toBe("idle");
  });
});

describe("announcement", () => {
  it("announces loading and each failure, and is silent otherwise", () => {
    expect(announcement("loading", null)).toBe("กำลังเชื่อมต่อ…");
    for (const kind of ["api", "timeout", "video"] as const) {
      expect(announcement("error", kind)).toBe(FAILURE_MESSAGES[kind]);
    }
    expect(announcement("gate", null)).toBe("");
    expect(announcement("idle", null)).toBe("");
  });
});

describe("FAILURE_PHRASES", () => {
  it("joins back to the exact message for every failure", () => {
    for (const kind of ["api", "timeout", "video"] as const) {
      expect(FAILURE_PHRASES[kind].join("")).toBe(FAILURE_MESSAGES[kind]);
    }
  });
});
