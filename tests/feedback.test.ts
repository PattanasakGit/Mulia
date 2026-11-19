import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { execute, query } from "@/lib/db";
import { listFeedback, submitFeedback } from "@/lib/feedback";
import { POST } from "@/app/api/feedback/route";
import { resetRateLimits } from "@/lib/ratelimit";
import { resetAll, tick } from "./helpers";

const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://x/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  await resetAll();
  await execute("TRUNCATE feedback");
  resetRateLimits();
});

describe("feedback storage", () => {
  it("stores only id, topic, body, created_at", async () => {
    const cols = await query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'feedback'");
    expect(cols.map((c) => c.column_name).sort()).toEqual(["body", "created_at", "id", "topic"]);
  });

  it("trims, validates length (80/1000) and rejects empty or non-string", async () => {
    await expect(submitFeedback({ topic: "  ", body: "x" })).rejects.toThrow();
    await expect(submitFeedback({ topic: "a", body: "" })).rejects.toThrow();
    await expect(submitFeedback({ topic: 5, body: "x" })).rejects.toThrow();
    await expect(submitFeedback({ topic: "a".repeat(81), body: "x" })).rejects.toThrow();
    await expect(submitFeedback({ topic: "a", body: "b".repeat(1001) })).rejects.toThrow();
    const ok = await submitFeedback({ topic: "  a   b ", body: ` ${"b".repeat(1000)} ` });
    expect(ok.topic).toBe("a b");
    expect(ok.body.length).toBe(1000);
  });

  it("lists newest first and keeps markup as inert text", async () => {
    await submitFeedback({ topic: "first", body: "1" });
    tick(1000);
    await submitFeedback({ topic: "<script>x</script>", body: "line1\n\n\n\nline2" });
    const items = await listFeedback();
    expect(items.map((i) => i.topic)).toEqual(["<script>x</script>", "first"]);
    expect(items[0].body).toBe("line1\n\nline2");
  });
});

describe("feedback API", () => {
  it("POST ignores extra fields and returns 201; GET lists", async () => {
    const res = await POST(req({ topic: "t", body: "b", memberId: "should-not-store", image: "data:" }));
    expect(res.status).toBe(201);
    const items = await listFeedback();
    expect(items).toHaveLength(1);
    expect(Object.keys(items[0]).sort()).toEqual(["body", "createdAt", "id", "topic"]);
  });

  it("returns 400 for invalid input", async () => {
    expect((await POST(req({ topic: "", body: "b" }))).status).toBe(400);
  });

  it("rate limits one client after a burst", async () => {
    const h = { "x-forwarded-for": "9.9.9.9", "x-member-id": "11111111-1111-4111-8111-111111111111" };
    const codes: number[] = [];
    for (let i = 0; i < 5; i += 1) codes.push((await POST(req({ topic: `t${i}`, body: "b" }, h))).status);
    expect(codes.slice(0, 3)).toEqual([201, 201, 201]);
    expect(codes[3]).toBe(429);
  });

  it("global hourly cap blocks table flooding", async () => {
    const now = Date.now();
    await execute("INSERT INTO feedback (id, topic, body, created_at) SELECT gen_random_uuid()::text, 't', 'b', ? FROM generate_series(1, 300)", [now]);
    await expect(submitFeedback({ topic: "t", body: "b" })).rejects.toMatchObject({ status: 429 });
  });
});

describe("feedback UI wiring", () => {
  const src = (f: string) => readFileSync(path.resolve(__dirname, "../src", f), "utf8");
  it("top bar renders the entry on every TopBar with an accessible label, no 'bug' word in it", () => {
    const bar = src("components/top-bar.tsx");
    expect(bar).toContain("<FeedbackButton />");
    expect(bar).toContain("แจ้งปัญหาหรือเสนอไอเดีย");
    expect(bar).toContain("createPortal");
  });
  it("css has reduced-motion-safe animations and a 44px target", () => {
    const css = src("app/globals.css");
    expect(css).toMatch(/\.feedback-trigger\s*{[^}]*width: 44px/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*{\s*\.feedback-skeleton/);
  });
});
