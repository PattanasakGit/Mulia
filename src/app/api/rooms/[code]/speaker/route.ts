import { fail, guard, json, readJson } from "@/lib/http";
import { claimSpeaker, setSpeakerMode } from "@/lib/rooms";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const limited = guard(request, "speaker");
  if (limited) return limited;
  try {
    const { code } = await params;
    const body = await readJson(request);
    // Anyone with the room code may move the speaker or switch the mode (there are no accounts yet).
    if (body.action === "mode") return json(await setSpeakerMode(code, body.mode, body.deviceId, body.label));
    return json(await claimSpeaker(code, body.deviceId, body.label));
  } catch (error) {
    return fail(error);
  }
}
