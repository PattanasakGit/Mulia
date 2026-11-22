"use client";

import { useDocumentTheme } from "@/lib/client-store";
import { useOrigin } from "@/lib/client-store";
import { setItem } from "@/lib/storage";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  BubbleChatQuestionIcon,
  Chat01Icon,
  Copy01Icon,
  Delete02Icon,
  Flag01Icon,
  HeadphonesIcon,
  InformationCircleIcon,
  Link01Icon,
  Menu01Icon,
  MessengerIcon,
  MoreHorizontalIcon,
  NewTwitterIcon,
  PaintBrush01Icon,
  Settings01Icon,
  Tick02Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Member } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { FeedbackSheet } from "@/components/feedback-sheet";
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

const FEEDBACK_LABEL = "แจ้งปัญหาหรือเสนอไอเดีย";
const subscribeNever = () => () => undefined;

export function TopBar({ room }: { room?: TopBarRoom }) {
  const router = useRouter();
  const pathname = usePathname();
  const identity = useIdentity();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const closeFeedback = useCallback(() => setFeedbackOpen(false), []);
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

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
          title={identity?.name}
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
        {room ? <RoomMenu room={room} /> : null}
        {room ? <SharePanel room={room} /> : null}
        {room ? <span className="topbar-sep" aria-hidden="true" /> : null}
        <MainMenu hasIdentity={Boolean(identity)} onFeedback={() => setFeedbackOpen(true)} />
      </div>
      {/* Portal: .topbar has backdrop-filter, which would otherwise trap a fixed overlay inside the bar. */}
      {mounted && identity ? createPortal(<AnimatePresence>{feedbackOpen ? <FeedbackSheet onClose={closeFeedback} /> : null}</AnimatePresence>, document.body) : null}
    </header>
  );
}

/** Closes on outside pointer / Esc (focus returns to the trigger) for any popover. */
function useDismiss(open: boolean, close: () => void, wrapRef: React.RefObject<HTMLElement | null>, triggerRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close, wrapRef, triggerRef]);
}

/** Arrow keys / Home / End move between menu items. */
function onMenuKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])'));
  if (items.length === 0) return;
  event.preventDefault();
  const index = items.indexOf(document.activeElement as HTMLElement);
  let next = index;
  if (event.key === "ArrowDown") next = (index + 1) % items.length;
  if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = items.length - 1;
  items[next].focus();
}

function Popover({ id, label, className, children }: { id: string; label: string; className?: string; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      id={id}
      className={`nav-pop${className ? ` ${className}` : ""}`}
      aria-label={label}
      initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.2, ease }}
    >
      {children}
    </motion.div>
  );
}

function focusFirstItem(root: HTMLElement | null) {
  root?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')?.focus();
}

