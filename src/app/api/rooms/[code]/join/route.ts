import { fail, guard, json, readJson } from "@/lib/http";
import { joinRoom } from "@/lib/rooms";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const limited = guard(request, "join");
  if (limited) return limited;
  try {
    const { code } = await params;
    const body = await readJson(request);
    return json(await joinRoom(code, body.memberId, body.memberName, body.emoji));
  } catch (error) {
    return fail(error);
  }
}
