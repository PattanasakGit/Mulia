"use client";

import { useDocumentTheme } from "@/lib/client-store";
import { setItem } from "@/lib/storage";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowDown01Icon, Share08Icon } from "@hugeicons/core-free-icons";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Member } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { Mark } from "@/components/mark";
import { ease } from "@/components/motion";
import type { DocumentTheme } from "@/lib/client-store";
import { useIdentity } from "@/components/use-identity";
import Link from "next/link";

export type TopBarRoom = {
  name: string;
  code: string;
  members: Member[];
  selfId?: string;
  onShare: () => void;
  onClose?: () => void;
};

export function TopBar({ room }: { room?: TopBarRoom }) {
  const router = useRouter();
  const pathname = usePathname();
  const identity = useIdentity();

  return (
    <header className={room ? "topbar is-room" : "topbar"}>
      <div className="topbar-start">
        <Link href="/" className="brand">
          <Mark />
          <span>MULIA</span>
        </Link>
        {room ? <RoomPeople room={room} /> : null}
        <button
          type="button"
          className="nav-btn nav-person"
          aria-label={identity ? `${identity.name} (เปลี่ยนชื่อ)` : "ตั้งชื่อ"}
          onClick={() => editName(router, pathname)}
        >
          {identity ? (
            <Avatar name={identity.name} hue={identity.hue} emoji={identity.emoji} size={32} />
          ) : (
            <span className="avatar avatar-empty" style={{ width: 32, height: 32 }} />
          )}
          {identity ? <span className="nav-name">{identity.name}</span> : null}
        </button>
      </div>
      <div className="topbar-end">
        {room ? <RoomBar room={room} /> : null}
        <ThemePicker />
      </div>
    </header>
  );
}

function RoomBar({ room }: { room: TopBarRoom }) {
  return (
    <div className="roombar">
      <div className="roombar-title">
        <strong>{room.name}</strong>
        <span>ห้อง {room.code}</span>
      </div>
      {room.onClose ? (
        <button type="button" className="close-room" onClick={room.onClose}>
          ปิดห้อง
        </button>
      ) : null}
      <button type="button" className="share-btn" aria-label="แชร์ห้อง" onClick={room.onShare}>
        <Icon icon={Share08Icon} size={16} />
        <span>แชร์ห้อง</span>
      </button>
    </div>
  );
}

function RoomPeople({ room }: { room: TopBarRoom }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="roombar-people" ref={wrapRef}>
      <button
        type="button"
        className="people-stack"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`ผู้ฟัง ${room.members.length} คน`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="people-record" aria-hidden="true" />
        <span className="people-count">{room.members.length}</span>
        <span className="people-label">คน<span className="people-label-detail">ในห้อง</span></span>
        <Icon icon={ArrowDown01Icon} size={14} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            id={listId}
            className="people-pop"
            role="dialog"
            aria-label="ผู้ฟังในห้อง"
            initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.22, ease }}
          >
            <p className="people-pop-head">
              กำลังฟังอยู่ <span>{room.members.length} คน</span>
            </p>
            {room.members.length === 0 ? (
              <p className="people-pop-empty">ยังไม่มีคนในห้อง</p>
            ) : (
              <ul>
                {room.members.map((member, index) => (
                  <motion.li
                    key={member.id}
                    initial={reduceMotion ? false : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.24, delay: 0.03 * index, ease }}
                  >
                    <Avatar name={member.name} hue={member.hue} emoji={member.emoji} size={30} />
                    <span>{member.name}</span>
                    {member.id === room.selfId ? <em>คุณ</em> : null}
                  </motion.li>
                ))}
              </ul>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ThemePicker() {
  const theme = useDocumentTheme();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const choices: { value: DocumentTheme; label: string }[] = [
    { value: "light", label: "ขาว" },
    { value: "gray", label: "เทา" },
    { value: "dark", label: "ดำ" },
  ];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="theme-picker" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="theme-trigger"
        aria-label={`เลือกธีมสี ปัจจุบันธีม${choices.find(({ value }) => value === theme)?.label}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`theme-trigger-swatch is-${theme}`} aria-hidden="true" />
        <Icon icon={ArrowDown01Icon} size={13} />
      </button>
      {open ? (
        <div id={panelId} className="theme-panel" role="group" aria-label="เลือกธีมสี">
          <div className="theme-panel-heading">
            <span>เลือกบรรยากาศ</span>
            <span className="theme-panel-rule" aria-hidden="true" />
          </div>
          <div className="theme-options">
            {choices.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`theme-choice${theme === value ? " is-active" : ""}`}
                aria-label={`ธีม${label}`}
                aria-pressed={theme === value}
                onClick={() => {
                  document.documentElement.dataset.theme = value;
                  setItem("sound-index-theme", value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <span className={`theme-preview is-${value}`} aria-hidden="true">
                  <span className="theme-preview-disc" />
                </span>
                <span className="theme-choice-label">{label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function editName(router: ReturnType<typeof useRouter>, pathname: string) {
  const next = pathname && pathname !== "/enter" ? pathname : "/archive";
  router.push(`/enter?next=${encodeURIComponent(next)}`);
}
