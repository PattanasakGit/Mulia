"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/icon";
import { ease } from "@/components/motion";
import { FOCUSABLE, trapTab } from "@/components/share-sheet";
import { api, ApiError } from "@/lib/client";
import { useOrigin } from "@/lib/client-store";
import { closeCredentials, forgetOwnerToken, RECOVERY_PREFIX } from "@/lib/owner";

type Phase = "idle" | "loading" | "ready" | "error" | "forbidden";

/** Owner-only sheet: makes a recovery link for moving ownership to another device. */
export function RecoverySheet({ code, onClose }: { code: string; onClose: () => void }) {
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const origin = useOrigin();
  const sheetRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [token, setToken] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  const [online, setOnline] = useState(true);

  // The link lives in this component's state only; closing the sheet drops it.
  const link = token && origin ? `${origin}/r/${code}${RECOVERY_PREFIX}${token}` : "";

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (sheetRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? sheetRef.current)?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "Tab") trapTab(event, sheetRef.current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    if (copied !== "yes") return;
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function generate() {
    setPhase("loading");
    setConfirming(false);
    setCopied(null);
    try {
      const result = await api<{ recoveryToken: string }>(`/api/rooms/${code}/owner`, {
        method: "POST",
        body: JSON.stringify({ action: "create", ownerToken: closeCredentials(code).ownerToken }),
      });
      setToken(result.recoveryToken);
      setPhase("ready");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) {
        forgetOwnerToken(code);
        setPhase("forbidden");
      } else {
        setPhase("error");
      }
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied("yes");
    } catch {
      setCopied("failed");
      fieldRef.current?.focus();
      fieldRef.current?.select();
    }
  }

  const busy = phase === "loading";

  return (
    <motion.div
      className="overlay"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      onClick={onClose}
    >
      <motion.div
        ref={sheetRef}
        tabIndex={-1}
        className="sheet invite close-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        initial={reduceMotion ? false : { y: 12, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 8, opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.35, ease }}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">กู้คืนสิทธิ์เจ้าของ</p>
        <h2 id={titleId} className="invite-lead">ลิงก์สำหรับเปลี่ยนเครื่อง</h2>
        <p className="close-copy">เก็บลิงก์นี้ไว้ที่ปลอดภัย (เช่น บันทึกในแชทตัวเอง) ใครมีลิงก์นี้จะปิดห้องได้</p>

        {phase === "forbidden" ? (
          <p className="form-error" role="alert">เครื่องนี้ไม่ใช่เจ้าของห้องแล้ว</p>
        ) : null}

        {phase === "idle" || phase === "loading" || phase === "error" ? (
          <>
            {phase === "error" ? (
              <p className="form-error" role="alert">สร้างลิงก์ไม่สำเร็จ ลองอีกครั้ง</p>
            ) : (
              <p className="close-copy">สร้างลิงก์ใหม่ จะทำให้ลิงก์เก่าใช้ไม่ได้</p>
            )}
            {!online ? <p className="close-copy">ต้องต่อเน็ตก่อน</p> : null}
            <div className="close-actions">
              <button type="button" className="btn btn-solid" disabled={busy || !online} onClick={() => void generate()}>
                {busy ? "กำลังสร้างลิงก์" : phase === "error" ? "ลองอีกครั้ง" : "สร้างลิงก์กู้คืน"}
              </button>
              <button type="button" className="btn" onClick={onClose}>ปิด</button>
            </div>
          </>
        ) : null}

        {phase === "ready" ? (
          <>
            <div className="invite-link">
              <input
                ref={fieldRef}
                className="invite-url"
                readOnly
                value={link}
                aria-label="ลิงก์กู้คืนสิทธิ์เจ้าของ"
                onFocus={(event) => event.currentTarget.select()}
              />
              <button type="button" className="invite-copy" onClick={() => void copy()}>
                <Icon icon={copied === "yes" ? Tick02Icon : Copy01Icon} size={15} />
                {copied === "yes" ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
              </button>
            </div>
            <p className="close-copy" role="status" aria-live="polite">
              {copied === "failed"
                ? "คัดลอกอัตโนมัติไม่ได้ กดค้างที่ลิงก์เพื่อคัดลอก"
                : "แสดงครั้งเดียว ปิดหน้านี้แล้วจะดูอีกไม่ได้ ต้องสร้างใหม่"}
            </p>
            {confirming ? (
              <>
                <p className="close-copy" role="alert">ลิงก์เก่าจะใช้ไม่ได้ทันที สร้างใหม่ไหม</p>
                <div className="close-actions">
                  <button type="button" className="btn" onClick={() => setConfirming(false)}>ยกเลิก</button>
                  <button type="button" className="btn btn-solid" onClick={() => void generate()}>สร้างใหม่</button>
                </div>
              </>
            ) : (
              <div className="close-actions">
                <button type="button" className="btn" onClick={() => setConfirming(true)}>สร้างใหม่</button>
                <button type="button" className="btn" onClick={onClose}>ปิด</button>
              </div>
            )}
          </>
        ) : null}

        {phase === "forbidden" ? (
          <div className="close-actions">
            <button type="button" className="btn" onClick={onClose}>ปิด</button>
          </div>
        ) : null}
      </motion.div>
    </motion.div>
  );
}
