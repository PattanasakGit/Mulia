import { fail, guard, json, readJson } from "@/lib/http";
import { enqueue, playQueued, removeQueued, reorderQueued } from "@/lib/rooms";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const body = await readJson(request);
    const adding = !(typeof body.removeId === "string" || typeof body.playId === "string" || Array.isArray(body.order));
    const limited = guard(request, adding ? "add" : "queue");
    if (limited) return limited;
    if (typeof body.removeId === "string") return json(await removeQueued(code, body.removeId));
    if (typeof body.playId === "string") return json(await playQueued(code, body.playId));
    if (Array.isArray(body.order)) return json(await reorderQueued(code, body.order));
    return json(await enqueue(code, body.url, body.memberName));
  } catch (error) {
    return fail(error);
  }
}
