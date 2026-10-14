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
