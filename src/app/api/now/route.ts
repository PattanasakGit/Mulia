import { connection } from "next/server";
import { fail, guard, json } from "@/lib/http";
import { getLiveNowShared } from "@/lib/rooms";

export async function GET(request: Request) {
  await connection();
  const limited = guard(request, "list");
  if (limited) return limited;
  try {
    return json(await getLiveNowShared());
  } catch (error) {
    return fail(error);
  }
}
