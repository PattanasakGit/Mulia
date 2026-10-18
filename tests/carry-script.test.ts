import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { themeScript } from "@/lib/theme-script";

function run(search: string, stored: Record<string, string> = {}, hostname = "localhost") {
  const store = new Map(Object.entries(stored));
  const replaced: string[] = [];
  const documentElement = { attrs: {} as Record<string, string>, setAttribute(k: string, v: string) { this.attrs[k] = v; } };
  const ctx = {
    location: { hostname, port: "3000", pathname: "/r/ABC", search, hash: "", replace: (u: string) => replaced.push(u) },
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    history: { replaceState: (_s: unknown, _t: string, u: string) => replaced.push(u) },
    document: { documentElement },
    URLSearchParams,
    JSON,
  };
  vm.runInNewContext(themeScript, ctx);
  return { store, replaced, theme: documentElement.attrs["data-theme"] };
}

describe("inline theme/carry script", () => {
  it("applies the saved theme", () => {
    expect(run("", { "sound-index-theme": "dark" }).theme).toBe("dark");
  });
  it("FIX: malformed ?carry= no longer aborts the script; theme still applied", () => {
    const r = run("?carry=%7Bnot-json", { "sound-index-theme": "dark" });
    expect(r.theme).toBe("dark");
    expect(r.store.has("sound-index-identity")).toBe(false);
    expect(r.replaced).toEqual(["/r/ABC"]); // param stripped
  });
  // group B (intentional): carry acceptance semantics unchanged
  it("group B: valid carry overwrites the stored identity; id is not validated", () => {
    const carry = encodeURIComponent(JSON.stringify({ id: "x", name: "Carried", hue: 5, emoji: "🦊", extra: 1 }));
    const r = run(`?carry=${carry}&a=1`, { "sound-index-identity": '{"id":"old"}', "sound-index-theme": "light" });
    expect(JSON.parse(r.store.get("sound-index-identity")!)).toEqual({ id: "x", name: "Carried", hue: 5, emoji: "🦊" });
    expect(r.replaced).toEqual(["/r/ABC?a=1"]);
    expect(r.theme).toBe("light");
  });
  it("group B: names over 32 chars and non-string ids are ignored (still stripped)", () => {
    for (const bad of [{ id: "x", name: "n".repeat(33) }, { id: 1, name: "a" }, null]) {
      const r = run(`?carry=${encodeURIComponent(JSON.stringify(bad))}`);
      expect(r.store.has("sound-index-identity")).toBe(false);
      expect(r.replaced).toEqual(["/r/ABC"]);
    }
  });
  it("127.0.0.1 redirects to localhost carrying the identity", () => {
    const r = run("", { "sound-index-identity": '{"id":"i"}' }, "127.0.0.1");
    expect(r.replaced[0]).toBe(`http://localhost:3000/r/ABC?carry=${encodeURIComponent('{"id":"i"}')}`);
  });
});
