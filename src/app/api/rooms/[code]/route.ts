import { connection } from "next/server";
import { fail, guard, json } from "@/lib/http";
import { getSnapshotShared } from "@/lib/rooms";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  await connection();
  const limited = guard(request, "read");
  if (limited) return limited;
  try {
    const { code } = await params;
    const snapshot = await getSnapshotShared(code);
    if (!snapshot) return json({ error: "ไม่พบห้องนี้ใน MULIA" }, 404);
    // The client already holds this exact state: answer in ~100 bytes instead of the whole queue.
    const have = new URL(request.url).searchParams.get("v");
    if (have && have === snapshot.rev) {
      return json({ unchanged: true, serverNow: snapshot.serverNow, rev: snapshot.rev, pollMs: snapshot.pollMs });
    }
    return json(snapshot);
  } catch (error) {
    return fail(error);
  }
}
