import { connection } from "next/server";
import { fail, json } from "@/lib/http";
import { getLiveNow } from "@/lib/rooms";

export async function GET() {
  await connection();
  try {
    return json(await getLiveNow());
  } catch (error) {
    return fail(error);
  }
}
