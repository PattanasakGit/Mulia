"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { AnimatePresence, motion } from "motion/react";
import { api } from "@/lib/client";
import type { LiveNow } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { Mark } from "@/components/mark";
import { ease } from "@/components/motion";
import { useIdentity } from "@/components/use-identity";
import Link from "next/link";

function usePolledNow(enabled: boolean) {
  const [live, setLive] = useState<LiveNow | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const load = async () => {
      try {
        const next = await api<LiveNow>("/api/now");
        if (!stop) setLive(next);
      } catch {
        /* keep the last reading */
      }
    };
    void load();
    const id = window.setInterval(load, 4000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [enabled]);

  return live;
}

export function TopBar({ live }: { live?: LiveNow | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const identity = useIdentity();
  const polled = usePolledNow(live === undefined);
  const current = live === undefined ? polled : live;

  const roomCode = current?.roomCode;
  function openRoom() {
    if (roomCode) router.push(`/r/${roomCode}`);
  }

  const naming = pathname === "/enter";
  const inRoom = pathname.startsWith("/r/");

  return (
    <header className="topbar">
      <div className="topbar-start">
        <Link href="/" className="brand">
          <Mark />
          <span>MULIA</span>
        </Link>
        <button
          type="button"
          className="nav-btn nav-person"
          aria-label={identity ? identity.name : "ตั้งชื่อ"}
          onClick={() => editName(router, pathname)}
        >
          {identity ? (
            <Avatar name={identity.name} hue={identity.hue} emoji={identity.emoji} size={32} />
          ) : (
            <span className="avatar avatar-empty" style={{ width: 32, height: 32 }} />
          )}
          {identity ? <span className="nav-name">{identity.name}</span> : null}
        </button>
      </div>
      <div className="topbar-end">
        <AnimatePresence>
          {naming || inRoom || !roomCode ? null : (
            <motion.button
              key={`${roomCode}-${current?.title ?? ""}`}
              type="button"
              className="now-chip"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.28, ease }}
              onClick={openRoom}
            >
              <strong>{current?.title || "กำลังเล่น"}</strong>
              <span>{current?.roomName || "MULIA"}</span>
            </motion.button>
          )}
        </AnimatePresence>
        <ThemeToggle />
      </div>
    </header>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("sound-index-theme", next);
    } catch {
      /* storage may be blocked */
    }
  }

  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={dark ? "โหมดสว่าง" : "โหมดมืด"}
      aria-pressed={dark}
      onClick={toggle}
    >
      <motion.span
        key={dark ? "sun" : "moon"}
        style={{ display: "grid" }}
        initial={{ opacity: 0, rotate: -18 }}
        animate={{ opacity: 1, rotate: 0 }}
        transition={{ duration: 0.25, ease }}
      >
        <Icon icon={dark ? Sun03Icon : Moon02Icon} size={20} />
      </motion.span>
    </button>
  );
}

function editName(router: ReturnType<typeof useRouter>, pathname: string) {
  const next = pathname && pathname !== "/enter" ? pathname : "/archive";
  router.push(`/enter?next=${encodeURIComponent(next)}`);
}
