import { connection } from "next/server";
import { fail, json } from "@/lib/http";
import { getSnapshot } from "@/lib/rooms";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  await connection();
  try {
    const { code } = await params;
    const snapshot = getSnapshot(code);
    if (!snapshot) return json({ error: "ไม่พบห้องนี้ใน MULIA" }, 404);
    return json(snapshot);
  } catch (error) {
    return fail(error);
  }
}
