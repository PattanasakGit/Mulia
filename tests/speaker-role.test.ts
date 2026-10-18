import { describe, expect, it } from "vitest";
import { playsAudio, resolveRole } from "@/lib/speaker";
import type { SpeakerState } from "@/lib/types";

const single = (main: string | null, online = true): SpeakerState => ({ mode: "single", mainDeviceId: main, mainLabel: "x", mainOnline: online });
const all: SpeakerState = { mode: "all", mainDeviceId: null, mainLabel: null, mainOnline: false };
const none = { listen: false, remote: false };

describe("resolveRole", () => {
  it("single mode: only the main device is the speaker, others are remotes", () => {
    expect(resolveRole(single("me"), "me", none)).toBe("speaker");
    expect(resolveRole(single("me"), "other", none)).toBe("remote");
    expect(resolveRole(single(null), "other", none)).toBe("remote");
  });
  it("single mode: listening along is the device's own choice", () => {
    expect(resolveRole(single("me"), "other", { listen: true, remote: false })).toBe("listener");
    // being the speaker wins over the local flag
    expect(resolveRole(single("me"), "me", { listen: true, remote: false })).toBe("speaker");
  });
  it("all mode: every device plays unless it chose to stay remote", () => {
    expect(resolveRole(all, "any", none)).toBe("listener");
    expect(resolveRole(all, "any", { listen: false, remote: true })).toBe("remote");
  });
  it("an older server (no speaker block) behaves like all mode", () => {
    expect(resolveRole(undefined, "any", none)).toBe("listener");
  });
  it("an unknown device id (still hydrating) is never the speaker", () => {
    expect(resolveRole(single("me"), "", none)).toBe("remote");
  });
  it("only remotes stay silent", () => {
    expect(playsAudio("speaker")).toBe(true);
    expect(playsAudio("listener")).toBe(true);
    expect(playsAudio("remote")).toBe(false);
  });
});
