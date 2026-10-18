"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { PositionClock, formatTime } from "@/lib/time";
import type { Playback } from "@/lib/types";

export function useProjectedPosition(
  playback: Pick<Playback, "status" | "positionMs" | "anchorMs">,
  serverNow: number,
) {
  const [clock] = useState(() => new PositionClock());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  return clock.read(playback, serverNow, now);
}

function hashString(value: string) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

const GILT = [
  { crown: "#e7c277", body: "#f6e2b0", bloom: "#f0cd82" },
  { crown: "#efa44c", body: "#f8cf96", bloom: "#f4b25e" },
  { crown: "#c9794a", body: "#efc1a0", bloom: "#dd935f" },
] as const;

function smoothstep(from: number, to: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

const HILLS = [
  { center: [0.48, 0.62], width: [0.2, 0.27], height: [0.66, 0.8] },
  { center: [0.64, 0.76], width: [0.11, 0.16], height: [0.86, 1] },
  { center: [0.34, 0.5], width: [0.13, 0.19], height: [0.5, 0.66] },
] as const;

function between([low, high]: readonly [number, number], roll: number) {
  return low + (high - low) * roll;
}

function hillPath(seed: string, index: number) {
  const shape = HILLS[index] ?? HILLS[0];
  const rand = mulberry32(hashString(`${seed}:hill:${index}`));
  const center = between(shape.center, rand());
  const width = between(shape.width, rand());
  const height = between(shape.height, rand());
  const echoAt = center - width * (1.1 + rand() * 0.5);
  const echoHeight = height * (0.18 + rand() * 0.16);
  const samples = 64;
  let path = "M0 100";
  for (let step = 0; step <= samples; step += 1) {
    const t = step / samples;
    const crest = Math.exp(-(((t - center) / width) ** 2));
    const echo = Math.exp(-(((t - echoAt) / (width * 0.8)) ** 2)) * (echoHeight / height);
    const fade = smoothstep(0, 0.22, t) * (1 - smoothstep(0.88, 1, t));
    const y = 100 - Math.min(1, crest + echo) * height * fade * 100;
    path += ` L${(t * 1000).toFixed(1)} ${y.toFixed(2)}`;
  }
  return `${path} L1000 100 Z`;
}

export function Progress({
  playback,
  serverNow,
  durationSec,
  seed = "quiet",
  onSeek,
}: {
  playback: Playback;
  serverNow: number;
  durationSec: number | null;
  seed?: string;
  onSeek?: (positionMs: number) => void;
}) {
  const position = useProjectedPosition(playback, serverNow);
  const durationMs = durationSec ? durationSec * 1000 : 0;
  const liveRatio = durationMs > 0 ? Math.min(1, Math.max(0, position / durationMs)) : 0;
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const ratio = dragRatio ?? liveRatio;
  const shown = dragRatio !== null && durationMs > 0 ? dragRatio * durationMs : durationMs > 0 ? Math.min(position, durationMs) : position;
  const hills = useMemo(() => [0, 1, 2].map((index) => hillPath(seed, index)), [seed]);
  const rawId = useId().replace(/:/g, "");
  const gradientIds = [0, 1, 2].map((index) => `hill-${rawId}-${index}`);
  const swell = 0.35 + smoothstep(0, 0.22, ratio) * 0.65;
  const running = playback.status === "playing" && dragRatio === null;
  const stageRef = useRef<HTMLDivElement>(null);

  function ratioFromEvent(event: ReactPointerEvent<HTMLDivElement>) {
    const stage = stageRef.current;
    if (!stage) return 0;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  }

  function commit(next: number) {
    if (!onSeek || !durationMs) return;
    onSeek(Math.round(next * durationMs));
  }

  return (
    <div className="progress-block">
      <div
        ref={stageRef}
        className={`progress ${onSeek && durationMs ? "is-seekable" : ""} ${dragRatio !== null ? "is-dragging" : ""} ${running ? "is-running" : ""}`}
        style={{
          ["--play" as string]: `${ratio * 100}%`,
          ["--swell" as string]: swell.toFixed(3),
        }}
        role="slider"
        aria-label="ตำแหน่งการเล่น"
        aria-valuemin={0}
        aria-valuemax={durationMs || 0}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={formatTime(shown)}
        tabIndex={onSeek && durationMs ? 0 : -1}
        onPointerDown={(event) => {
          if (!onSeek || !durationMs || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragRatio(ratioFromEvent(event));
        }}
        onPointerMove={(event) => {
          if (dragRatio === null || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          setDragRatio(ratioFromEvent(event));
        }}
        onPointerUp={(event) => {
          if (dragRatio === null) return;
          const next = ratioFromEvent(event);
          setDragRatio(null);
          commit(next);
        }}
        onPointerCancel={() => setDragRatio(null)}
        onKeyDown={(event) => {
          if (!onSeek || !durationMs) return;
          const step = durationMs * 0.05;
          if (event.key === "ArrowRight") onSeek(Math.min(durationMs, shown + step));
          if (event.key === "ArrowLeft") onSeek(Math.max(0, shown - step));
        }}
      >
        <span className="wave-rest" />
        <div className="wave-art" aria-hidden="true">
          <svg className="wave-bloom" viewBox="0 0 1000 100" preserveAspectRatio="none">
            {hills.map((path, index) => (
              <path key={`bloom-${index}`} d={path} fill={GILT[index]?.bloom} />
            ))}
          </svg>
          <svg className="wave-hills" viewBox="0 0 1000 100" preserveAspectRatio="none">
            <defs>
              {GILT.map((tone, index) => (
                <linearGradient
                  key={gradientIds[index]}
                  id={gradientIds[index]}
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="100"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor={tone.crown} stopOpacity="1" />
                  <stop offset="55%" stopColor={tone.body} stopOpacity="0.9" />
                  <stop className="wave-base" offset="100%" />
                </linearGradient>
              ))}
            </defs>
            {hills.map((path, index) => (
              <g key={`hill-${index}`} className={`wave-hill wave-hill-${index}`}>
                <path d={path} fill={`url(#${gradientIds[index]})`} />
              </g>
            ))}
          </svg>
        </div>
        <span className="wave-line" />
        <span className="wave-thumb" />
      </div>
      <div className="progress-times">
        <span>{formatTime(shown)}</span>
        <span>{durationSec ? formatTime(durationMs) : "—"}</span>
      </div>
    </div>
  );
}
