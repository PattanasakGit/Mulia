import { connection } from "next/server";
import { clientIp } from "@/lib/ratelimit";
import { fail, guard, json } from "@/lib/http";
import { getSnapshotShared, touchSpeaker } from "@/lib/rooms";

// A held request can stay open this long (the longest `wait` a client may ask for is below it).
export const maxDuration = 20;

const WAIT_MAX_MS = 7000;
const WAIT_STEP_MS = 400;
const MAX_WAITERS_PER_IP = 6;
const waiters = new Map<string, number>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  await connection();
  const limited = guard(request, "read");
  if (limited) return limited;
  try {
    const { code } = await params;
    let snapshot = await getSnapshotShared(code);
    if (!snapshot) return json({ error: "ไม่พบห้องนี้ใน MULIA" }, 404);
    const query = new URL(request.url).searchParams;
    const have = query.get("v");
    const waitMs = Math.min(WAIT_MAX_MS, Math.max(0, Number(query.get("wait")) || 0) * 1000);

    // Long poll (used by the speaker): hold the request until the room changes, so a hidden tab
    // whose timers are throttled still hears "play" at once. It reads the shared per-instance
    // snapshot, so waiting costs no extra database work, and the number held per address is capped.
    if (have && have === snapshot.rev && waitMs > 0) {
      const ip = clientIp(request.headers);
      if ((waiters.get(ip) ?? 0) < MAX_WAITERS_PER_IP) {
        waiters.set(ip, (waiters.get(ip) ?? 0) + 1);
        try {
          await touchSpeaker(code, query.get("d"));
          // monotonic clock: a wall-clock jump must not stretch or cut the wait
          const deadline = performance.now() + waitMs;
          while (performance.now() < deadline && !request.signal.aborted && snapshot.rev === have) {
            await sleep(WAIT_STEP_MS);
            const next = await getSnapshotShared(code);
            if (!next) return json({ error: "ไม่พบห้องนี้ใน MULIA" }, 404);
            snapshot = next;
          }
        } finally {
          const left = (waiters.get(ip) ?? 1) - 1;
          if (left <= 0) waiters.delete(ip);
          else waiters.set(ip, left);
        }
      }
    }

    // The client already holds this exact state: answer in ~100 bytes instead of the whole queue.
    if (have && have === snapshot.rev) {
      return json({ unchanged: true, serverNow: snapshot.serverNow, rev: snapshot.rev, pollMs: snapshot.pollMs });
    }
    return json(snapshot);
  } catch (error) {
    return fail(error);
  }
}
