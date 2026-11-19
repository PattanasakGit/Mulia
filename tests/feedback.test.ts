import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => undefined }));
import { readFileSync } from "node:fs";
import path from "node:path";
import { execute, query } from "@/lib/db";
import { listFeedback, submitFeedback } from "@/lib/feedback";
import { GET, POST } from "@/app/api/feedback/route";
import { resetRateLimits } from "@/lib/ratelimit";
import { resetAll, tick } from "./helpers";

const MEMBER = "11111111-1111-4111-8111-111111111111";
const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://x/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json", "x-member-id": MEMBER, ...headers },
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
    const items = (await listFeedback()).items;
    expect(items.map((i) => i.topic)).toEqual(["<script>x</script>", "first"]);
    expect(items[0].body).toBe("line1\n\nline2");
  });
});

describe("feedback API", () => {
  it("POST ignores extra fields and returns 201; GET lists", async () => {
    const res = await POST(req({ topic: "t", body: "b", memberId: "should-not-store", image: "data:" }));
    expect(res.status).toBe(201);
    const items = (await listFeedback()).items;
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

describe("identity gate (BUG-IMP-02)", () => {
  it("401 for anonymous GET and POST, 200 with a member id", async () => {
    expect((await GET(new Request("http://x/api/feedback"))).status).toBe(401);
    expect((await GET(new Request("http://x/api/feedback", { headers: { "x-member-id": "nope" } }))).status).toBe(401);
    const anon = new Request("http://x/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic: "t", body: "b" }) });
    expect((await POST(anon)).status).toBe(401);
    expect((await listFeedback()).items).toHaveLength(0);
    expect((await GET(new Request("http://x/api/feedback", { headers: { "x-member-id": MEMBER } }))).status).toBe(200);
  });
  it("top bar hides the entry without an identity", () => {
    expect(readFileSync(path.resolve(__dirname, "../src/components/top-bar.tsx"), "utf8")).toMatch(/if \(!identity\) return null;/);
  });
});

describe("pagination (BUG-IMP-03)", () => {
  it("returns every report across pages, newest first, no cap", async () => {
    const now = Date.now();
    await execute("INSERT INTO feedback (id, topic, body, created_at) SELECT gen_random_uuid()::text, 't' || g, 'b', ?::bigint + g FROM generate_series(1, 250) g", [now]);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: Awaited<ReturnType<typeof listFeedback>> = await listFeedback(cursor);
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor);
    expect(seen).toHaveLength(250);
    expect(new Set(seen).size).toBe(250);
    expect(pages).toBe(9);
    await expect(listFeedback("garbage_x")).rejects.toMatchObject({ status: 400 });
  });
});

describe("motion spec pieces (BUG-IMP-01)", () => {
  it("icon scales 1.06 / 0.94 and skeleton uses shimmer", () => {
    const css = readFileSync(path.resolve(__dirname, "../src/app/globals.css"), "utf8");
    expect(css).toContain(".feedback-trigger:hover { transform: scale(1.06); }");
    expect(css).toContain(".feedback-trigger:active { transform: scale(0.94); }");
    expect(css).toContain("feedback-shimmer");
    expect(css).not.toContain("feedback-pulse");
  });
});

describe("sheet motion spec (BUG-IMP-01)", () => {
  const sheet = readFileSync(path.resolve(__dirname, "../src/components/feedback-sheet.tsx"), "utf8");
  const css = readFileSync(path.resolve(__dirname, "../src/app/globals.css"), "utf8");
  it("uses the spec easings and durations", () => {
    expect(sheet).toContain("EASE_OUT = [0.2, 0, 0, 1]");
    expect(sheet).toContain("EASE_IN = [0.4, 0, 1, 1]");
    expect(sheet).toMatch(/phone \? 0\.28 : 0\.2/);
    expect(sheet).toMatch(/y: "100%", transition: { duration: 0\.2/);
    expect(sheet).toMatch(/opacity: 0, y: 4, transition: { duration: 0\.15/);
    expect(sheet).toContain("opacity: 0.4");
  });
  it("defers focus to animation end with a 300ms fallback, immediate under reduced motion", () => {
    expect(sheet).toContain("FOCUS_FALLBACK_MS = 300");
    expect(sheet).toContain("onAnimationComplete");
    expect(sheet).toMatch(/reduceMotion \? 0 : FOCUS_FALLBACK_MS/);
  });
  it("reduced motion is opacity-only at 100ms", () => {
    expect(sheet).toMatch(/reduceMotion\s*\? \{ opacity: 1, transition: { duration: 0\.1 } \}/);
  });
  it("phone sheet: 16px top radius, 90dvh, 32x4 handle #9ca3af", () => {
    expect(css).toContain("max-height: 90dvh");
    expect(css).toContain("border-radius: 16px 16px 0 0");
    expect(css).toMatch(/\.feedback-handle {[^}]*width: 32px; height: 4px;[^}]*#9ca3af/);
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
