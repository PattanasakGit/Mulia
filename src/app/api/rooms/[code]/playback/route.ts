import { fail, json, readJson } from "@/lib/http";
import { applyPlayback } from "@/lib/rooms";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const body = await readJson(request);
    return json(
      await applyPlayback(code, body.action, {
        positionMs: body.positionMs,
        trackId: body.trackId,
        durationSec: body.durationSec,
      }),
    );
  } catch (error) {
    return fail(error);
  }
}
