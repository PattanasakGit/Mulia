"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { ease } from "@/components/motion";

export default function Template({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className="page-fade"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.28, ease }}
    >
      {children}
    </motion.div>
  );
}
