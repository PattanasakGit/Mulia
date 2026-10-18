import { describe, expect, it } from "vitest";
import { markCurrent, moveId, neighborId, orderTracks } from "@/lib/queue-order";
import type { Track } from "@/lib/types";

const t = (id: string, status: Track["status"] = "queued") => ({ id, status }) as Track;

describe("queue-order (extracted from room-stage.tsx, behaviour-preserving)", () => {
  it("moveId", () => {
    expect(moveId(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(moveId(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(moveId(["a", "b"], "a", "a")).toBeNull();
    expect(moveId(["a", "b"], "x", "a")).toBeNull();
    expect(moveId(["a", "b"], "a", "x")).toBeNull();
  });
  it("neighborId", () => {
    expect(neighborId(["a", "b"], "a", 1)).toBe("b");
    expect(neighborId(["a", "b"], "a", -1)).toBeUndefined();
    expect(neighborId(["a", "b"], "x", 1)).toBe("a"); // same as old indexOf(-1)+1 behaviour
  });
  it("orderTracks / markCurrent", () => {
    expect(orderTracks([t("a"), t("b")], ["b", "z", "a"]).map((x) => x.id)).toEqual(["b", "a"]);
    expect(markCurrent([t("a", "current"), t("b"), t("c", "played")], "b").map((x) => x.status)).toEqual(["played", "current", "played"]);
  });
});

import { createLocalPool } from "@/lib/db-local";
describe("db-local guard", () => {
  it("refuses non-local hosts", () => {
    expect(() => createLocalPool("postgresql://u:p@ep-x.neon.tech/db")).toThrow(/test-only/);
  });
});
