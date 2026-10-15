import { fail, json, readJson } from "@/lib/http";
import { closeRoom } from "@/lib/rooms";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const body = await readJson(request);
    await closeRoom(code, body.memberId, body.memberName);
    return json({ closed: true });
  } catch (error) {
    return fail(error);
  }
}
