import { connection } from "next/server";
import { fail, guard, json, readJson, requireMember } from "@/lib/http";
import { listFeedback, submitFeedback } from "@/lib/feedback";

export async function GET(request: Request) {
  await connection();
  const limited = guard(request, "list");
  if (limited) return limited;
  try {
    requireMember(request);
    return json(await listFeedback(new URL(request.url).searchParams.get("before")));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  const limited = guard(request, "feedback");
  if (limited) return limited;
  try {
    requireMember(request);
    const body = await readJson(request);
    // Only topic and body are read; anything else a client sends is ignored, never stored.
    return json({ item: await submitFeedback({ topic: body.topic, body: body.body }) }, 201);
  } catch (error) {
    return fail(error);
  }
}
