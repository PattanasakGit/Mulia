"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Delete02Icon,
  DragDropVerticalIcon,
  Link04Icon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PlusSignIcon,
  PreviousIcon,
} from "@hugeicons/core-free-icons";
import { ApiError, api } from "@/lib/client";
import { readVolume, writeVolume } from "@/lib/identity";
import { liveFromSnapshot } from "@/lib/present";
import { projectPosition } from "@/lib/time";
import type { RoomSnapshot, Track } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { ease, fadeUp } from "@/components/motion";
import { Progress } from "@/components/progress";
import { ShareSheet } from "@/components/share-sheet";
import { Quiet } from "@/components/stage";
import { TopBar } from "@/components/top-bar";
import { useIdentity } from "@/components/use-identity";
import { Vinyl, type VinylHandle } from "@/components/vinyl";
import { VolumeControl } from "@/components/volume-control";

const localNow = () => Date.now();

export function RoomStage() {
  const params = useParams();
  const router = useRouter();
  const code = (typeof params.code === "string" ? params.code : "").toUpperCase();
  const identity = useIdentity();
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [volume, setVolume] = useState(100);
  const [muted, setMuted] = useState(false);
  const vinylRef = useRef<VinylHandle | null>(null);
  const heardAt = useRef(0);
  const pollGen = useRef(0);
  const draggingRef = useRef(false);
  const dragIdRef = useRef<string | null>(null);
  const overIdRef = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  useEffect(() => {
    if (identity === null && code) {
      router.replace(`/enter?next=${encodeURIComponent(`/r/${code}`)}`);
    }
  }, [identity, code, router]);

  useEffect(() => {
    const sync = () => {
      const stored = readVolume();
      setVolume(stored.volume);
      setMuted(stored.muted);
    };
    sync();
    window.addEventListener("sound-index-volume", sync);
    return () => window.removeEventListener("sound-index-volume", sync);
  }, []);

  useEffect(() => {
    if (!identity || !code) return;
    let stop = false;

    const load = async () => {
      const gen = pollGen.current;
      try {
        const next = await api<RoomSnapshot>(`/api/rooms/${code}`);
        if (!stop && gen === pollGen.current && !draggingRef.current) {
          heardAt.current = localNow();
          setSnap(next);
          setError("");
        }
      } catch (caught) {
        if (!stop) {
          setError(caught instanceof ApiError ? caught.message : "ไม่พบห้องนี้ใน MULIA");
        }
      }
    };

    const beat = async () => {
      try {
        await api(`/api/rooms/${code}/join`, {
          method: "POST",
          body: JSON.stringify({ memberId: identity.id, memberName: identity.name, emoji: identity.emoji }),
        });
      } catch {
        /* presence refreshes on the next beat */
      }
    };

    void beat();
    void load();
    const poll = window.setInterval(load, 1200);
    const heart = window.setInterval(beat, 20000);
    const onVisible = () => {
      if (!document.hidden) {
        void beat();
        void load();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      window.clearInterval(poll);
      window.clearInterval(heart);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [identity, code]);

  const command = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      pollGen.current += 1;
      const gen = pollGen.current;
      try {
        const next = await api<RoomSnapshot>(`/api/rooms/${code}/playback`, {
          method: "POST",
          body: JSON.stringify({ action, ...extra }),
        });
        if (gen === pollGen.current) {
          heardAt.current = localNow();
          setSnap(next);
        }
        setFormError("");
        return next;
      } catch (error) {
        setFormError(error instanceof ApiError ? error.message : "อัปเดตการเล่นไม่สำเร็จ");
        throw error;
      }
    },
    [code],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (event.code !== "Space" || !snap?.current) return;
      event.preventDefault();
      if (snap.playback.status === "playing") void command("pause").catch(() => undefined);
      else {
        setUnlocked(true);
        setSnap((prev) =>
          prev ? { ...prev, playback: { ...prev.playback, status: "playing" } } : prev,
        );
        vinylRef.current?.play();
        void command("play").catch(() => undefined);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [command, snap]);

  useEffect(() => {
    const trackId = snap?.playback.trackId;
    if (!trackId) return;
    document
      .querySelector<HTMLElement>(`.queue li[data-track-id="${CSS.escape(trackId)}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [snap?.playback.trackId]);

  async function addTrack(event: FormEvent) {
    event.preventDefault();
    if (!identity || !url.trim()) return;
    setAdding(true);
    setFormError("");
    pollGen.current += 1;
    const gen = pollGen.current;
    try {
      const next = await api<RoomSnapshot>(`/api/rooms/${code}/queue`, {
        method: "POST",
        body: JSON.stringify({ url, memberName: identity.name }),
      });
      if (gen === pollGen.current) {
        heardAt.current = localNow();
        setSnap(next);
      }
      setUrl("");
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : "เพิ่มเพลงไม่สำเร็จ");
    } finally {
      setAdding(false);
    }
  }

  async function commitQueue(
    body: { removeId: string } | { order: string[] } | { playId: string },
    fallback: string,
  ) {
    pollGen.current += 1;
    const gen = pollGen.current;
    try {
      const next = await api<RoomSnapshot>(`/api/rooms/${code}/queue`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (gen === pollGen.current) {
        heardAt.current = localNow();
        setSnap(next);
      }
      setFormError("");
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : fallback);
    }
  }

  function placeTrack(fromId: string, toId: string) {
    if (!snap || fromId === toId) return;
    const ids = snap.queue.map((track) => track.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    const order = ids.slice();
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    const byId = new Map(snap.queue.map((track) => [track.id, track]));
    setSnap({ ...snap, queue: order.map((id) => byId.get(id)).filter((track): track is Track => Boolean(track)) });
    void commitQueue({ order }, "จัดลำดับคิวไม่สำเร็จ");
  }

  function beginTrack(track: Track) {
    setUnlocked(true);
    vinylRef.current?.load(track.youtubeId);
    setSnap((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        current: { ...track, status: "current" },
        queue: prev.queue.map((item) => {
          if (item.id === track.id) return { ...item, status: "current" };
          if (item.status === "current") return { ...item, status: "played" };
          return item;
        }),
        playback: {
          ...prev.playback,
          status: "playing",
          positionMs: 0,
          anchorMs: Date.now(),
          trackId: track.id,
        },
      };
    });
  }

  function playFromQueue(trackId: string) {
    if (!snap) return;
    const chosen = snap.queue.find((track) => track.id === trackId);
    if (!chosen) return;
    beginTrack(chosen);
    void commitQueue({ playId: trackId }, "เล่นเพลงนี้ไม่สำเร็จ");
  }

  function moveTrack(trackId: string, direction: -1 | 1) {
    if (!snap) return;
    const ids = snap.queue.map((track) => track.id);
    const index = ids.indexOf(trackId);
    const target = ids[index + direction];
    if (!target) return;
    placeTrack(trackId, target);
  }

  function trackUnder(y: number) {
    const rows = document.querySelectorAll<HTMLElement>(".queue li[data-track-id]");
    let found: string | null = null;
    rows.forEach((row) => {
      const box = row.getBoundingClientRect();
      if (y >= box.top && y <= box.bottom) found = row.dataset.trackId ?? found;
    });
    return found;
  }

  function beginDrag(event: PointerEvent<HTMLButtonElement>, trackId: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    draggingRef.current = true;
    dragIdRef.current = trackId;
    overIdRef.current = trackId;
    setDragId(trackId);
    setOverId(trackId);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!draggingRef.current) return;
    const next = trackUnder(event.clientY);
    if (!next || next === overIdRef.current) return;
    overIdRef.current = next;
    setOverId(next);
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!draggingRef.current) return;
    const from = dragIdRef.current;
    const to = trackUnder(event.clientY) ?? overIdRef.current;
    draggingRef.current = false;
    dragIdRef.current = null;
    overIdRef.current = null;
    setDragId(null);
    setOverId(null);
    if (from && to) placeTrack(from, to);
  }

  if (!identity) return <Quiet label="กำลังเปิดห้อง" />;

  if (error && !snap) {
    return (
      <div className="app">
        <TopBar />
        <main className="anteroom">
          <div className="anteroom-inner">
            <p className="eyebrow">ไม่พบห้อง</p>
            <h1 className="display display-small">ไม่มีใน MULIA</h1>
            <p className="lede">{error}</p>
            <a className="btn btn-solid btn-block" href="/archive">
              กลับไปที่ MULIA
            </a>
          </div>
        </main>
      </div>
    );
  }

  if (!snap) return <Quiet label="กำลังเปิดห้อง" />;

  const playing = snap.playback.status === "playing";
  const live = liveFromSnapshot(snap);

  return (
    <div className="app">
      <TopBar
        live={live}
        room={{
          name: snap.room.name,
          code: snap.room.code,
          members: snap.members,
          selfId: identity.id,
          onShare: () => setSharing(true),
        }}
      />
      <main className="deck">
        <motion.section className="deck-player" {...fadeUp(0.02)}>
          <Vinyl
            spinning={playing && hearing}
            thumbnail={snap.current?.thumbnail ?? null}
            title={snap.current?.title || snap.room.name}
            videoId={snap.current?.youtubeId}
            playback={snap.playback}
            serverNow={snap.serverNow}
            trackId={snap.current?.id}
            durationSec={snap.current?.durationSec}
            interactive
            unlocked={unlocked}
            muted={muted}
            volume={volume}
            playerRef={vinylRef}
            onAudible={() => setHearing(true)}
            onEnded={async (trackId) => {
              await command("ended", { trackId });
            }}
            onDuration={(trackId, seconds) => {
              setSnap((prev) => {
                if (!prev?.current || prev.current.id !== trackId) return prev;
                return {
                  ...prev,
                  current: { ...prev.current, durationSec: Math.round(seconds) },
                };
              });
              void api(`/api/rooms/${code}/playback`, {
                method: "POST",
                body: JSON.stringify({ action: "duration", trackId, durationSec: seconds }),
              }).catch(() => undefined);
            }}
          />
          <div className="deck-now">
          <h1 className="track-title">{snap.current?.title || "ห้องยังเงียบ"}</h1>
          <p className="track-author">
            {snap.current
              ? `${snap.current.author} — เพิ่มโดย ${snap.current.addedBy}`
              : "วางลิงก์แล้วกดเพิ่ม เพลงจะขึ้นจานให้ทุกคน"}
          </p>
          <Progress
            playback={snap.playback}
            serverNow={snap.serverNow}
            durationSec={snap.current?.durationSec ?? null}
            seed={snap.current?.youtubeId ?? snap.current?.id ?? "quiet"}
            onSeek={(positionMs) => {
              setUnlocked(true);
              vinylRef.current?.play();
              void command("seek", { positionMs }).catch(() => undefined);
            }}
          />
          <div className="deck-controls">
            <div className="deck-transport" aria-label="การเล่น">
              <span className="transport-side" aria-hidden="true" />
              <div className="transport-core">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="ก่อนหน้า"
                  disabled={!snap.current}
                  onClick={() => {
                    if (!snap?.playback.trackId) return;
                    const position = projectPosition(snap.playback, snap.serverNow, heardAt.current);
                    const index = snap.queue.findIndex((track) => track.id === snap.playback.trackId);
                    const current = snap.queue[index] ?? snap.current;
                    if (position > 3000 || index <= 0) {
                      if (current) beginTrack(current);
                    } else {
                      const earlier = snap.queue[index - 1];
                      if (earlier) beginTrack(earlier);
                    }
                    void command("previous").catch(() => undefined);
                  }}
                >
                  <Icon icon={PreviousIcon} size={22} />
                </button>
              <motion.button
                type="button"
                className="play-main"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.94 }}
                transition={{ type: "spring", stiffness: 420, damping: 28 }}
                aria-label={playing ? "หยุด" : "เล่น"}
                disabled={!snap.current && snap.queue.length === 0}
                onClick={() => {
                  setUnlocked(true);
                  if (playing) {
                    void command("pause").catch(() => undefined);
                    return;
                  }
                  setSnap((prev) =>
                    prev
                      ? { ...prev, playback: { ...prev.playback, status: "playing" } }
                      : prev,
                  );
                  vinylRef.current?.play();
                  void command("play").catch(() => undefined);
                }}
              >
                <Icon icon={playing ? PauseIcon : PlayIcon} size={28} />
              </motion.button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="ถัดไป"
                  disabled={!snap.current && snap.queue.length === 0}
                  onClick={() => {
                    const index = snap.queue.findIndex((track) => track.id === snap.playback.trackId);
                    const upcoming = index >= 0 ? snap.queue[index + 1] : snap.queue[0];
                    if (upcoming) beginTrack(upcoming);
                    else setUnlocked(true);
                    void command("next").catch(() => undefined);
                  }}
                >
                  <Icon icon={NextIcon} size={22} />
                </button>
              </div>
              <div className="transport-side is-end">
                <VolumeControl
                  volume={volume}
                  muted={muted}
                  onChange={(nextVolume, nextMuted) => {
                    setVolume(nextVolume);
                    setMuted(nextMuted);
                    writeVolume(nextVolume, nextMuted);
                    window.dispatchEvent(new Event("sound-index-volume"));
                  }}
                />
              </div>
            </div>
            <p className="visual-note" hidden={!(snap.current && !hearing)}>
              กดปุ่มเล่นเพื่อเริ่มเสียง
            </p>
          </div>
          </div>
        </motion.section>
        <motion.section className="deck-side" {...fadeUp(0.08)}>
          <motion.div
            className="deck-bar"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease, delay: 0.08 }}
          >
            <form className="add-pill" onSubmit={addTrack}>
              <label className="sr-only" htmlFor="track-url">เพิ่มเพลง</label>
              <span className="add-pill-icon" aria-hidden="true">
                <Icon icon={Link04Icon} size={18} />
              </span>
              <input
                id="track-url"
                value={url}
                placeholder="วางลิงก์ YouTube หรือ YouTube Music"
                autoComplete="off"
                onChange={(event) => setUrl(event.target.value)}
              />
              <button className="add-go" type="submit" disabled={adding || !url.trim()}>
                <span className="add-go-plus" aria-hidden="true">
                  <Icon icon={PlusSignIcon} size={14} />
                </span>
                <span>{adding ? "กำลังเพิ่ม" : "เพิ่มเข้าคิว"}</span>
              </button>
            </form>
          </motion.div>
          {formError ? <p className="form-error" role="alert">{formError}</p> : null}
          <div className="queue-stage">
            <div className="queue-card">
          <div className="queue-head">
            <p className="eyebrow queue-label">คิวเพลง</p>
            {snap.queue.length > 0 ? (
              <p className="empty-queue">กดชื่อเพลงเพื่อเล่น ลากที่ขอบซ้ายเพื่อจัดลำดับ</p>
            ) : null}
          </div>
          {snap.queue.length === 0 ? (
            <p className="queue-empty">ยังไม่มีเพลงรอ เพลงที่เพิ่มจะต่อจากเพลงนี้</p>
          ) : (
            <ul className="queue">
              <AnimatePresence initial={false}>
              {snap.queue.map((track) => (
                <motion.li
                  key={track.id}
                  layout="position"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{
                    layout: { type: "spring", bounce: 0.16, duration: 0.45 },
                    opacity: { duration: 0.25 },
                    y: { duration: 0.3, ease },
                  }}
                  data-track-id={track.id}
                  aria-current={track.id === snap.playback.trackId ? "true" : undefined}
                  className={
                    [
                      track.id === snap.playback.trackId ? "is-playing" : "",
                      track.id === snap.playback.trackId && snap.playback.status === "playing" ? "is-spinning" : "",
                      dragId === track.id ? "is-dragging" : "",
                      overId === track.id && dragId ? "is-over" : "",
                    ].filter(Boolean).join(" ") || undefined
                  }
                >
                  <button
                    type="button"
                    className="icon-btn queue-grip"
                    data-track-id={track.id}
                    aria-label={`ลากเพื่อย้าย ${track.title}`}
                    onPointerDown={(event) => beginDrag(event, track.id)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onKeyDown={(event) => {
                      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                      event.preventDefault();
                      moveTrack(track.id, event.key === "ArrowUp" ? -1 : 1);
                    }}
                  >
                    <Icon icon={DragDropVerticalIcon} size={16} />
                  </button>
                  <span className="queue-disc" aria-hidden="true">
                    {track.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={track.thumbnail} alt="" />
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="queue-play"
                    aria-label={`เล่น ${track.title}`}
                    title={track.title}
                    onClick={() => playFromQueue(track.id)}
                  >
                    <strong>{track.title}</strong>
                    <em>
                      {track.id === snap.playback.trackId ? (
                        <span className="queue-now">
                          {snap.playback.status === "playing" ? "กำลังเล่น" : "หยุดไว้"}
                        </span>
                      ) : null}
                      {track.author}
                    </em>
                  </button>
                  <span className="queue-actions">
                    <span className="queue-adder" title={`เพิ่มโดย ${track.addedBy}`}>
                      <Avatar name={track.addedBy} hue={track.adder.hue} emoji={track.adder.emoji} size={24} />
                      <span className="queue-adder-name">{track.addedBy}</span>
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`นำออกจากคิว ${track.title}`}
                      onClick={() => void commitQueue({ removeId: track.id }, "นำเพลงออกไม่สำเร็จ")}
                    >
                      <Icon icon={Delete02Icon} size={16} />
                    </button>
                  </span>
                </motion.li>
              ))}
              </AnimatePresence>
            </ul>
          )}
            </div>
          </div>
        </motion.section>
      </main>
      <AnimatePresence>
        {sharing ? <ShareSheet key="share" code={snap.room.code} onClose={() => setSharing(false)} /> : null}
      </AnimatePresence>
    </div>
  );
}
