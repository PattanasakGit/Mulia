import { fail, guard, json, readJson } from "@/lib/http";
import { closeRoom } from "@/lib/rooms";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const limited = guard(request, "close");
  if (limited) return limited;
  try {
    const { code } = await params;
    const body = await readJson(request);
    await closeRoom(code, body.memberId, body.memberName);
    return json({ closed: true });
  } catch (error) {
    return fail(error);
  }
}
