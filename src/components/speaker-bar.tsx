"use client";

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

/** Who plays the sound, and the few things anyone may change about that. */
export function SpeakerBar({ role, speaker, busy, onClaim, onListen, onStopListening, onSetMode }: Props) {
  const single = speaker?.mode === "single";
  const mainLabel = speaker?.mainLabel ?? "เครื่องลำโพง";
  const hasMain = Boolean(speaker?.mainDeviceId);
  const offline = single && !speaker?.mainOnline;

  let status: string;
  if (!single) status = role === "remote" ? "เครื่องนี้เป็นรีโมต" : "ทุกเครื่องฟังพร้อมกัน";
  else if (role === "speaker") status = "เครื่องนี้คือลำโพง";
  else if (!hasMain) status = "ยังไม่มีลำโพง";
  else if (offline) status = `ลำโพงหลักออฟไลน์ (${mainLabel})`;
  else if (role === "listener") status = `ฟังด้วยที่เครื่องนี้ · ลำโพงหลัก: ${mainLabel}`;
  else status = `เสียงเล่นที่ ${mainLabel}`;

  function switchMode(mode: "single" | "all") {
    const message =
      mode === "all"
        ? "ทุกเครื่องที่เปิดห้องนี้จะเล่นเสียงพร้อมกัน เปลี่ยนโหมดไหม"
        : "เครื่องนี้จะเป็นลำโพงหลัก เครื่องอื่นจะเป็นรีโมต เปลี่ยนโหมดไหม";
    if (window.confirm(message)) onSetMode(mode);
  }

  return (
    <div className="speaker-bar" data-role={role} aria-label="ลำโพง">
      <span className={`speaker-status ${offline || (single && !hasMain) ? "is-warn" : ""}`}>
        <span className="speaker-dot" aria-hidden="true" />
        {status}
      </span>
      <span className="speaker-actions">
        {single && role !== "speaker" ? (
          <button type="button" className="speaker-act" disabled={busy} onClick={onClaim}>
            ย้ายลำโพงมาที่เครื่องนี้
          </button>
        ) : null}
        {single && role === "remote" ? (
          <button type="button" className="speaker-act" onClick={onListen}>
            ฟังด้วยที่เครื่องนี้
          </button>
        ) : null}
        {single && role === "listener" ? (
          <button type="button" className="speaker-act" onClick={onStopListening}>
            เลิกฟังด้วย
          </button>
        ) : null}
        {!single && role === "remote" ? (
          <button type="button" className="speaker-act" onClick={onListen}>
            ฟังที่เครื่องนี้
          </button>
        ) : null}
        {!single && role === "listener" ? (
          <button type="button" className="speaker-act" onClick={onStopListening}>
            เป็นรีโมต (ปิดเสียงเครื่องนี้)
          </button>
        ) : null}
        <button
          type="button"
          className="speaker-act speaker-mode"
          disabled={busy}
          onClick={() => switchMode(single ? "all" : "single")}
        >
          {single ? "เปลี่ยนเป็นทุกเครื่องฟัง" : "เปลี่ยนเป็นลำโพงหลัก"}
        </button>
      </span>
    </div>
  );
}
