import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/client";
import { joinErrorMessage } from "@/lib/join-error";
import { MEMBERS_LIMIT } from "@/lib/limits";

describe("B3 join failures are surfaced", () => {
  it("403 room full names the real cap", () => {
    expect(joinErrorMessage(new ApiError("x", 403))).toContain(`${MEMBERS_LIMIT} คน`);
    expect(MEMBERS_LIMIT).toBe(300);
  });
  it("400 invalid name", () => expect(joinErrorMessage(new ApiError("x", 400))).toContain("1–32"));
  it("404 is left to the closed-room screen", () => expect(joinErrorMessage(new ApiError("x", 404))).toBeNull());
  it("network / 429 / 500 get the generic retry text", () => {
    for (const e of [new ApiError("x", 0), new ApiError("x", 429), new ApiError("x", 500), new Error("boom")]) {
      expect(joinErrorMessage(e)).toBe("เข้าห้องไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  });
});
