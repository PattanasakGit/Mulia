"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client";
import { captureRecoveryFragment, dropPendingRecovery, hasOwnerToken, saveOwnerToken } from "@/lib/owner";

type State = "idle" | "verifying" | "success" | "invalid" | "network";

// Strict Mode runs effects twice; a second redeem would find the token already used.
const inflight = new Set<string>();

/**
 * Opens on /r/CODE#owner=TOKEN: strips the token from the URL, trades it for ownership of this
 * device, and says so in a non-blocking banner. Renders nothing when there is no token.
 */
export function OwnerRedeem({ code }: { code: string }) {
  const [state, setState] = useState<State>("idle");

  async function redeem(token: string) {
    if (inflight.has(code)) return;
    inflight.add(code);
    setState("verifying");
    try {
      const result = await api<{ ownerToken: string }>(`/api/rooms/${code}/owner`, {
        method: "POST",
        body: JSON.stringify({ action: "redeem", recoveryToken: token }),
      });
      saveOwnerToken(code, result.ownerToken);
      dropPendingRecovery(code);
      setState("success");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status > 0 && caught.status < 500 && caught.status !== 429) {
        dropPendingRecovery(code);
        setState("invalid");
      } else {
        setState("network"); // the token stays in memory for "try again"
      }
    } finally {
      inflight.delete(code);
    }
  }

  useEffect(() => {
    const token = captureRecoveryFragment(code);
    if (!token) return;
    if (hasOwnerToken(code)) {
      dropPendingRecovery(code); // this device already is the owner: leave the link unused
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starts a request on mount
    void redeem(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    if (state !== "success") return;
    const timer = window.setTimeout(() => setState("idle"), 5000);
    return () => window.clearTimeout(timer);
  }, [state]);

  if (state === "idle") return null;
  const dismiss = () => setState("idle");

  return (
    <div className="owner-banner" role={state === "invalid" || state === "network" ? "alert" : "status"} aria-live="polite">
      {state === "verifying" ? <p>กำลังตรวจสอบสิทธิ์เจ้าของ</p> : null}
      {state === "success" ? <p>คุณเป็นเจ้าของห้องนี้แล้ว บนเครื่องนี้</p> : null}
      {state === "invalid" ? (
        <>
          <p>ลิงก์นี้ใช้ไม่ได้แล้ว อาจถูกสร้างใหม่หรือใช้ไปแล้ว ขอลิงก์ใหม่จากเครื่องเดิม</p>
          <button type="button" className="btn" onClick={dismiss}>ปิด</button>
        </>
      ) : null}
      {state === "network" ? (
        <>
          <p>ตรวจสอบสิทธิ์ไม่สำเร็จ</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const token = captureRecoveryFragment(code);
              if (token) void redeem(token);
              else setState("invalid");
            }}
          >
            ลองอีกครั้ง
          </button>
          <button type="button" className="btn" onClick={dismiss}>ปิด</button>
        </>
      ) : null}
    </div>
  );
}
