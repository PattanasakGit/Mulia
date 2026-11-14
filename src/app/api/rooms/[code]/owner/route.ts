import { fail, guard, json, readJson } from "@/lib/http";
import { createOwnerRecovery, redeemOwnerRecovery } from "@/lib/rooms";

// Tokens travel in the POST body only: never in the URL, so they stay out of access logs and Referer.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const limited = guard(request, "recover");
  if (limited) return limited;
  try {
    const { code } = await params;
    const body = await readJson(request);
    if (body.action === "create") return json(await createOwnerRecovery(code, body.ownerToken));
    if (body.action === "redeem") return json(await redeemOwnerRecovery(code, body.recoveryToken));
    return json({ error: "คำขอไม่ถูกต้อง" }, 400);
  } catch (error) {
    return fail(error);
  }
}
