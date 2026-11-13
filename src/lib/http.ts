import { ArchiveError } from "@/lib/rooms";
import { checkLimit, type Kind } from "@/lib/ratelimit";

const NO_STORE = { "cache-control": "no-store" };

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: NO_STORE });
}

// Every real body is a few hundred bytes (a 100-id reorder is ~4KB); anything bigger is not ours.
const MAX_BODY_BYTES = 16 * 1024;

async function readCapped(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return null;
  if (!request.body) return "";
  // Count real bytes while reading, so a chunked body without content-length cannot be buffered whole.
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await readCapped(request);
  if (text === null) throw new ArchiveError("คำขอใหญ่เกินไป", 413);
  if (!text.trim()) return {};
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ArchiveError("คำขอไม่ถูกต้อง", 400);
  }
  if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  throw new ArchiveError("คำขอไม่ถูกต้อง", 400);
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
