import { describe, expect, it } from "vitest";
import { awaitingNextTrack, isPlayerAlive, recentlyBuffered } from "@/components/vinyl";
import type { YouTubePlayer } from "@/types/youtube";

const fake = (iframe: unknown) => ({ getIframe: () => iframe }) as unknown as YouTubePlayer;

describe("isPlayerAlive (guards YT widgetapi calls after iframe removal)", () => {
  it("null player is not alive", () => expect(isPlayerAlive(null)).toBe(false));
  it("iframe removed from the document → not alive", () => expect(isPlayerAlive(fake({ isConnected: false }))).toBe(false));
  it("iframe attached → alive", () => expect(isPlayerAlive(fake({ isConnected: true }))).toBe(true));
  it("getIframe throwing (destroyed) → not alive", () => {
    const p = { getIframe: () => { throw new TypeError("Cannot read properties of null (reading 'src')"); } } as unknown as YouTubePlayer;
    expect(isPlayerAlive(p)).toBe(false);
  });
});

describe("awaitingNextTrack (no replay of a finished song while the server advances)", () => {
  it("ENDED after the ended report → hold", () => expect(awaitingNextTrack(0, "a", "a")).toBe(true));
  it("not reported yet → no hold", () => expect(awaitingNextTrack(0, null, "a")).toBe(false));
  it("a different track is current → no hold", () => expect(awaitingNextTrack(0, "a", "b")).toBe(false));
  it("player not ended (restart/seek) → no hold", () => expect(awaitingNextTrack(1, "a", "a")).toBe(false));
  it("no track → no hold", () => expect(awaitingNextTrack(0, null, null)).toBe(false));
});

describe("recentlyBuffered (no drift seek while the player is still catching up)", () => {
  it("never buffered → false", () => expect(recentlyBuffered(0, 100_000)).toBe(false));
  it("buffered 2s ago → true", () => expect(recentlyBuffered(98_000, 100_000)).toBe(true));
  it("buffered long ago → false", () => expect(recentlyBuffered(80_000, 100_000)).toBe(false));
});
