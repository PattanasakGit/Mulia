import { fail, json, readJson } from "@/lib/http";
import { enqueue, playQueued, removeQueued, reorderQueued } from "@/lib/rooms";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const body = await readJson(request);
    if (typeof body.removeId === "string") return json(removeQueued(code, body.removeId));
    if (typeof body.playId === "string") return json(playQueued(code, body.playId));
    if (Array.isArray(body.order)) return json(reorderQueued(code, body.order));
    return json(await enqueue(code, body.url, body.memberName));
  } catch (error) {
    return fail(error);
  }
}
