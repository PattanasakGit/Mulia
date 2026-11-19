"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { ApiError, api } from "@/lib/client";
import type { FeedbackItem } from "@/lib/feedback";
import { ease } from "@/components/motion";
import { Quiet } from "@/components/stage";
import { TopBar } from "@/components/top-bar";
import { useIdentity } from "@/components/use-identity";

function when(ms: number) {
  const minutes = Math.floor((Date.now() - ms) / 60_000);
  if (minutes < 1) return "เมื่อสักครู่";
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} ชั่วโมงที่แล้ว`;
  return new Date(ms).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

export function FeedbackPage() {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const identity = useIdentity();
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setItems(null);
    try {
      setItems((await api<{ items: FeedbackItem[] }>("/api/feedback")).items);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "โหลดรายการไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    if (identity === null) router.replace("/enter?next=/feedback");
  }, [identity, router]);

  useEffect(() => {
    if (!identity) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
  }, [identity, load]);

  if (!identity) return <Quiet label="กำลังเปิด MULIA" />;

  return (
    <>
      <TopBar />
      <main className="catalog feedback-page">
        <p className="eyebrow">แจ้งปัญหา / เสนอไอเดีย</p>
        <h1 className="feedback-page-title">รายการที่แจ้งมา</h1>

        {error ? (
          <div className="feedback-state" role="alert">
            <p>{error}</p>
            <button type="button" className="btn" onClick={() => void load()}>ลองอีกครั้ง</button>
          </div>
        ) : items === null ? (
          <ul className="feedback-list" aria-busy="true" aria-label="กำลังโหลด">
            {[0, 1, 2].map((n) => (
              <li key={n} className="feedback-item feedback-skeleton" aria-hidden="true" />
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="feedback-state">
            <p>ยังไม่มีรายการ กดปุ่มไอคอนบนแถบบนเพื่อเป็นคนแรก</p>
          </div>
        ) : (
          <ul className="feedback-list">
            {items.map((item, index) => (
              <motion.li
                key={item.id}
                className="feedback-item"
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease, delay: Math.min(index, 8) * 0.05 }}
              >
                <h2>{item.topic}</h2>
                <p className="feedback-item-body">{item.body}</p>
                <time dateTime={new Date(item.createdAt).toISOString()}>{when(item.createdAt)}</time>
              </motion.li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
