import { connection } from "next/server";
import { fail, guard, json, readJson } from "@/lib/http";
import { createRoom, listRoomsShared } from "@/lib/rooms";

export async function GET(request: Request) {
  await connection();
  const limited = guard(request, "list");
  if (limited) return limited;
  try {
    return json({ rooms: await listRoomsShared() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  const limited = guard(request, "create");
  if (limited) return limited;
  try {
    const body = await readJson(request);
    return json(
      await createRoom({
        name: body.name,
        memberId: body.memberId,
        memberName: body.memberName,
        emoji: body.emoji,
      }),
    );
  } catch (error) {
    return fail(error);
  }
}
