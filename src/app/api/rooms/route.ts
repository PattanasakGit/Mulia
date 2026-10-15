import { connection } from "next/server";
import { fail, json, readJson } from "@/lib/http";
import { createRoom, listRooms } from "@/lib/rooms";

export async function GET() {
  await connection();
  try {
    return json({ rooms: await listRooms() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
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
