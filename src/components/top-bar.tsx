"use client";

import { useDocumentTheme } from "@/lib/client-store";
import { setItem } from "@/lib/storage";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Moon02Icon, Share08Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { api } from "@/lib/client";
import { startPolling } from "@/lib/poll";
import type { LiveNow, Member } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { Mark } from "@/components/mark";
import { ease } from "@/components/motion";
import { useIdentity } from "@/components/use-identity";
import Link from "next/link";

function usePolledNow(enabled: boolean) {
  const [live, setLive] = useState<LiveNow | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const poller = startPolling(
      async () => {
        const next = await api<LiveNow>("/api/now");
        if (!stop) setLive(next);
      },
      { baseMs: 6000, hiddenMs: 30000 },
    );
    const onVisible = () => {
      if (!document.hidden) poller.nudge();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      poller.stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);

  return live;
}

export type TopBarRoom = {
  name: string;
  code: string;
  members: Member[];
  selfId?: string;
  onShare: () => void;
  onClose?: () => void;
};

export function TopBar({ live, room }: { live?: LiveNow | null; room?: TopBarRoom }) {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const pathname = usePathname();
  const identity = useIdentity();
  const polled = usePolledNow(live === undefined);
  const current = live === undefined ? polled : live;

  const roomCode = current?.roomCode;
  function openRoom() {
    if (roomCode) router.push(`/r/${roomCode}`);
  }

  const naming = pathname === "/enter";
  const inRoom = pathname.startsWith("/r/");

  return (
    <header className="topbar">
      <div className="topbar-start">
        <Link href="/" className="brand">
          <Mark />
          <span>MULIA</span>
        </Link>
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
        <AnimatePresence>
          {naming || inRoom || pathname === "/" || !roomCode ? null : (
            <motion.button
              key={`${roomCode}-${current?.title ?? ""}`}
              type="button"
              className="now-chip"
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.28, ease }}
              onClick={openRoom}
            >
              <strong>{current?.title || "กำลังเล่น"}</strong>
              <span>{current?.roomName || "MULIA"}</span>
            </motion.button>
          )}
        </AnimatePresence>
        <ThemeToggle />
      </div>
    </header>
  );
}

const STACK = 4;

function RoomBar({ room }: { room: TopBarRoom }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const reduceMotion = useReducedMotion();
  const shown = room.members.slice(0, STACK);
  const extra = room.members.length - shown.length;

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
    <div className="roombar">
      <div className="roombar-title">
        <strong>{room.name}</strong>
        <span>ห้อง {room.code}</span>
      </div>
      <div className="roombar-people" ref={wrapRef}>
        <button
          type="button"
          className="people-stack"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={`ผู้ฟัง ${room.members.length} คน`}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="people-faces" aria-hidden="true">
            {shown.map((member, index) => (
              <span key={member.id} className="people-face" style={{ zIndex: STACK - index }}>
                <Avatar name={member.name} hue={member.hue} emoji={member.emoji} size={30} />
              </span>
            ))}
            {extra > 0 ? <span className="people-more">+{extra}</span> : null}
          </span>
          <span className="people-count">{room.members.length}</span>
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

function ThemeToggle() {
  const reduceMotion = useReducedMotion();
  const theme = useDocumentTheme();

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setItem("sound-index-theme", next);
  }

  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={dark ? "โหมดสว่าง" : "โหมดมืด"}
      aria-pressed={dark}
      onClick={toggle}
    >
      <motion.span
        key={dark ? "sun" : "moon"}
        style={{ display: "grid" }}
        initial={reduceMotion ? false : { opacity: 0, rotate: -18 }}
        animate={{ opacity: 1, rotate: 0 }}
        transition={{ duration: 0.25, ease }}
      >
        <Icon icon={dark ? Sun03Icon : Moon02Icon} size={20} />
      </motion.span>
    </button>
  );
}

function editName(router: ReturnType<typeof useRouter>, pathname: string) {
  const next = pathname && pathname !== "/enter" ? pathname : "/archive";
  router.push(`/enter?next=${encodeURIComponent(next)}`);
}
