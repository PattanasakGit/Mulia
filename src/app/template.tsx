"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { MotionRoot, ease } from "@/components/motion";

export default function Template({ children }: { children: ReactNode }) {
  return (
    <MotionRoot>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.28, ease }}
      >
        {children}
      </motion.div>
    </MotionRoot>
  );
}
