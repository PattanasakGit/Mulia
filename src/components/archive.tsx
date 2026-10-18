"use client";

import { Thumb } from "@/components/thumb";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight01Icon, DoorOpenIcon, Key01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { motion, useReducedMotion } from "motion/react";
import { isSuperAdmin } from "@/lib/admin";
import { ApiError, api } from "@/lib/client";
import { startPolling } from "@/lib/poll";
import { deviceId } from "@/lib/speaker";
import type { RoomCard, RoomSnapshot } from "@/lib/types";
import { Icon } from "@/components/icon";
import { ease, rise, riseList } from "@/components/motion";
import { curtainArriving } from "@/components/curtain";
import { Quiet } from "@/components/stage";
import { TopBar } from "@/components/top-bar";
import { useIdentity } from "@/components/use-identity";

export function Archive() {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const identity = useIdentity();
  const [rooms, setRooms] = useState<RoomCard[]>([]);
  const [roomName, setRoomName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<"create" | "join" | "close" | null>(null);
  const [closingRoom, setClosingRoom] = useState<RoomCard | null>(null);

  useEffect(() => {
    if (identity === null) router.replace("/enter?next=/archive");
  }, [identity, router]);

  useEffect(() => {
    if (!identity) return;
    let stop = false;
    const poller = startPolling(
      async () => {
        const data = await api<{ rooms: RoomCard[] }>("/api/rooms");
        if (!stop) setRooms(data.rooms);
      },
      { baseMs: 6000, hiddenMs: 30000 },
    );
    const onVisible = () => {
      if (!document.hidden) poller.nudge();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      poller.stop();
      document.removeEventListener("visibilitychange", onVisible);
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
          deviceId: deviceId(),
          deviceLabel: `เครื่องของ ${identity.name}`,
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

  async function removeRoom() {
    if (!identity || !closingRoom) return;
    const target = closingRoom;
    setPending("close");
    setError("");
    try {
      await api(`/api/rooms/${target.code}/close`, {
        method: "POST",
        body: JSON.stringify({ memberId: identity.id, memberName: identity.name }),
      });
      setRooms((current) => current.filter((room) => room.code !== target.code));
      setClosingRoom(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "ลบห้องไม่สำเร็จ");
    } finally {
      setPending(null);
    }
  }

  if (!identity) return <Quiet label="กำลังเปิด MULIA" />;

  const admin = isSuperAdmin(identity.name);
  // arriving through the curtain: let the record close first, then the panels rise
  const arrivalList = curtainArriving()
    ? { ...riseList, show: { transition: { ...riseList.show.transition, delayChildren: 0.85 } } }
    : riseList;
  const shared = rooms.filter(isShared);
  const resting = rooms.filter((room) => !isShared(room));

  return (
    <div className="app">
      <TopBar />
      <main className="catalog">
        <div className="catalog-record" aria-hidden="true" />
        <header className="catalog-head">
          <p className="catalog-eyebrow">
            <span aria-hidden="true" />
            เลือกห้อง
          </p>
          <h1 className="catalog-title">ห้องฟัง</h1>
          <p className="catalog-lede">เปิดห้องใหม่ หรือกรอกรหัสห้องที่เพื่อนส่งให้</p>
        </header>

        <motion.div className="catalog-actions" variants={arrivalList} initial={reduceMotion ? false : "hidden"} animate="show">
          <motion.div className="panel-sleeve" variants={rise}>
            <form className="panel panel-create" onSubmit={createRoom}>
              <div className="panel-head">
                <span className="panel-badge" aria-hidden="true">
                  <Icon icon={DoorOpenIcon} size={24} />
                </span>
                <div>
                  <h2>เปิดห้อง</h2>
                  <p className="panel-sub">ตั้งชื่อ แล้วชวนเพื่อนด้วยรหัส</p>
                </div>
              </div>
              <label htmlFor="room-name" className="panel-field">
                <span className="sr-only">ชื่อห้อง</span>
                <input
                  id="room-name"
                  className="field"
                  value={roomName}
                  maxLength={48}
                  placeholder={`ห้องของ ${identity.name}`}
                  onChange={(event) => setRoomName(event.target.value)}
                />
              </label>
              <button className="catalog-go" type="submit" disabled={pending !== null}>
                <span>{pending === "create" ? "กำลังเปิด" : "เปิดห้อง"}</span>
                <span className="catalog-go-plus" aria-hidden="true">
                  <Icon icon={PlusSignIcon} size={16} />
                </span>
              </button>
            </form>
          </motion.div>
          <motion.div className="panel-sleeve is-quiet" variants={rise}>
            <form className="panel panel-join" onSubmit={joinRoom}>
              <div className="panel-head">
                <span className="panel-badge is-quiet" aria-hidden="true">
                  <Icon icon={Key01Icon} size={22} />
                </span>
                <div>
                  <h2>เข้าด้วยรหัส</h2>
                  <p className="panel-sub">รหัส 6 ตัวจากเพื่อน</p>
                </div>
              </div>
              <CodeField value={code} onChange={setCode} />
              <button className="catalog-join" type="submit" disabled={pending !== null}>
                <span>{pending === "join" ? "กำลังเข้า" : "เข้าห้อง"}</span>
                <span className="catalog-join-arrow" aria-hidden="true">
                  <Icon icon={ArrowRight01Icon} size={16} />
                </span>
              </button>
            </form>
          </motion.div>
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
                    <RoomLink key={room.code} room={room} featured index={index} onDelete={admin ? () => setClosingRoom(room) : undefined} />
                  ))}
                </div>
              )}
            </section>

            {resting.length > 0 ? (
              <section className="catalog-section" aria-label="ห้องอื่น">
                <h2 className="section-label">ห้องอื่น</h2>
                <div className="quiet-list">
                  {resting.map((room, index) => (
                    <RoomLink key={room.code} room={room} index={index} onDelete={admin ? () => setClosingRoom(room) : undefined} />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>
      {closingRoom ? (
        <div className="overlay" onClick={() => { if (pending !== "close") setClosingRoom(null); }}>
          <div
            className="sheet invite close-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-room-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">ลบห้อง</p>
            <h2 id="close-room-title" className="invite-lead">{closingRoom.name}</h2>
            <p className="close-copy">ห้อง {closingRoom.code} จะหายไป คนที่อยู่ในห้องจะออก และลิงก์เดิมใช้ไม่ได้อีก</p>
            <div className="close-actions">
              <button type="button" className="btn" disabled={pending === "close"} onClick={() => setClosingRoom(null)}>ยกเลิก</button>
              <button type="button" className="btn btn-solid" disabled={pending === "close"} onClick={() => void removeRoom()}>
                {pending === "close" ? "กำลังลบ" : "ลบห้อง"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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

function RoomLink({
  room,
  featured = false,
  index = 0,
  onDelete,
}: {
  room: RoomCard;
  featured?: boolean;
  index?: number;
  onDelete?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div className={onDelete ? "room-entry is-admin" : "room-entry"}>
    <motion.a
      className={`${featured ? "share-card" : "quiet-card"}${room.status === "playing" ? " is-playing" : ""}`}
      href={`/r/${room.code}`}
      layoutId={`room-${room.code}`}
      whileHover={{ y: -3 }}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        layout: { type: "spring", bounce: 0.16, duration: 0.5 },
        opacity: { duration: 0.4, delay: Math.min(index, 6) * 0.05 },
        y: { duration: 0.4, ease, delay: Math.min(index, 6) * 0.05 },
      }}
    >
      <span className={`room-disc${room.status === "playing" ? " is-spinning" : ""}`} aria-hidden="true">
        {room.thumbnail ? (
          <Thumb src={room.thumbnail} />
        ) : (
          <span className="room-disc-mark">M</span>
        )}
      </span>
      <span className="room-copy">
        <strong>{room.name}</strong>
        <em>
          {room.status === "playing" ? <span className="room-live">กำลังเล่น</span> : null}
          {roomSong(room)}
        </em>
      </span>
      <span className="room-meta">
        <strong>{room.listeners} คน</strong>
        <span>{room.status === "playing" ? "ในห้อง" : roomState(room)}</span>
        <span className="room-code-sm">{room.code}</span>
      </span>
    </motion.a>
    {onDelete ? (
      <button type="button" className="room-delete" onClick={onDelete}>ลบ</button>
    ) : null}
    </div>
  );
}

const CODE_LENGTH = 6;
const HINT = "AB3K9Q";

/** A pasted link or sentence still yields the code: take what follows /r/, else any A-Z0-9. */
function readCode(raw: string) {
  const fromLink = raw.match(/\/r\/([A-Za-z0-9]{4,8})/);
  const source = fromLink ? fromLink[1] : raw;
  return source.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, CODE_LENGTH);
}

/**
 * Six cells that show the room code as it is typed. A real input sits over them (invisible), so
 * typing, pasting, autofill and screen readers all behave as with any text field.
 */
function CodeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const active = Math.min(value.length, CODE_LENGTH - 1);
  return (
    <label htmlFor="room-code" className="code-field" onClick={() => ref.current?.focus()}>
      <span className="sr-only">รหัสห้อง</span>
      <span className="code-cells" aria-hidden="true">
        {Array.from({ length: CODE_LENGTH }, (_, index) => (
          <span
            key={index}
            className={`code-cell${value[index] ? " is-filled" : ""}${index === active ? " is-active" : ""}`}
          >
            {value[index] ?? (value ? "" : HINT[index])}
          </span>
        ))}
      </span>
      <input
        ref={ref}
        id="room-code"
        className="code-real"
        value={value}
        maxLength={40}
        inputMode="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        onChange={(event) => onChange(readCode(event.target.value))}
      />
    </label>
  );
}
