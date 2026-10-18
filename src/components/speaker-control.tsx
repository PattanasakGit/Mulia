"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  HeadphonesIcon,
  RemoteControlIcon,
  SpeakerIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { Icon } from "@/components/icon";
import type { Role } from "@/lib/speaker";
import type { SpeakerState } from "@/lib/types";

type Props = {
  role: Role;
  speaker: SpeakerState | undefined;
  busy: boolean;
  onClaim: () => void;
  onListen: () => void;
  onStopListening: () => void;
  onSetMode: (mode: "single" | "all") => void;
};

// What THIS device does: the room's speaker, an extra listener, or a silent remote.
const ROLE_ICON: Record<Role, IconSvgElement> = {
  speaker: SpeakerIcon,
  listener: HeadphonesIcon,
  remote: RemoteControlIcon,
};

/**
 * Where the sound comes from, as one icon beside the volume control. The icon says what this
 * device does; a small dot appears only when something needs attention. Everything else is one tap
 * away in a small menu.
 */
export function SpeakerControl({ role, speaker, busy, onClaim, onListen, onStopListening, onSetMode }: Props) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popId = useId();
  const reduceMotion = useReducedMotion();

  const single = speaker?.mode === "single";
  const hasMain = Boolean(speaker?.mainDeviceId);
  const warn = single && role !== "speaker" && (!hasMain || !speaker?.mainOnline);

  let where: string;
  if (!single) where = "ทุกเครื่อง";
  else if (role === "speaker") where = "เครื่องนี้";
  else if (!hasMain) where = "ยังไม่มีลำโพง";
  else where = speaker?.mainLabel ?? "เครื่องลำโพง";
  const whereNote = single && hasMain && role !== "speaker" && !speaker?.mainOnline ? "ออฟไลน์" : "";

  const summary = `เสียงเล่นที่ ${where}${whereNote ? ` (${whereNote})` : ""}${
    role === "listener" ? " · ฟังด้วยที่เครื่องนี้" : role === "remote" ? " · เครื่องนี้ไม่มีเสียง" : ""
  }`;

  function close() {
    setOpen(false);
    setConfirming(false);
  }

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setConfirming(false);
      }
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 3500);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  function act(run: () => void) {
    close();
    run();
  }

  function toggleMode() {
    // switching affects everyone in the room: ask for a second tap, inline, instead of a dialog
    if (!confirming) {
      setConfirming(true);
      return;
    }
    act(() => onSetMode(single ? "all" : "single"));
  }

  const rows: { key: string; icon: IconSvgElement; label: string; run: () => void }[] = [];
  if (single && role !== "speaker") rows.push({ key: "claim", icon: SpeakerIcon, label: "เล่นเสียงที่เครื่องนี้", run: onClaim });
  if (single && role === "remote") rows.push({ key: "listen", icon: HeadphonesIcon, label: "ฟังด้วยที่เครื่องนี้", run: onListen });
  if (single && role === "listener") rows.push({ key: "stop", icon: RemoteControlIcon, label: "เลิกฟังด้วย", run: onStopListening });
  if (!single && role === "remote") rows.push({ key: "listen", icon: HeadphonesIcon, label: "เปิดเสียงเครื่องนี้", run: onListen });
  if (!single && role === "listener") rows.push({ key: "stop", icon: RemoteControlIcon, label: "ปิดเสียงเครื่องนี้", run: onStopListening });

  return (
    <div className="speaker-control" ref={wrapRef} data-role={role}>
      <button
        type="button"
        className={`icon-btn speaker-trigger${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-controls={popId}
        aria-label={summary}
        title={summary}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Icon icon={ROLE_ICON[role]} size={22} />
        {warn ? <span className="speaker-flag" aria-hidden="true" /> : null}
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            id={popId}
            className="speaker-pop"
            role="group"
            aria-label="ลำโพง"
            initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 6, scale: 0.98 }}
            transition={reduceMotion ? { duration: 0.01 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="speaker-where">
              <span className="speaker-where-icon" aria-hidden="true">
                <Icon icon={SpeakerIcon} size={20} />
              </span>
              <span className={`speaker-where-text${whereNote ? " is-off" : ""}`}>
                <span>{whereNote ? `เสียงเล่นที่ · ${whereNote}` : "เสียงเล่นที่"}</span>
                <strong>{where}</strong>
              </span>
              {single && hasMain ? (
                <span
                  className={`speaker-live${speaker?.mainOnline || role === "speaker" ? "" : " is-off"}`}
                  role="img"
                  aria-label={speaker?.mainOnline || role === "speaker" ? "ออนไลน์" : "ออฟไลน์"}
                />
              ) : null}
            </div>
            {rows.map((row) => (
              <button
                key={row.key}
                type="button"
                className="speaker-row"
                disabled={busy}
                onClick={() => act(row.run)}
              >
                <Icon icon={row.icon} size={19} />
                <span>{row.label}</span>
              </button>
            ))}
            <div className="speaker-sep" role="separator" />
            <button
              type="button"
              role="switch"
              aria-checked={!single}
              className={`speaker-row speaker-mode${confirming ? " is-confirming" : ""}`}
              disabled={busy}
              onClick={toggleMode}
            >
              <Icon icon={UserGroupIcon} size={19} />
              <span>
                {confirming ? "แตะอีกครั้งเพื่อยืนยัน"
                  : "ทุกเครื่องฟังพร้อมกัน"}
              </span>
              <span className="speaker-switch" data-on={!single} aria-hidden="true" />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
