"use client";

import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { readIdentity } from "@/lib/identity";
import { Icon } from "@/components/icon";
import { ease } from "@/components/motion";
import { useCurtain } from "@/components/curtain";
import { TopBar } from "@/components/top-bar";
import { Vinyl } from "@/components/vinyl";

const homeList = {
  hidden: {},
  show: { transition: { staggerChildren: 0.16, delayChildren: 0.08 } },
};

const discIn = {
  hidden: { opacity: 0, y: 28, scale: 0.92 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 1.05, ease },
  },
};

const lineIn = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.72, ease } },
};

// The front page says what MULIA is and offers one way in. It shows nothing from any room:
// pointing strangers at a room that happens to be playing sends them into a room that is not theirs.
export function Landing() {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const curtain = useCurtain();

  function start(event: MouseEvent<HTMLButtonElement>) {
    if (!readIdentity()) {
      router.push(`/enter?next=${encodeURIComponent("/archive")}`);
      return;
    }
    curtain("/archive", event.currentTarget);
  }

  return (
    <div className="app home-shell" style={{ overflowX: "clip" }}>
      <TopBar />
      <motion.main
        className="home"
        variants={homeList}
        // prefers-reduced-motion: skip the entrance (fade) animations entirely
        initial={reduceMotion ? false : "hidden"}
        animate="show"
      >
        <section className="home-hero">
          <motion.div className="home-stage" variants={discIn}>
            <div className="home-glow" aria-hidden="true" />
            <div className="home-rings" aria-hidden="true">
              <span />
              <span />
            </div>
            <div className="home-disc">
              <Vinyl spinning={false} thumbnail={null} title="MULIA" />
            </div>
          </motion.div>
          <motion.div className="home-copy" variants={homeList}>
            <motion.p className="home-eyebrow" variants={lineIn}>
              <span className="home-eyebrow-dot" aria-hidden="true" />
              ห้องฟังเพลงด้วยกัน
            </motion.p>
            <motion.h1 className="home-title" variants={lineIn}>MULIA</motion.h1>
            <motion.p className="home-lede" variants={lineIn}>
              เปิดห้อง วางลิงก์ แล้วฟังเพลงเดียวกัน ในจังหวะเดียวกัน กับคนที่คุณชวน
            </motion.p>
            <motion.div className="home-actions" variants={lineIn}>
              <motion.button
                type="button"
                className="home-go"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={start}
              >
                <span>เริ่มฟัง</span>
                <span className="home-go-arrow" aria-hidden="true">
                  <Icon icon={ArrowRight01Icon} size={18} />
                </span>
              </motion.button>
            </motion.div>
          </motion.div>
        </section>
      </motion.main>
    </div>
  );
}
