"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { api } from "@/lib/client";
import { readIdentity } from "@/lib/identity";
import type { LiveNow } from "@/lib/types";
import { ease } from "@/components/motion";
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

const idle: LiveNow = {
  serverNow: Date.now(),
  roomCode: null,
  roomName: null,
  listeners: 0,
  title: null,
  author: null,
  thumbnail: null,
  youtubeId: null,
  status: "idle",
  positionMs: 0,
  anchorMs: Date.now(),
  durationSec: null,
};

export function Landing() {
  const router = useRouter();
  const [live, setLive] = useState<LiveNow | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const next = await api<LiveNow>("/api/now");
        if (!stop) setLive(next);
      } catch {
        /* the index can stay quiet */
      }
    };
    void load();
    const id = window.setInterval(load, 4000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);

  const reading = live ?? idle;
  const open = Boolean(reading.roomCode);
  const playing = open && reading.status === "playing" && Boolean(reading.youtubeId);

  function go(path: string) {
    router.push(readIdentity() ? path : `/enter?next=${encodeURIComponent(path)}`);
  }

  const roomPath = open && reading.roomCode ? `/r/${reading.roomCode}` : "/archive";

  return (
    <div className="app home-shell" style={{ overflowX: "hidden" }}>
      <TopBar live={reading} />
      <motion.main className="home" variants={homeList} initial="hidden" animate="show">
        <motion.div className="home-stage" variants={discIn}>
          <div className="home-glow" aria-hidden="true" />
          <div className="home-disc">
            <Vinyl
              spinning={playing}
              thumbnail={open ? reading.thumbnail : null}
              title={open && reading.title ? reading.title : "MULIA"}
            />
          </div>
        </motion.div>
        <motion.div className="home-copy" variants={homeList}>
          <motion.h1 className="home-title" variants={lineIn}>MULIA</motion.h1>
          <motion.p className="home-lede" variants={lineIn}>
            {open
              ? "มีคนกำลังฟังอยู่ เข้าไปฟังด้วยกันได้เลย"
              : "เปิดห้อง วางลิงก์ แล้วฟังไปด้วยกัน"}
          </motion.p>
          {open && reading.title ? (
            <motion.p className="home-now" variants={lineIn}>
              <strong>{reading.title}</strong>
              <span>{reading.roomName || reading.author}</span>
            </motion.p>
          ) : null}
          <motion.button
            type="button"
            className="btn btn-solid home-go"
            variants={lineIn}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => go(roomPath)}
          >
            <span>{open ? "เข้าไปฟัง" : "เริ่มฟัง"}</span>
          </motion.button>
          {open ? (
            <motion.button type="button" className="home-more" variants={lineIn} onClick={() => go("/archive")}>
              ดูห้องทั้งหมด
            </motion.button>
          ) : null}
        </motion.div>
      </motion.main>
    </div>
  );
}
