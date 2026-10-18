import type { Playback } from "@/lib/types";

export function formatTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const padded = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${padded}`;
  return `${minutes}:${padded}`;
}

export function projectPosition(
  playback: Pick<Playback, "status" | "positionMs" | "anchorMs">,
  serverNow: number,
  receivedAt: number,
  now = Date.now(),
) {
  if (playback.status !== "playing") return Math.max(0, playback.positionMs);
  const atSnapshot =
    playback.positionMs + Math.max(0, serverNow - playback.anchorMs);
  return Math.max(0, atSnapshot + (now - receivedAt));
}

// A re-poll of an unchanged playback only carries network latency noise, so the running clock is
// kept unless the server clearly disagrees. Any real change (seek, pause, next) rebases at once.
const REBASE_AFTER_MS = 1200;

export class PositionClock {
  private seen: { serverNow: number; at: number } | null = null;
  private line: { key: string; base: number; at: number } | null = null;

  read(
    playback: Pick<Playback, "status" | "positionMs" | "anchorMs">,
    serverNow: number,
    now: number,
  ) {
    if (!this.seen || this.seen.serverNow !== serverNow) {
      this.seen = { serverNow, at: Date.now() };
    }
    const at = this.seen.at;
    const key = `${playback.status}:${playback.positionMs}:${playback.anchorMs}`;
    const fresh = projectPosition(playback, serverNow, at, at);
    const held = this.line;
    const expected = held ? held.base + Math.max(0, at - held.at) : 0;
    if (
      !held ||
      held.key !== key ||
      playback.status !== "playing" ||
      Math.abs(fresh - expected) > REBASE_AFTER_MS
    ) {
      this.line = { key, base: fresh, at };
    }
    const line = this.line as { base: number; at: number };
    if (playback.status !== "playing") return line.base;
    return line.base + Math.max(0, Math.max(now, Date.now()) - line.at);
  }
}

export function safeNext(value: string | null) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/enter")
  ) {
    return "/archive";
  }
  return value;
}
