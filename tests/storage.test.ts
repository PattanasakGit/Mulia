import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetMemory, getItem, setItem } from "@/lib/storage";
import { parseIdentity, readIdentity, readVolume, writeIdentity, writeVolume } from "@/lib/identity";

function blockedWindow() {
  const w = new EventTarget() as EventTarget & Record<string, unknown>;
  Object.defineProperty(w, "localStorage", {
    get() {
      throw new DOMException("The operation is insecure.", "SecurityError");
    },
  });
  return w;
}

function workingWindow() {
  const data = new Map<string, string>();
  const w = new EventTarget() as EventTarget & Record<string, unknown>;
  w.localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
  return { w, data };
}

afterEach(() => {
  vi.unstubAllGlobals();
  __resetMemory();
});

describe("storage fallback when localStorage is blocked", () => {
  it("get/set do not throw and keep values in memory for the session", () => {
    vi.stubGlobal("window", blockedWindow());
    expect(getItem("k")).toBeNull();
    expect(() => setItem("k", "v")).not.toThrow();
    expect(getItem("k")).toBe("v");
  });

  it("writeIdentity/readIdentity round-trip without storage", () => {
    vi.stubGlobal("window", blockedWindow());
    expect(readIdentity()).toBeNull();
    const id = writeIdentity("  Dev   P ");
    expect(id.name).toBe("Dev P");
    expect(readIdentity()?.id).toBe(id.id);
  });

  it("volume round-trips without storage", () => {
    vi.stubGlobal("window", blockedWindow());
    expect(readVolume()).toEqual({ volume: 100, muted: false });
    writeVolume(40, true);
    expect(readVolume()).toEqual({ volume: 40, muted: true });
  });

  it("uses real localStorage when available (behaviour unchanged)", () => {
    const { w, data } = workingWindow();
    vi.stubGlobal("window", w);
    const id = writeIdentity("Dev");
    expect(JSON.parse(data.get("sound-index-identity") as string).id).toBe(id.id);
    expect(readIdentity()?.name).toBe("Dev");
  });
});

describe("parseIdentity is pure; readIdentity does the emoji migration", () => {
  const legacy = JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", name: "Dev", emoji: "not-an-animal" });
  it("parseIdentity never writes and fills a seeded emoji", () => {
    const { w, data } = workingWindow();
    vi.stubGlobal("window", w);
    data.set("sound-index-identity", legacy);
    const parsed = parseIdentity(legacy);
    expect(parsed?.name).toBe("Dev");
    expect(parsed?.emoji).not.toBe("not-an-animal");
    expect(data.get("sound-index-identity")).toBe(legacy);
    expect(parseIdentity(null)).toBeNull();
    expect(parseIdentity("{bad")).toBeNull();
  });
  it("readIdentity migrates once to the same value parseIdentity returns", () => {
    const { w, data } = workingWindow();
    vi.stubGlobal("window", w);
    data.set("sound-index-identity", legacy);
    const read = readIdentity();
    expect(read).toEqual(parseIdentity(legacy));
    expect(JSON.parse(data.get("sound-index-identity") as string).emoji).toBe(read?.emoji);
  });
});
