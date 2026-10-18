import { describe, expect, it } from "vitest";
import { isPlayerAlive } from "@/components/vinyl";
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
