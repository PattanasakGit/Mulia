"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { motion } from "motion/react";
import { ApiError, api } from "@/lib/client";
import type { RoomCard, RoomSnapshot } from "@/lib/types";
import { Icon } from "@/components/icon";
import { ease, rise, riseList } from "@/components/motion";
import { Quiet } from "@/components/stage";
import { TopBar } from "@/components/top-bar";
import { useIdentity } from "@/components/use-identity";

export function Archive() {
  const router = useRouter();
  const identity = useIdentity();
  const [rooms, setRooms] = useState<RoomCard[]>([]);
  const [roomName, setRoomName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<"create" | "join" | null>(null);

  useEffect(() => {
    if (identity === null) router.replace("/enter?next=/archive");
  }, [identity, router]);

  useEffect(() => {
    if (!identity) return;
    let stop = false;
    const load = async () => {
      try {
        const data = await api<{ rooms: RoomCard[] }>("/api/rooms");
        if (!stop) setRooms(data.rooms);
      } catch {
        /* the list refreshes again */
      }
    };
    void load();
    const id = window.setInterval(load, 4000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [identity]);

  async function createRoom(event: FormEvent) {
    event.preventDefault();
    if (!identity) return;
    setPending("create");
    setError("");
    try {
      const snapshot = await api<RoomSnapshot>("/api/rooms", {
        method: "POST",
        body: JSON.stringify({
          name: roomName,
          memberId: identity.id,
          memberName: identity.name,
          emoji: identity.emoji,
        }),
      });
      router.push(`/r/${snapshot.room.code}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "เปิดห้องไม่สำเร็จ");
      setPending(null);
    }
  }

  async function joinRoom(event: FormEvent) {
    event.preventDefault();
    const nextCode = code.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (nextCode.length < 4) {
      setError("ใส่รหัสห้อง");
      return;
    }
    setPending("join");
    setError("");
    try {
      await api(`/api/rooms/${nextCode}`);
      router.push(`/r/${nextCode}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "ไม่พบห้องนี้ใน MULIA");
      setPending(null);
    }
  }

  if (!identity) return <Quiet label="กำลังเปิด MULIA" />;

  const shared = rooms.filter(isShared);
  const resting = rooms.filter((room) => !isShared(room));

  return (
    <div className="app">
      <TopBar />
      <main className="catalog">
        <header className="catalog-head">
          <div>
            <h1 className="catalog-title">ห้องฟัง</h1>
            <p className="catalog-lede">เลือกห้องที่เปิดอยู่ หรือเปิดห้องใหม่</p>
          </div>
        </header>

        <motion.div className="catalog-actions" variants={riseList} initial="hidden" animate="show">
          <motion.form className="panel" variants={rise} onSubmit={createRoom}>
            <h2>เปิดห้อง</h2>
            <label htmlFor="room-name">
              <span>ชื่อห้อง</span>
              <input
                id="room-name"
                className="field"
                value={roomName}
                maxLength={48}
                placeholder={`ห้องของ ${identity.name}`}
                onChange={(event) => setRoomName(event.target.value)}
              />
            </label>
            <button className="btn btn-solid btn-block" type="submit" disabled={pending !== null}>
              <Icon icon={Add01Icon} size={16} />
              {pending === "create" ? "กำลังเปิด" : "เปิดห้อง"}
            </button>
          </motion.form>
          <motion.form className="panel" variants={rise} onSubmit={joinRoom}>
            <h2>เข้าด้วยรหัส</h2>
            <label htmlFor="room-code">
              <span>รหัสห้อง</span>
              <input
                id="room-code"
                className="field code-input"
                value={code}
                maxLength={8}
                placeholder="AB3K9Q"
                autoCapitalize="characters"
                onChange={(event) => setCode(event.target.value.toUpperCase())}
              />
            </label>
            <button className="btn btn-block" type="submit" disabled={pending !== null}>
              {pending === "join" ? "กำลังเข้า" : "เข้าห้อง"}
            </button>
          </motion.form>
        </motion.div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}

        {rooms.length === 0 ? (
          <p className="share-empty">ยังไม่มีห้อง เปิดห้องแล้ววางเพลงแรกได้เลย</p>
        ) : (
          <>
            <section className="catalog-section" aria-label="ห้องที่กำลังแชร์">
              <h2 className="section-label">กำลังแชร์</h2>
              {shared.length === 0 ? (
                <p className="share-empty">ยังไม่มีห้องที่มีคนอยู่</p>
              ) : (
                <div className="share-list">
                  {shared.map((room, index) => (
                    <RoomLink key={room.code} room={room} featured index={index} />
                  ))}
                </div>
              )}
            </section>

            {resting.length > 0 ? (
              <section className="catalog-section" aria-label="ห้องอื่น">
                <h2 className="section-label">ห้องอื่น</h2>
                <div className="quiet-list">
                  {resting.map((room, index) => (
                    <RoomLink key={room.code} room={room} index={index} />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

function isShared(room: RoomCard) {
  return room.listeners > 0 || room.status === "playing";
}

function roomSong(room: RoomCard) {
  if (!room.title) return "ยังไม่มีเพลง";
  return room.author ? `${room.title} · ${room.author}` : room.title;
}

function roomState(room: RoomCard) {
  if (room.status === "playing") return "กำลังเล่น";
  if (room.status === "paused") return "หยุดไว้";
  return "ยังไม่เปิดเพลง";
}

function RoomLink({ room, featured = false, index = 0 }: { room: RoomCard; featured?: boolean; index?: number }) {
  return (
    <motion.a
      className={featured ? "share-card" : "quiet-card"}
      href={`/r/${room.code}`}
      layoutId={`room-${room.code}`}
      whileHover={{ y: -3 }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        layout: { type: "spring", bounce: 0.16, duration: 0.5 },
        opacity: { duration: 0.4, delay: Math.min(index, 6) * 0.05 },
        y: { duration: 0.4, ease, delay: Math.min(index, 6) * 0.05 },
      }}
    >
      {room.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="room-cover" src={room.thumbnail} alt="" />
      ) : (
        <span className="room-cover room-cover-empty" />
      )}
      <span className="room-copy">
        <strong>{room.name}</strong>
        <em>{roomSong(room)}</em>
      </span>
      <span className="room-meta">
        <strong>{room.listeners} คน</strong>
        <span className={room.status === "playing" ? "is-live" : undefined}>{roomState(room)}</span>
        <span className="room-code-sm">{room.code}</span>
      </span>
    </motion.a>
  );
}
