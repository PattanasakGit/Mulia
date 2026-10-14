"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { VolumeHighIcon, VolumeLowIcon, VolumeMute02Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/icon";

export function VolumeControl({
  volume,
  muted,
  onChange,
}: {
  volume: number;
  muted: boolean;
  onChange: (volume: number, muted: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const popId = useId();
  const reduceMotion = useReducedMotion();
  const level = muted ? 0 : volume;
  const icon = level === 0 ? VolumeMute02Icon : level < 50 ? VolumeLowIcon : VolumeHighIcon;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: globalThis.PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function set(next: number) {
    const clamped = Math.round(Math.max(0, Math.min(100, next)));
    if (clamped === 0) onChange(volume, true);
    else onChange(clamped, false);
  }

  function fromPointer(clientY: number) {
    const rail = railRef.current;
    if (!rail) return;
    const box = rail.getBoundingClientRect();
    set(((box.bottom - clientY) / box.height) * 100);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    fromPointer(event.clientY);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 10 : 5;
    const keys: Record<string, number> = {
      ArrowUp: level + step,
      ArrowRight: level + step,
      ArrowDown: level - step,
      ArrowLeft: level - step,
      PageUp: level + 20,
      PageDown: level - 20,
      Home: 0,
      End: 100,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    set(keys[event.key] ?? level);
  }

  return (
    <div className="volume-control" ref={wrapRef}>
      <button
        type="button"
        className={`icon-btn volume-trigger${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-controls={popId}
        aria-label={muted ? "ระดับเสียง ปิดอยู่" : `ระดับเสียง ${volume}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon icon={icon} size={22} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            id={popId}
            className="volume-capsule"
            style={{ ["--level" as string]: `${level}%` }}
            initial={reduceMotion ? false : { opacity: 0, y: 10, scaleY: 0.6 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 8, scaleY: 0.7 }}
            transition={reduceMotion ? { duration: 0.01 } : { type: "spring", stiffness: 520, damping: 34, mass: 0.7 }}
          >
            <span className="volume-readout" aria-hidden="true">
              {level === 0 ? "ปิด" : level}
            </span>
            <div
              ref={railRef}
              className={`volume-rail${dragging ? " is-dragging" : ""}`}
              role="slider"
              tabIndex={0}
              autoFocus
              aria-label="ระดับเสียง"
              aria-orientation="vertical"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={level}
              aria-valuetext={level === 0 ? "ปิดเสียง" : `${level} จาก 100`}
              onPointerDown={onPointerDown}
              onPointerMove={(event) => {
                if (dragging) fromPointer(event.clientY);
              }}
              onPointerUp={() => setDragging(false)}
              onPointerCancel={() => setDragging(false)}
              onKeyDown={onKeyDown}
            >
              <span className="volume-fill" />
              <span className="volume-knob" />
            </div>
            <button
              type="button"
              className="volume-mute"
              aria-pressed={muted}
              aria-label={muted ? "เปิดเสียง" : "ปิดเสียง"}
              onClick={() => onChange(volume, !muted)}
            >
              <Icon icon={muted ? VolumeMute02Icon : VolumeHighIcon} size={16} />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
