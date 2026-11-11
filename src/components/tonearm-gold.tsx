"use client";

import { useId } from "react";

export function TonearmGold({ spinning }: { spinning: boolean }) {
  const uid = useId().replace(/:/g, "");
  const metal = `tonearm-metal-${uid}`;
  return (
    <svg
      className={`tonearm tonearm-gold ${spinning ? "is-play" : "is-rest"}`}
      viewBox="0 0 80 262"
      width="80"
      height="262"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={metal} x1="0" x2="1">
          <stop offset="0" stopColor="#8d7a5c" />
          <stop offset="0.5" stopColor="#f1e2c4" />
          <stop offset="1" stopColor="#7d6a4c" />
        </linearGradient>
      </defs>
      <rect x="30" y="2" width="16" height="22" rx="4" fill={`url(#${metal})`} />
      <circle cx="38" cy="38" r="15" fill="#2a251d" stroke={`url(#${metal})`} strokeWidth="3" />
      <circle cx="38" cy="38" r="6" fill={`url(#${metal})`} />
      <path
        d="M38 50 C 66 110, 50 165, 34 185 S 20 205, 17 212"
        fill="none"
        stroke={`url(#${metal})`}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path d="M13 208 l10 4 -9 34 -10 -4z" fill="#d9c7a4" stroke="#6d5d43" />
    </svg>
  );
}