function RoomMenu({ room }: { room: TopBarRoom }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [copied, setCopied] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, wrapRef, triggerRef);

  useEffect(() => {
    if (open) requestAnimationFrame(() => focusFirstItem(menuRef.current));
  }, [open]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="nav-wrap" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="nav-room-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={room.name}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon icon={HeadphonesIcon} size={22} />
        <span className="nav-room-text">
          <span className="nav-room-word">ห้อง </span>
          <span className="nav-room-code">{room.code}</span>
        </span>
        <span className="nav-chevron" aria-hidden="true">
          <Icon icon={ArrowDown01Icon} size={14} />
        </span>
      </button>
      <AnimatePresence>
        {open ? (
          <Popover id={menuId} label="เมนูห้อง" className="nav-pop-room">
            <div role="menu" aria-label="เมนูห้อง" ref={menuRef} onKeyDown={onMenuKeyDown}>
              {/* Narrow phones hide the people chip from the bar, so the count lives here. */}
              <p className="nav-pop-people">
                <Icon icon={UserGroupIcon} size={18} /> {room.members.length} คนในห้อง
              </p>
              <div className="nav-pop-head">
                <div>
                  <strong title={room.name}>{room.name}</strong>
                  <span>ห้อง {room.code}</span>
                </div>
                <button type="button" role="menuitem" className="nav-icon-sm" aria-label="คัดลอกรหัสห้อง" onClick={copyCode}>
                  <Icon icon={copied ? Tick02Icon : Copy01Icon} size={18} />
                </button>
              </div>
              <button
                type="button"
                role="menuitem"
                className="nav-item"
                onClick={() => {
                  close();
                  room.onShare();
                }}
              >
                <Icon icon={Settings01Icon} size={22} />
                <span>จัดการห้อง</span>
                <Icon icon={ArrowRight01Icon} size={16} />
              </button>
              {room.onClose ? (
                <>
                  <hr className="nav-rule" />
                  <button
                    type="button"
                    role="menuitem"
                    className="nav-item is-danger"
                    onClick={() => {
                      close();
                      // The page owns the confirm dialog (CloseRoomDialog) and the close request.
                      room.onClose?.();
                    }}
                  >
                    <Icon icon={Delete02Icon} size={22} />
                    <span>ปิดห้อง</span>
                  </button>
                </>
              ) : null}
            </div>
          </Popover>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function SharePanel({ room }: { room: TopBarRoom }) {
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const origin = useOrigin();
  const link = origin ? `${origin}/r/${room.code}` : "";
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, wrapRef, triggerRef);

  const copy = async () => {
    if (!link || copyState === "busy") return;
    setCopyState("busy");
    try {
      await navigator.clipboard.writeText(link);
      setCopyState("done");
    } catch {
      setCopyState("error");
    }
    window.setTimeout(() => setCopyState("idle"), 1800);
  };

  const text = encodeURIComponent(`ฟังเพลงด้วยกันที่ห้อง ${room.name}`);
  const url = encodeURIComponent(link);
  const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const more = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: room.name, url: link });
        return;
      } catch {
        return;
      }
    }
    close();
    room.onShare();
  };
  const channels = [
    { key: "line", label: "LINE", icon: Chat01Icon, href: link ? `https://line.me/R/share?text=${text}%20${url}` : undefined },
    // Messenger has no web share URL without an app id; the app scheme only works on phones.
    { key: "messenger", label: "Messenger", icon: MessengerIcon, href: link && coarse ? `fb-messenger://share/?link=${url}` : undefined },
    { key: "x", label: "X", icon: NewTwitterIcon, href: link ? `https://twitter.com/intent/tweet?text=${text}&url=${url}` : undefined },
  ];

  return (
    <div className="nav-wrap" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="nav-circle share-btn"
        aria-label="แชร์ห้อง"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon icon={Link01Icon} size={24} />
      </button>
      <AnimatePresence>
        {open ? (
          <Popover id={panelId} label="แชร์ห้อง" className="nav-pop-share">
            <div role="dialog" aria-label="แชร์ห้อง">
              <p className="nav-pop-title">แชร์ห้องนี้</p>
              <div className="nav-link-field">
                <input readOnly value={link} aria-label="ลิงก์ห้อง" onFocus={(event) => event.currentTarget.select()} />
                <button
                  type="button"
                  className="nav-copy"
                  aria-label="คัดลอกลิงก์"
                  aria-busy={copyState === "busy"}
                  disabled={!link}
                  onClick={copy}
                >
                  {copyState === "busy" ? <span className="nav-spinner" aria-hidden="true" /> : <Icon icon={copyState === "done" ? Tick02Icon : Copy01Icon} size={18} />}
                  <span>{copyState === "done" ? "คัดลอกแล้ว" : copyState === "error" ? "คัดลอกไม่ได้" : "คัดลอก"}</span>
                </button>
              </div>
              <p className="sr-only" role="status">{copyState === "done" ? "คัดลอกลิงก์แล้ว" : copyState === "error" ? "คัดลอกลิงก์ไม่สำเร็จ" : ""}</p>
              <ul className="nav-channels">
                {channels.map((channel) => (
                  <li key={channel.key}>
                    {channel.href ? (
                      <a className="nav-channel" href={channel.href} target={channel.key === "messenger" ? undefined : "_blank"} rel="noopener noreferrer">
                        <span className="nav-channel-dot"><Icon icon={channel.icon} size={20} /></span>
                        <span>{channel.label}</span>
                      </a>
                    ) : (
                      <button type="button" className="nav-channel" disabled={!link} onClick={copy} title={channel.key === "messenger" ? "เปิดได้เฉพาะบนมือถือ จึงคัดลอกลิงก์แทน" : undefined}>
                        <span className="nav-channel-dot"><Icon icon={channel.icon} size={20} /></span>
                        <span>{channel.label}</span>
                      </button>
                    )}
                  </li>
                ))}
                <li>
                  <button type="button" className="nav-channel" onClick={more}>
                    <span className="nav-channel-dot"><Icon icon={MoreHorizontalIcon} size={20} /></span>
                    <span>อื่นๆ</span>
                  </button>
                </li>
              </ul>
            </div>
          </Popover>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function MainMenu({ hasIdentity, onFeedback }: { hasIdentity: boolean; onFeedback: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const theme = useDocumentTheme();
  const [open, setOpen] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = useCallback(() => {
    setOpen(false);
    setShowThemes(false);
  }, []);
  useDismiss(open, close, wrapRef, triggerRef);
  useEffect(() => {
    if (open) requestAnimationFrame(() => focusFirstItem(menuRef.current));
  }, [open]);

  const choices: { value: DocumentTheme; label: string }[] = [
    { value: "light", label: "ขาว" },
    { value: "gray", label: "เทา" },
    { value: "dark", label: "ดำ" },
  ];
  const current = choices.find(({ value }) => value === theme)?.label;
  // No notification source exists yet; the dot renders only when one is wired in.
  const unread = false;

  return (
    <div className="nav-wrap" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="nav-circle nav-menu-btn"
        aria-label={unread ? "เมนู (มีรายการใหม่ที่ยังไม่ได้อ่าน)" : "เมนู"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Icon icon={Menu01Icon} size={24} />
        {unread ? <span className="nav-dot" aria-hidden="true" /> : null}
      </button>
      <AnimatePresence>
        {open ? (
          <Popover id={menuId} label="เมนูหลัก" className="nav-pop-main">
            <div role="menu" aria-label="เมนูหลัก" ref={menuRef} onKeyDown={onMenuKeyDown}>
              <button
                type="button"
                role="menuitem"
                className="nav-item"
                onClick={() => {
                  close();
                  editName(router, pathname);
                }}
              >
                <Icon icon={Settings01Icon} size={22} />
                <span>ตั้งค่า</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="nav-item"
                aria-expanded={showThemes}
                onClick={() => setShowThemes((value) => !value)}
              >
                <Icon icon={PaintBrush01Icon} size={22} />
                <span>ธีม &amp; รูปลักษณ์</span>
                <em className="nav-item-meta">{current}</em>
              </button>
              {showThemes ? (
                <div className="nav-themes" role="group" aria-label="เลือกธีมสี">
                  {choices.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={theme === value}
                      className={`nav-theme${theme === value ? " is-active" : ""}`}
                      aria-label={`ธีม${label}`}
                      onClick={() => {
                        document.documentElement.dataset.theme = value;
                        setItem("sound-index-theme", value);
                        close();
                        triggerRef.current?.focus();
                      }}
                    >
                      <span className={`theme-preview is-${value}`} aria-hidden="true">
                        <span className="theme-preview-disc" />
                      </span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <hr className="nav-rule" />
              {/* The server rejects anonymous callers (401), so reporting needs a name first. */}
              <button
                type="button"
                role="menuitem"
                className="nav-item"
                aria-label={hasIdentity ? "รายงานปัญหา" : "รายงานปัญหา (ต้องตั้งชื่อก่อน)"}
                aria-disabled={!hasIdentity}
                disabled={!hasIdentity}
                onClick={() => {
                  close();
                  onFeedback();
                }}
              >
                <Icon icon={Flag01Icon} size={22} />
                <span>รายงานปัญหา</span>
              </button>
              <Link
                href="/feedback"
                role="menuitem"
                className="nav-item"
                title={FEEDBACK_LABEL}
                onClick={close}
              >
                <Icon icon={BubbleChatQuestionIcon} size={22} />
                <span>ข้อเสนอแนะ</span>
              </Link>
              <Link href="/" role="menuitem" className="nav-item" onClick={close}>
                <Icon icon={InformationCircleIcon} size={22} />
                <span>เกี่ยวกับ MULIA</span>
              </Link>
            </div>
          </Popover>
        ) : null}
      </AnimatePresence>
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
        <Icon icon={UserGroupIcon} size={20} />
        <span className="people-count">{room.members.length}</span>
        <span className="people-label">คน<span className="people-label-detail">ในห้อง</span></span>
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

function editName(router: ReturnType<typeof useRouter>, pathname: string) {
  const next = pathname && pathname !== "/enter" ? pathname : "/archive";
  router.push(`/enter?next=${encodeURIComponent(next)}`);
}
