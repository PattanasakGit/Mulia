"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Cancel01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ApiError, api } from "@/lib/client";
import { FEEDBACK_BODY_MAX, FEEDBACK_TOPIC_MAX } from "@/lib/limits";
import { Icon } from "@/components/icon";
import { ease } from "@/components/motion";
import { trapTab } from "@/components/share-sheet";

const CLOSE_AFTER_SENT_MS = 2200;
/** If the enter animation never reports completion, focus anyway after this long. */
const FOCUS_FALLBACK_MS = 300;

const EASE_OUT = [0.2, 0, 0, 1] as const;
const EASE_IN = [0.4, 0, 1, 1] as const;

const PHONE_QUERY = "(max-width: 639px)";
const subscribePhone = (notify: () => void) => {
  const list = window.matchMedia(PHONE_QUERY);
  list.addEventListener("change", notify);
  return () => list.removeEventListener("change", notify);
};

/** Anonymous bug / idea form. Sends topic + body only; the server stores nothing about the sender. */
export function FeedbackSheet({ onClose }: { onClose: () => void }) {
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const phone = useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false);
  const [topic, setTopic] = useState("");
  const [body, setBody] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  // Focus the topic input once, after the slide-in ends, so a phone keyboard does not fight the animation.
  const focusTopic = useCallback(() => {
    if (focused.current) return;
    focused.current = true;
    sheetRef.current?.querySelector<HTMLElement>("input")?.focus();
  }, []);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Reduced motion: no transition to wait for. Otherwise onAnimationComplete focuses; this timer is the fallback.
    const timer = window.setTimeout(focusTopic, reduceMotion ? 0 : FOCUS_FALLBACK_MS);
    return () => {
      window.clearTimeout(timer);
      if (opener?.isConnected) opener.focus();
    };
  }, [focusTopic, reduceMotion]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "Tab") trapTab(event, sheetRef.current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (state !== "sent") return;
    const timer = window.setTimeout(onClose, CLOSE_AFTER_SENT_MS);
    return () => window.clearTimeout(timer);
  }, [state, onClose]);

  const ready = topic.trim().length > 0 && body.trim().length > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || state === "sending") return;
    setState("sending");
    setError("");
    try {
      await api("/api/feedback", { method: "POST", body: JSON.stringify({ topic, body }) });
      setState("sent");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "ส่งไม่สำเร็จ ลองอีกครั้ง");
      setState("idle");
    }
  }

  return (
    <motion.div className="overlay overlay-feedback" onClick={onClose}>
      <motion.div
        className="feedback-backdrop"
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4, transition: { duration: reduceMotion ? 0.1 : phone ? 0.28 : 0.2, ease: EASE_OUT } }}
        exit={{ opacity: 0, transition: { duration: reduceMotion ? 0.1 : phone ? 0.2 : 0.15, ease: EASE_IN } }}
      />
      <motion.div
        ref={sheetRef}
        className="sheet feedback-sheet"
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        initial={reduceMotion ? { opacity: 0 } : phone ? { y: "100%" } : { opacity: 0, y: 8 }}
        animate={
          reduceMotion
            ? { opacity: 1, transition: { duration: 0.1 } }
            : { opacity: 1, y: 0, transition: { duration: phone ? 0.28 : 0.2, ease: EASE_OUT } }
        }
        exit={
          reduceMotion
            ? { opacity: 0, transition: { duration: 0.1 } }
            : phone
              ? { y: "100%", transition: { duration: 0.2, ease: EASE_IN } }
              : { opacity: 0, y: 4, transition: { duration: 0.15, ease: EASE_IN } }
        }
        onAnimationComplete={(definition) => {
          if (definition && typeof definition === "object" && "opacity" in definition && definition.opacity === 1) focusTopic();
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {phone ? <span className="feedback-handle" aria-hidden="true" /> : null}
        <div className="invite-head">
          <p className="eyebrow">แจ้งปัญหา / เสนอไอเดีย</p>
          <button type="button" className="invite-close" aria-label="ปิด" onClick={onClose}>
            <Icon icon={Cancel01Icon} size={18} />
          </button>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {state === "sent" ? (
            <motion.div
              key="sent"
              className="feedback-sent"
              role="status"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease }}
            >
              <motion.span
                className="feedback-sent-mark"
                initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.45, ease, delay: 0.08 }}
              >
                <Icon icon={Tick02Icon} size={26} />
              </motion.span>
              <h2 id={titleId} className="feedback-title">ได้รับแล้ว ขอบคุณ</h2>
              <p className="feedback-hint">รายการของคุณอยู่ในหน้ารวมแล้ว</p>
              <Link href="/feedback" className="btn btn-block" onClick={onClose}>
                ดูรายการทั้งหมด
              </Link>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              className="feedback-form"
              onSubmit={submit}
              noValidate
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <h2 id={titleId} className="feedback-title">เล่าให้เราฟังหน่อย</h2>

              <label className="feedback-label" htmlFor={`${titleId}-topic`}>หัวข้อ</label>
              <input
                id={`${titleId}-topic`}
                className="field"
                value={topic}
                maxLength={FEEDBACK_TOPIC_MAX}
                placeholder="เช่น เพลงเด้งออกจากคิว"
                autoComplete="off"
                aria-invalid={error ? true : undefined}
                disabled={state === "sending"}
                onChange={(event) => setTopic(event.target.value)}
              />

              <label className="feedback-label" htmlFor={`${titleId}-body`}>รายละเอียด</label>
              <textarea
                id={`${titleId}-body`}
                className="field feedback-body"
                value={body}
                maxLength={FEEDBACK_BODY_MAX}
                placeholder="เกิดอะไรขึ้น หรืออยากได้อะไรเพิ่ม"
                aria-describedby={`${titleId}-count`}
                aria-invalid={error ? true : undefined}
                disabled={state === "sending"}
                onChange={(event) => setBody(event.target.value)}
              />
              <p id={`${titleId}-count`} className="feedback-count">{[...body].length}/{FEEDBACK_BODY_MAX}</p>

              <p className="feedback-hint">ไม่เก็บชื่อและรูป รายการที่ส่งทุกคนในแอปเห็นได้ อย่าใส่ข้อมูลส่วนตัว</p>
              <p className="feedback-error" role="alert">{error}</p>

              <div className="feedback-actions">
                <button type="button" className="btn" onClick={onClose}>ยกเลิก</button>
                <button type="submit" className="btn btn-solid" disabled={!ready || state === "sending"}>
                  {state === "sending" ? "กำลังส่ง…" : "ส่ง"}
                </button>
              </div>
              <Link href="/feedback" className="feedback-link" onClick={onClose}>ดูรายการที่แจ้งมาทั้งหมด</Link>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
