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

const SAME_ORIGIN_PROBE = "http://same-origin.invalid";

function unsafePath(path: string) {
  return (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    // The /enter route itself (not unrelated paths that merely start with "/enter").
    /^\/enter(?:[/?#]|$)/.test(path) ||
    path.includes("://") ||
    // Browsers treat a backslash as "/" and strip tab/CR/LF, so "/\evil" or "/<TAB>/evil" become "//evil".
    /[\\\u0000-\u001f\u007f]/.test(path)
  );
}

/** Same-origin relative path or "/archive". Checks the raw and the percent-decoded value. */
export function safeNext(value: string | null) {
  if (!value) return "/archive";
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return "/archive";
  }
  if (unsafePath(value) || unsafePath(decoded)) return "/archive";
  try {
    if (new URL(value, SAME_ORIGIN_PROBE).origin !== SAME_ORIGIN_PROBE) return "/archive";
  } catch {
    return "/archive";
  }
  return value;
}
