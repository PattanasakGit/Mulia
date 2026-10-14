"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { fadeUp } from "@/components/motion";

export function Stage({
  visual,
  children,
  align = "center",
}: {
  visual: ReactNode;
  children: ReactNode;
  align?: "center" | "start";
}) {
  return (
    <main className="stage">
      <section className="stage-visual">{visual}</section>
      <section className={`stage-copy align-${align}`}>
        <div className="stage-copy-inner">{children}</div>
      </section>
    </main>
  );
}

export function Quiet({ label }: { label: string }) {
  return (
    <main className="anteroom">
      <motion.p className="eyebrow" {...fadeUp()}>{label}</motion.p>
    </main>
  );
}
