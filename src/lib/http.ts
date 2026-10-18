import { ArchiveError } from "@/lib/rooms";
import { checkLimit, type Kind } from "@/lib/ratelimit";

const NO_STORE = { "cache-control": "no-store" };

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: NO_STORE });
}

// Every real body is a few hundred bytes (a 100-id reorder is ~4KB); anything bigger is not ours.
const MAX_BODY_BYTES = 16 * 1024;

export async function readJson(request: Request) {
  try {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_BODY_BYTES) return {};
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return {};
    const body = JSON.parse(text);
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    return {};
  }
  return {};
}

/** Returns a 429 response when this client is over its limit, otherwise null. */
export function guard(request: Request, kind: Kind) {
  const wait = checkLimit(request, kind);
  if (wait <= 0) return null;
  return Response.json(
    { error: "คำขอถี่เกินไป รอสักครู่แล้วลองใหม่", retryAfterMs: wait },
    { status: 429, headers: { ...NO_STORE, "retry-after": String(Math.max(1, Math.ceil(wait / 1000))) } },
  );
}

export function fail(error: unknown) {
  if (error instanceof ArchiveError) return json({ error: error.message }, error.status);
  console.error(error);
  return json({ error: "ระบบไม่พร้อมใช้งาน" }, 500);
}
