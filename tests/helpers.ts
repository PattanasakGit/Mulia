import { vi } from "vitest";
import { execute } from "@/lib/db";

export const A = "11111111-1111-4111-8111-111111111111";
export const B = "22222222-2222-4222-8222-222222222222";
export const vid = (n: number) => `https://youtu.be/${String(n).padStart(11, "v")}`;

let clock = 1_700_000_000_000;
export function setNow(ms: number) {
  clock = ms;
}
export function tick(ms: number) {
  clock += ms;
}
export function now() {
  return clock;
}

export async function resetAll() {
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  clock = 1_700_000_000_000;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const id = new URL(new URL(url).searchParams.get("url")!).searchParams.get("v")!;
      if (id.startsWith("x")) return new Response("nope", { status: 404 });
      return Response.json({ title: `T-${id}`, author_name: "Au", thumbnail_url: "https://i.ytimg.com/t.jpg" });
    }),
  );
  await execute("TRUNCATE tracks, playback, members, rooms");
}
