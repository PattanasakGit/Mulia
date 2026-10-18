"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft01Icon, Refresh03Icon } from "@hugeicons/core-free-icons";
import { randomAnimal } from "@/lib/animals";
import { useRandomAnimal, useStoredIdentityRaw } from "@/lib/client-store";
import { hueFromName } from "@/lib/hue";
import { parseIdentity, readIdentity, writeIdentity } from "@/lib/identity";
import { safeNext } from "@/lib/time";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { rise, riseList } from "@/components/motion";
import { TopBar } from "@/components/top-bar";

export function EnterForm() {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const raw = useStoredIdentityRaw();
  // Render stays pure: parse only. The one-time emoji migration write happens in an effect.
  const existing = useMemo(() => parseIdentity(raw), [raw]);
  useEffect(() => {
    if (raw !== null) readIdentity();
  }, [raw]);
  const fallbackAnimal = useRandomAnimal();
  const [typedName, setName] = useState<string | null>(null);
  const [pickedEmoji, setPickedEmoji] = useState<string | null>(null);
  const name = typedName ?? existing?.name ?? "";
  const emoji = pickedEmoji ?? existing?.emoji ?? fallbackAnimal;
  const known = existing !== null;
  const returnToRoom = known && next.startsWith("/r/");
  const trimmed = name.trim().replace(/\s+/g, " ");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!trimmed || trimmed.length > 32 || !emoji) return;
    writeIdentity(trimmed, emoji);
    router.push(next);
  }

  return (
    <div className="app">
      <TopBar />
      <main className="anteroom">
        <motion.form className="anteroom-inner" variants={riseList} initial={reduceMotion ? false : "hidden"} animate="show" onSubmit={submit}>
          {returnToRoom ? (
            <motion.div className="anteroom-back-row" variants={rise}>
              <Link className="anteroom-back" href={next}>
                <Icon icon={ArrowLeft01Icon} size={17} />
                กลับไปห้องเพลง
              </Link>
            </motion.div>
          ) : null}
          <motion.h1 className="display display-small enter-title" variants={rise}>
            ใช้แค่ชื่อของคุณ <span>ไม่ต้องเข้าระบบ</span>
          </motion.h1>
          <motion.label className="stack" htmlFor="listener-name" variants={rise}>
            <span>ชื่อ</span>
            <input
              id="listener-name"
              className="field"
              value={name}
              maxLength={32}
              autoFocus
              autoComplete="nickname"
              placeholder="ให้ห้องเรียกคุณว่าอะไร"
              onChange={(event) => setName(event.target.value)}
            />
          </motion.label>
          <motion.div className="name-preview" variants={rise}>
            {emoji ? (
              <Avatar name={trimmed || "คุณ"} hue={hueFromName(trimmed || emoji)} emoji={emoji} size={88} />
            ) : (
              <span className="avatar avatar-empty" style={{ width: 88, height: 88 }} />
            )}
            <div>
              <strong>{trimmed || "ชื่อของคุณ"}</strong>
              <button
                type="button"
                className="animal-reroll"
                onClick={() => setPickedEmoji(randomAnimal(emoji))}
              >
                <Icon icon={Refresh03Icon} size={16} />
                สุ่มสัตว์ใหม่
              </button>
            </div>
          </motion.div>
          <motion.button className="btn btn-solid btn-block" type="submit" disabled={!trimmed} variants={rise} whileTap={{ scale: 0.98 }}>
            {known ? "บันทึกชื่อ" : next.startsWith("/r/") ? "เข้าห้องนี้" : "ไปเลือกห้อง"}
          </motion.button>
        </motion.form>
      </main>
    </div>
  );
}
