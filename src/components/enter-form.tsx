"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { randomAnimal } from "@/lib/animals";
import { hueFromName } from "@/lib/hue";
import { readIdentity, writeIdentity } from "@/lib/identity";
import { safeNext } from "@/lib/time";
import { Avatar } from "@/components/avatar";
import { rise, riseList } from "@/components/motion";
import { TopBar } from "@/components/top-bar";

export function EnterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [known, setKnown] = useState(false);
  const trimmed = name.trim().replace(/\s+/g, " ");

  useEffect(() => {
    const existing = readIdentity();
    if (existing) {
      setName(existing.name);
      setEmoji(existing.emoji);
      setKnown(true);
    } else {
      setEmoji(randomAnimal());
    }
  }, []);

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
        <motion.form className="anteroom-inner" variants={riseList} initial="hidden" animate="show" onSubmit={submit}>
          <motion.p className="eyebrow" variants={rise}>ชื่อผู้ฟัง</motion.p>
          <motion.h1 className="display display-small" variants={rise}>{known ? "ชื่อของคุณ" : "ก่อนเริ่มฟัง"}</motion.h1>
          <motion.p className="lede" variants={rise}>
            ใช้แค่ชื่อก็พอ สัตว์ตัวนี้จะเป็นอวาตาร์ที่คนในห้องเห็นข้าง ๆ คุณ
          </motion.p>
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
              <span>สัตว์ตัวนี้ติดไปกับคุณทุกห้อง</span>
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
