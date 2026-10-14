import { fail, json, readJson } from "@/lib/http";
import { joinRoom } from "@/lib/rooms";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const body = await readJson(request);
    return json(joinRoom(code, body.memberId, body.memberName, body.emoji));
  } catch (error) {
    return fail(error);
  }
}
