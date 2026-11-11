/** Overlay states for the video player shell (MULIA-PLAYGATE-01). */
export type OverlayState = "idle" | "loading" | "gate" | "error";
export type PlayerFailure = "api" | "timeout" | "video";

/** Max wait for the YouTube iframe API script, then for the player to report ready. */
export const API_TIMEOUT_MS = 10_000;
export const READY_TIMEOUT_MS = 15_000;

/**
 * Error wins over everything (the user must be able to retry); loading hides the gate because the
 * player cannot be tapped into playing before it exists; the gate shows once the player is ready.
 */
export function overlayState(input: {
  hasTrack: boolean;
  ready: boolean;
  failure: PlayerFailure | null;
  gate: boolean;
}): OverlayState {
  if (!input.hasTrack) return "idle";
  if (input.failure) return "error";
  if (!input.ready) return "loading";
  return input.gate ? "gate" : "idle";
}

export const FAILURE_MESSAGES: Record<PlayerFailure, string> = {
  api: "โหลดตัวเล่นวิดีโอไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง",
  timeout: "การเชื่อมต่อใช้เวลานานเกินไป ลองอีกครั้ง",
  video: "เล่นวิดีโอนี้ไม่ได้ อาจถูกจำกัดการเผยแพร่หรือถูกลบ ลองเพลงอื่นแทน",
};

export const GATE_LABEL = "แตะเพื่อฟังพร้อมเพื่อน";
export const LOADING_LABEL = "กำลังเชื่อมต่อ…";
export const RETRY_LABEL = "ลองอีกครั้ง";
export const SKIP_LABEL = "ข้ามไปเพลงถัดไป";

/** Text for the persistent aria-live region; empty when nothing needs announcing. */
export function announcement(state: OverlayState, failure: PlayerFailure | null): string {
  if (state === "loading") return LOADING_LABEL;
  if (state === "error" && failure) return FAILURE_MESSAGES[failure];
  return "";
}
