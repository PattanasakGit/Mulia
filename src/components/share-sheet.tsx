"use client";

import { useOrigin } from "@/lib/client-store";
import { useEffect, useId, useRef, useState } from "react";
import { Cancel01Icon, Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { motion, useReducedMotion } from "motion/react";
import { Icon } from "@/components/icon";
import { ease } from "@/components/motion";

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function trapTab(event: Pick<KeyboardEvent, "shiftKey" | "preventDefault">, root: HTMLElement | null) {
  if (!root) return;
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (items.length === 0) {
    event.preventDefault();
    root.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const inside = active instanceof Node && root.contains(active);
  if (event.shiftKey && (active === first || !inside)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !inside)) {
    event.preventDefault();
    first.focus();
  }
}

export function ShareSheet({
  code,
  onClose,
}: {
  code: string;
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const origin = useOrigin();
  const link = origin ? `${origin}/r/${code}` : "";
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const sheetRef = useRef<HTMLDivElement>(null);

  // Focus management: move focus in on open, trap Tab, restore to the opener on close.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const sheet = sheetRef.current;
    (sheet?.querySelector<HTMLElement>(FOCUSABLE) ?? sheet)?.focus();
    return () => {
      const target = opener?.isConnected ? opener : document.querySelector<HTMLElement>(".share-btn");
      target?.focus();
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
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy(kind: "code" | "link", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
    } catch {
      setCopied(null);
    }
  }

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
        className="sheet invite"
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        initial={reduceMotion ? false : { y: 12, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 8, opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.35, ease }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="invite-head">
          <p className="eyebrow">คำเชิญ</p>
          <button type="button" className="invite-close" aria-label="ปิด" onClick={onClose}>
            <Icon icon={Cancel01Icon} size={18} />
          </button>
        </div>

        <div className="invite-plate">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="invite-qr" src={`/api/rooms/${code}/qr`} alt={`คิวอาร์สำหรับห้อง ${code}`} />
        </div>

        <p className="invite-code">{code}</p>
        <h2 id={titleId} className="invite-lead">
          ชวนคนเข้ามาฟัง
        </h2>
        <button type="button" className="invite-code-btn" onClick={() => copy("code", code)}>
          <Icon icon={copied === "code" ? Tick02Icon : Copy01Icon} size={14} />
          {copied === "code" ? "คัดลอกรหัสแล้ว" : "คัดลอกรหัส"}
        </button>

        <div className="invite-link">
          <input
            className="invite-url"
            readOnly
            value={link}
            aria-label="ลิงก์ห้อง"
            onFocus={(event) => event.currentTarget.select()}
          />
          <button type="button" className="invite-copy" onClick={() => copy("link", link)}>
            <Icon icon={copied === "link" ? Tick02Icon : Copy01Icon} size={15} />
            {copied === "link" ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
