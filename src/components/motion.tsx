"use client";

import { MotionConfig, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export const ease = [0.22, 1, 0.36, 1] as const;

export const rise = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease },
  },
};

export const riseList = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
};

/** `skip` (reduced motion): render the shown state immediately, no entrance. */
export function fadeUp(delay = 0, skip = false) {
  return {
    initial: skip ? (false as const) : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, ease, delay },
  };
}

/**
 * App-wide motion settings. `reducedMotion="user"` alone only drops transform/layout
 * animations; opacity fades still run. Under prefers-reduced-motion we also skip every
 * motion animation, so elements jump straight to their final state.
 */
export function MotionRoot({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion() === true;
  return (
    <MotionConfig reducedMotion="user" skipAnimations={reduce}>
      {children}
    </MotionConfig>
  );
}
