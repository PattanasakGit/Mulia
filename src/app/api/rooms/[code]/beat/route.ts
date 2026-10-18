import { fail, guard, json, readJson } from "@/lib/http";
import { beatRoom } from "@/lib/rooms";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const limited = guard(request, "beat");
  if (limited) return limited;
  try {
    const { code } = await params;
    const body = await readJson(request);
    await beatRoom(code, body.memberId, body.memberName, body.emoji);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
