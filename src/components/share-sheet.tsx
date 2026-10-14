"use client";

import { useEffect, useId, useState } from "react";
import { Cancel01Icon, Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { motion } from "motion/react";
import { Icon } from "@/components/icon";
import { ease } from "@/components/motion";

export function ShareSheet({
  code,
  onClose,
}: {
  code: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  useEffect(() => {
    setLink(`${window.location.origin}/r/${code}`);
  }, [code]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      onClick={onClose}
    >
      <motion.div
        className="sheet invite"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ y: 12, opacity: 0, scale: 0.98 }}
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
