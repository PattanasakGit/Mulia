/** MULIA-BUGHUNT-02-FIX regressions: A1 proxy hops, B1 Space key, B2 auto-skip delay, B4 index, B7 rollback. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp } from "@/lib/ratelimit";
import { spaceBelongsToTarget } from "@/lib/keys";
import { moveId, orderTracks, restoreOrder } from "@/lib/queue-order";
import { AUTO_SKIP_MS } from "@/components/vinyl";
import { query } from "@/lib/db";
import { resetAll } from "./helpers";
import type { Track } from "@/lib/types";

afterEach(() => vi.unstubAllEnvs());
const xff = (value: string) => new Headers({ "x-forwarded-for": value });

describe("A1 TRUST_PROXY_HOPS", () => {
  it("defaults to 1: last entry, spoofed prefix ignored", () => {
    expect(clientIp(xff("6.6.6.6, 203.0.113.9"))).toBe("203.0.113.9");
  });
  it("2 hops (CDN + nginx): the client in front of the CDN edge", () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "2");
    expect(clientIp(xff("198.51.100.7, 172.16.0.1"))).toBe("198.51.100.7");
    expect(clientIp(xff("6.6.6.6, 198.51.100.7, 172.16.0.1"))).toBe("198.51.100.7");
  });
  it("more hops than entries falls back to the first entry", () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "5");
    expect(clientIp(xff("198.51.100.7"))).toBe("198.51.100.7");
  });
  it("invalid values behave like 1", () => {
    for (const bad of ["0", "-2", "abc", ""]) {
      vi.stubEnv("TRUST_PROXY_HOPS", bad);
      expect(clientIp(xff("1.1.1.1, 2.2.2.2"))).toBe("2.2.2.2");
    }
  });
  it("platform headers win on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    expect(clientIp(new Headers({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" }))).toBe("9.9.9.9");
  });
  it("platform headers win when a proxy that overwrites them is declared", () => {
    vi.stubEnv("TRUST_PLATFORM_IP_HEADERS", "1");
    expect(clientIp(new Headers({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" }))).toBe("9.9.9.9");
  });
  it("self-hosted: a client-supplied x-real-ip / x-vercel-forwarded-for cannot pick its own bucket", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUST_PLATFORM_IP_HEADERS", "");
    const headers = new Headers({ "x-real-ip": "9.9.9.9", "x-vercel-forwarded-for": "8.8.8.8", "x-forwarded-for": "203.0.113.9" });
    expect(clientIp(headers)).toBe("203.0.113.9");
  });
});

describe("B1 Space shortcut yields to focused controls", () => {
  const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, ...extra }) as unknown as EventTarget;
  it("buttons, links, inputs, selects, sliders, editable text keep their own Space", () => {
    for (const tag of ["BUTTON", "A", "INPUT", "TEXTAREA", "SELECT", "SUMMARY"]) expect(spaceBelongsToTarget(el(tag))).toBe(true);
    expect(spaceBelongsToTarget(el("DIV", { getAttribute: () => "slider" }))).toBe(true);
    expect(spaceBelongsToTarget(el("DIV", { isContentEditable: true }))).toBe(true);
  });
  it("anything inside an open dialog is left alone", () => {
    expect(spaceBelongsToTarget(el("DIV", { closest: () => ({}) }))).toBe(true);
  });
  it("body / plain elements still toggle playback", () => {
    expect(spaceBelongsToTarget(el("BODY", { closest: () => null }))).toBe(false);
    expect(spaceBelongsToTarget(null)).toBe(false);
  });
});

describe("B2 auto-skip a rejected video", () => {
  it("waits long enough to read the message, but not forever", () => {
    expect(AUTO_SKIP_MS).toBeGreaterThanOrEqual(2000);
    expect(AUTO_SKIP_MS).toBeLessThanOrEqual(10_000);
  });
});

describe("B4 snapshot adder lookup has an index", () => {
  it("members(room_id, name, last_seen) index exists", async () => {
    await resetAll();
    const rows = await query<{ indexname: string }>("SELECT indexname FROM pg_indexes WHERE tablename = 'members'");
    expect(rows.map((r) => r.indexname)).toContain("idx_members_room_name");
  });
});

describe("B7 failed reorder rolls back without losing newer tracks", () => {
  const t = (id: string) => ({ id }) as Track;
  it("restores the old order and keeps tracks that arrived meanwhile", () => {
    const before = ["a", "b", "c"];
    const optimistic = orderTracks(before.map(t), moveId(before, "a", "c")!);
    expect(optimistic.map((x) => x.id)).toEqual(["b", "c", "a"]);
    const withNew = [...optimistic, t("d")];
    expect(restoreOrder(withNew, before).map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("ignores ids that were removed meanwhile", () => {
    expect(restoreOrder([t("b"), t("c")], ["a", "b", "c"]).map((x) => x.id)).toEqual(["b", "c"]);
  });
});

describe("L2 phone top-bar keeps 8px between adjacent controls", () => {
  it("uses an 8px gap in the <=560px room top-bar rule", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/app/globals.css", "utf8");
    const rule = css.match(/@media \(max-width: 560px\) \{\s*\.room-app \.brand span[\s\S]*?\n\}/)?.[0] ?? "";
    expect(rule).toMatch(/\.room-app \.topbar-end \{ gap: 8px; \}/);
  });
});
