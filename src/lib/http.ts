import { ArchiveError } from "@/lib/rooms";

const NO_STORE = { "cache-control": "no-store" };

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: NO_STORE });
}

export async function readJson(request: Request) {
  try {
    const body = await request.json();
    if (body && typeof body === "object") return body as Record<string, unknown>;
  } catch {
    return {};
  }
  return {};
}

export function fail(error: unknown) {
  if (error instanceof ArchiveError) return json({ error: error.message }, error.status);
  console.error(error);
  return json({ error: "ระบบไม่พร้อมใช้งาน" }, 500);
}
