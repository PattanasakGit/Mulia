"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { api } from "@/lib/client";
import { readIdentity } from "@/lib/identity";
import { formatTime } from "@/lib/time";
import type { LiveNow } from "@/lib/types";
import { Icon } from "@/components/icon";
import { ease } from "@/components/motion";
import { useProjectedPosition } from "@/components/progress";
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
    <div className="app home-shell" style={{ overflowX: "clip" }}>
      <TopBar live={reading} />
      <motion.main className="home" variants={homeList} initial="hidden" animate="show">
        <section className="home-hero">
          <motion.div className="home-stage" variants={discIn}>
            <div className="home-glow" aria-hidden="true" />
            <div className="home-rings" aria-hidden="true">
              <span />
              <span />
            </div>
            <div className="home-disc">
              <Vinyl
                spinning={playing}
                thumbnail={open ? reading.thumbnail : null}
                title={open && reading.title ? reading.title : "MULIA"}
              />
            </div>
          </motion.div>
          <motion.div className="home-copy" variants={homeList}>
            <motion.p className={`home-eyebrow${playing ? " is-live" : ""}`} variants={lineIn}>
              <span className="home-eyebrow-dot" aria-hidden="true" />
              {playing ? "กำลังเล่นอยู่ตอนนี้" : open ? "มีห้องเปิดอยู่" : "ห้องฟังเพลงด้วยกัน"}
            </motion.p>
            <motion.h1 className="home-title" variants={lineIn}>MULIA</motion.h1>
            <motion.p className="home-lede" variants={lineIn}>
              {open
                ? "มีคนกำลังฟังอยู่ เข้าไปฟังจังหวะเดียวกันได้เลย"
                : "เปิดห้อง วางลิงก์ แล้วฟังเพลงเดียวกัน ในจังหวะเดียวกัน กับคนที่คุณชวน"}
            </motion.p>
            {open && reading.title ? (
              <motion.div variants={lineIn}>
                <NowCard live={reading} onOpen={() => go(roomPath)} />
              </motion.div>
            ) : null}
            <motion.div className="home-actions" variants={lineIn}>
              <motion.button
                type="button"
                className="home-go"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => go(roomPath)}
              >
                <span>{open ? "เข้าไปฟัง" : "เริ่มฟัง"}</span>
                <span className="home-go-arrow" aria-hidden="true">
                  <Icon icon={ArrowRight01Icon} size={18} />
                </span>
              </motion.button>
              <button type="button" className="home-more" onClick={() => go("/archive")}>
                {open ? "ดูห้องทั้งหมด" : "ดูห้องที่เปิดอยู่"}
              </button>
            </motion.div>
          </motion.div>
        </section>
      </motion.main>
    </div>
  );
}

function NowCard({ live, onOpen }: { live: LiveNow; onOpen: () => void }) {
  const position = useProjectedPosition(live, live.serverNow);
  const duration = (live.durationSec ?? 0) * 1000;
  const ratio = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <button type="button" className="home-now" onClick={onOpen}>
      <span className={`home-now-disc${live.status === "playing" ? " is-spinning" : ""}`} aria-hidden="true">
        {live.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={live.thumbnail} alt="" />
        ) : null}
      </span>
      <span className="home-now-text">
        <strong>{live.title}</strong>
        <em>
          {live.roomName || live.author}
          {live.listeners > 0 ? ` · ${live.listeners} คนกำลังฟัง` : ""}
        </em>
      </span>
      <span className="home-now-time">
        {formatTime(position)}
        {duration > 0 ? <i> / {formatTime(duration)}</i> : null}
      </span>
      <span className="home-now-line" aria-hidden="true">
        <span style={{ width: `${ratio * 100}%` }} />
      </span>
    </button>
  );
}
