import { afterEach, describe, expect, it, vi } from "vitest";
import { captureRecoveryFragment, dropPendingRecovery } from "@/lib/owner";

function fakeWindow(hash: string) {
  const replaceState = vi.fn();
  vi.stubGlobal("window", {
    location: { hash, pathname: "/r/ABC234", search: "?x=1" },
    history: { state: null, replaceState },
  });
  return replaceState;
}
afterEach(() => {
  dropPendingRecovery("ABC234");
  vi.unstubAllGlobals();
});

describe("MULIA-A4: recovery fragment handling", () => {
  it("strips the fragment from the URL at once and keeps the token in memory", () => {
    const replace = fakeWindow("#owner=sEcReT_tok-en");
    expect(captureRecoveryFragment("abc234")).toBe("sEcReT_tok-en");
    expect(replace).toHaveBeenCalledWith(null, "", "/r/ABC234?x=1");
  });

  it("keeps the token across a later call with no fragment (the /enter hop), until dropped", () => {
    fakeWindow("#owner=tok");
    captureRecoveryFragment("ABC234");
    fakeWindow("");
    expect(captureRecoveryFragment("ABC234")).toBe("tok");
    dropPendingRecovery("ABC234");
    expect(captureRecoveryFragment("ABC234")).toBeNull();
  });

  it("ignores other fragments and leaves them alone", () => {
    const replace = fakeWindow("#something");
    expect(captureRecoveryFragment("ABC234")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });
});
