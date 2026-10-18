"use client";

import { Thumb } from "@/components/thumb";
import { markCurrent, moveId, neighborId, orderTracks } from "@/lib/queue-order";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
import { isSuperAdmin } from "@/lib/admin";
import { ApiError, api } from "@/lib/client";
import { readIdentity, readVolume, writeVolume } from "@/lib/identity";
import { projectPosition } from "@/lib/time";
import { startPolling } from "@/lib/poll";
import { parseYoutubeUrl } from "@/lib/youtube";
import { deviceId, holdDeviceId, playsAudio, resolveRole, useDeviceId, useSpeakerFlags, writeFlag, type Role } from "@/lib/speaker";
import type { RoomSnapshot, SnapshotUnchanged, Track } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { ease, fadeUp } from "@/components/motion";
import { Progress } from "@/components/progress";
import { ShareSheet } from "@/components/share-sheet";
import { SpeakerControl } from "@/components/speaker-control";
import { Quiet } from "@/components/stage";
import { TopBar } from "@/components/top-bar";
import { useIdentity } from "@/components/use-identity";
import { Vinyl, type VinylHandle } from "@/components/vinyl";
import { VolumeControl } from "@/components/volume-control";

const localNow = () => Date.now();

// serverNow is stamped just before the reply is sent, so it is about half a round trip old on
// arrival. Moving it forward by that keeps a slow link from making the bar lag behind.
function shiftClock<T extends { serverNow: number }>(snapshot: T, sentAt: number): T {
  const halfTrip = Math.max(0, Math.min(2000, Math.round((localNow() - sentAt) / 2)));
  return { ...snapshot, serverNow: snapshot.serverNow + halfTrip };
}

export function RoomStage({ code: roomCode }: { code: string }) {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const code = roomCode.toUpperCase();
  const identity = useIdentity();
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [url, setUrl] = useState("");
  // songs being added: shown at once (the cover is known from the link) until the server answers
  const [pending, setPending] = useState<{ key: number; youtubeId: string }[]>([]);
  const pendingSeq = useRef(0);
  const [sharing, setSharing] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const needsTapRef = useRef(false);
  const [volume, setVolume] = useState(100);
  const [muted, setMuted] = useState(false);
  const device = useDeviceId();
  const flags = useSpeakerFlags(code);
  const [speakerBusy, setSpeakerBusy] = useState(false);
  const role = resolveRole(snap?.speaker, device, flags);
  const audio = playsAudio(role);
  const vinylRef = useRef<VinylHandle | null>(null);
  const heardAt = useRef(0);
  const mutationSeq = useRef(0);
  const pollEpoch = useRef(0);
  const inflight = useRef(0);
  const seenRoom = useRef(false);
  const followedFirst = useRef(false);
  // revision of the last full snapshot we hold untouched; "" = local state differs, send no ?v=
  const revRef = useRef("");
  const statusRef = useRef("idle");
  // true once this device has actually made sound: it is the speaker, so it must stay responsive
  const speakerRef = useRef(false);
  const roleRef = useRef<Role>("remote");
  const draggingRef = useRef(false);
  const dragIdRef = useRef<string | null>(null);
  const overIdRef = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  useEffect(() => {
    // Re-read storage: with cacheComponents a hidden (stale) room page is revealed again
    // after /enter, and its identity state may still be the old null value.
    if (identity === null && code && readIdentity() === null) {
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
    let poller: ReturnType<typeof startPolling> | null = null;
    let heartbeat: ReturnType<typeof startPolling> | null = null;
    const halt = () => {
      stop = true;
      poller?.stop();
      heartbeat?.stop();
    };

    const load = async () => {
      const epoch = pollEpoch.current;
      const sentAt = localNow();
      try {
        const have = revRef.current;
        // The speaker asks the server to hold the request until something changes: it hears
        // "play" at once even when its tab is hidden and the browser has throttled its timers.
        const holding = Boolean(have) && roleRef.current === "speaker";
        const next = await api<RoomSnapshot | SnapshotUnchanged>(
          `/api/rooms/${code}${have ? `?v=${encodeURIComponent(have)}` : ""}${holding ? `&wait=7&d=${deviceId()}` : ""}`,
        );
        // a reading that began before a local change would put the old position back on screen
        if (!stop && epoch === pollEpoch.current && inflight.current === 0 && !draggingRef.current) {
          seenRoom.current = true;
          setError("");
          // same state as the one on screen: nothing to render, and the running clock stays as is
          if (!("unchanged" in next)) {
            revRef.current = next.rev ?? "";
            heardAt.current = localNow();
            setSnap(shiftClock(next, sentAt));
          }
        }
        return holding ? 0 : next.pollMs;
      } catch (caught) {
        // a missing room ends the loop; anything else is a hiccup: keep the room, back off, retry
        if (!stop && caught instanceof ApiError && caught.status === 404) {
          setError(seenRoom.current ? "ห้องนี้ถูกปิดแล้ว" : "ไม่พบห้องนี้ใน MULIA");
          setSnap(null);
          halt();
          return;
        }
        throw caught;
      }
    };

    const identityBody = () =>
      JSON.stringify(
        (({ id, name, emoji }) => ({ memberId: id, memberName: name, emoji, deviceId: deviceId() }))(readIdentity() ?? identity),
      );

    const beat = async () => {
      // Presence only: one cheap write, no snapshot back (the poll already carries the room).
      try {
        await api(`/api/rooms/${code}/beat`, { method: "POST", body: identityBody() });
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 404) throw caught;
        /* presence refreshes on the next beat */
      }
    };

    // Join first so the first snapshot already lists this member.
    void (async () => {
      try {
        await api(`/api/rooms/${code}/join`, { method: "POST", body: identityBody() });
      } catch {
        /* the poll below reports a missing room */
      }
      if (stop) return;
      poller = startPolling(load, { baseMs: 1500, hiddenMs: 10000, slowWhenHidden: () => !speakerRef.current && statusRef.current !== "playing" });
      heartbeat = startPolling(async () => { await beat(); return 20000; }, { baseMs: 20000, hiddenMs: 20000 });
    })();
    const onVisible = () => {
      if (!document.hidden) {
        poller?.nudge();
        heartbeat?.nudge();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      poller?.stop();
      heartbeat?.stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [identity, code]);

  const mutate = useCallback(async (run: () => Promise<RoomSnapshot>) => {
    mutationSeq.current += 1;
    pollEpoch.current += 1;
    inflight.current += 1;
    const seq = mutationSeq.current;
    const sentAt = localNow();
    revRef.current = "";
    try {
      const next = await run();
      if (seq === mutationSeq.current) {
        heardAt.current = localNow();
        setSnap(shiftClock(next, sentAt));
      }
      return next;
    } finally {
      revRef.current = "";
      inflight.current -= 1;
      pollEpoch.current += 1;
    }
  }, []);

  const command = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      try {
        const next = await mutate(() =>
          api<RoomSnapshot>(`/api/rooms/${code}/playback`, {
            method: "POST",
            body: JSON.stringify({ action, ...extra }),
          }),
        );
        setFormError("");
        return next;
      } catch (error) {
        setFormError(error instanceof ApiError ? error.message : "อัปเดตการเล่นไม่สำเร็จ");
        throw error;
      }
    },
    [code, mutate],
  );

  useEffect(() => {
    needsTapRef.current = needsTap;
  }, [needsTap]);

  useEffect(() => {
    statusRef.current = snap?.playback.status ?? "idle";
  }, [snap?.playback.status]);

  useEffect(() => {
    // a remote has no sound to keep alive, so a hidden remote tab may poll slowly again
    speakerRef.current = audio;
  }, [audio]);

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    // a duplicated tab inherits this tab's device id; only one of them may keep it
    holdDeviceId();
  }, []);

  // The speaker must not fall asleep while it plays: keep the screen awake and take the lock back
  // after the tab was hidden (the browser releases it then).
  const holdScreen = role === "speaker" && snap?.playback.status === "playing";
  useEffect(() => {
    if (!holdScreen || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    const take = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        if (gone) void next.release();
        else lock = next;
      } catch {
        /* denied (battery saver, unsupported): the speaker simply may sleep */
      }
    };
    const onVisible = () => {
      if (!document.hidden && (!lock || lock.released)) void take();
    };
    void take();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [holdScreen]);

  useEffect(() => {
    if (!needsTap || !audio) return;
    const release = () => {
      needsTapRef.current = false;
      setNeedsTap(false);
      vinylRef.current?.release();
    };
    window.addEventListener("pointerdown", release);
    window.addEventListener("keydown", release);
    return () => {
      window.removeEventListener("pointerdown", release);
      window.removeEventListener("keydown", release);
    };
  }, [needsTap, audio]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (event.code !== "Space" || !snap?.current) return;
      event.preventDefault();
      if (audio && needsTapRef.current) return;
      if (snap.playback.status === "playing") void command("pause").catch(() => undefined);
      else {
        setUnlocked(true);
        markPlaying();
        vinylRef.current?.play();
        void command("play").catch(() => undefined);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [command, snap, audio]);

  useEffect(() => {
    const trackId = snap?.playback.trackId;
    if (!trackId) return;
    if (!followedFirst.current) {
      // opening the room must show the player, not scroll the page down to the queue
      followedFirst.current = true;
      return;
    }
    const row = document.querySelector<HTMLElement>(`.queue li[data-track-id="${CSS.escape(trackId)}"]`);
    if (!row) return;
    const box = row.getBoundingClientRect();
    if (box.bottom > 0 && box.top < window.innerHeight) {
      row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [snap?.playback.trackId]);

  async function addTrack(event: FormEvent) {
    event.preventDefault();
    const link = url.trim();
    if (!identity || !link) return;
    const youtubeId = parseYoutubeUrl(link);
    if (!youtubeId) {
      // no round trip needed to know this is not a YouTube link
      setFormError("ลิงก์นี้ต้องเป็นวิดีโอจาก YouTube หรือ YouTube Music");
      return;
    }
    pendingSeq.current += 1;
    const key = pendingSeq.current;
    setFormError("");
    setUrl("");
    setPending((list) => [...list, { key, youtubeId }]);
    try {
      await mutate(() =>
        api<RoomSnapshot>(`/api/rooms/${code}/queue`, {
          method: "POST",
          body: JSON.stringify({ url: link, memberName: identity.name }),
        }),
      );
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : "เพิ่มเพลงไม่สำเร็จ");
      setUrl((current) => current || link); // give the link back so nothing has to be pasted again
    } finally {
      setPending((list) => list.filter((item) => item.key !== key));
    }
  }

  async function commitQueue(
    body: { removeId: string } | { order: string[] } | { playId: string },
    fallback: string,
  ) {
    try {
      await mutate(() =>
        api<RoomSnapshot>(`/api/rooms/${code}/queue`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
      );
      setFormError("");
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : fallback);
    }
  }

  function speakerCall(body: Record<string, unknown>) {
    setSpeakerBusy(true);
    setFormError("");
    return mutate(() =>
      api<RoomSnapshot>(`/api/rooms/${code}/speaker`, {
        method: "POST",
        body: JSON.stringify({ deviceId: deviceId(), label: `เครื่องของ ${identity?.name ?? ""}`.trim(), ...body }),
      }),
    )
      .catch((caught) => setFormError(caught instanceof ApiError ? caught.message : "เปลี่ยนลำโพงไม่สำเร็จ"))
      .finally(() => setSpeakerBusy(false));
  }

  function claimSpeaker() {
    // the click is the gesture the browser needs before this device may make sound
    setUnlocked(true);
    writeFlag("listen", code, false);
    void speakerCall({});
  }

  function listenAlong() {
    setUnlocked(true);
    writeFlag(snap?.speaker?.mode === "single" ? "listen" : "remote", code, snap?.speaker?.mode === "single");
  }

  function stopListening() {
    writeFlag(snap?.speaker?.mode === "single" ? "listen" : "remote", code, snap?.speaker?.mode !== "single");
  }

  function switchSpeakerMode(mode: "single" | "all") {
    setUnlocked(true);
    writeFlag("listen", code, false);
    writeFlag("remote", code, false);
    void speakerCall({ action: "mode", mode });
  }

  function placeTrack(fromId: string, toId: string) {
    if (!snap) return;
    const order = moveId(snap.queue.map((track) => track.id), fromId, toId);
    if (!order) return;
    revRef.current = "";
    setSnap({ ...snap, queue: orderTracks(snap.queue, order) });
    void commitQueue({ order }, "จัดลำดับคิวไม่สำเร็จ");
  }

  function markPlaying() {
    const at = localNow();
    heardAt.current = at;
    revRef.current = "";
    setSnap((prev) =>
      prev
        ? { ...prev, serverNow: at, playback: { ...prev.playback, status: "playing", anchorMs: at } }
        : prev,
    );
  }

  function seekTo(positionMs: number) {
    setUnlocked(true);
    if (snap?.playback.status === "playing") vinylRef.current?.play();
    const at = localNow();
    heardAt.current = at;
    revRef.current = "";
    setSnap((prev) =>
      prev?.playback.trackId
        ? { ...prev, serverNow: at, playback: { ...prev.playback, positionMs, anchorMs: at } }
        : prev,
    );
    void command("seek", { positionMs }).catch(() => undefined);
  }

  function beginTrack(track: Track) {
    setUnlocked(true);
    vinylRef.current?.load(track.youtubeId);
    const at = localNow();
    heardAt.current = at;
    revRef.current = "";
    setSnap((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        serverNow: at,
        current: { ...track, status: "current" },
        queue: markCurrent(prev.queue, track.id),
        playback: {
          ...prev.playback,
          status: "playing",
          positionMs: 0,
          anchorMs: at,
          trackId: track.id,
        },
      };
    });
  }

  function playFromQueue(trackId: string) {
    if (!snap) return;
    const chosen = snap.queue.find((track) => track.id === trackId);
    if (!chosen) return;
    if (trackId === snap.playback.trackId) {
      // the song that is already current: a click must not restart it for the whole room
      if (snap.playback.status !== "playing") {
        setUnlocked(true);
        markPlaying();
        vinylRef.current?.play();
        void command("play").catch(() => undefined);
      }
      return;
    }
    beginTrack(chosen);
    void commitQueue({ playId: trackId }, "เล่นเพลงนี้ไม่สำเร็จ");
  }

  function moveTrack(trackId: string, direction: -1 | 1) {
    if (!snap) return;
    const target = neighborId(snap.queue.map((track) => track.id), trackId, direction);
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
    const closed = error === "ห้องนี้ถูกปิดแล้ว";
    return (
      <div className="app">
        <TopBar />
        <main className="anteroom">
          <div className="anteroom-inner">
            <p className="eyebrow">{closed ? "ห้องปิดแล้ว" : "ไม่พบห้อง"}</p>
            <h1 className="display display-small">{closed ? "ฟังจบแล้ว" : "ไม่มีใน MULIA"}</h1>
            <p className="lede">{closed ? "ลิงก์เดิมใช้ไม่ได้อีก" : error}</p>
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

  return (
    <div className="app">
      <TopBar
        room={{
          name: snap.room.name,
          code: snap.room.code,
          members: snap.members,
          selfId: identity.id,
          onShare: () => setSharing(true),
          onClose:
            identity.id === snap.room.openedBy || isSuperAdmin(identity.name)
              ? () => setConfirmingClose(true)
              : undefined,
        }}
      />
      <main className="deck">
        {error ? (
          <p className="form-error room-stale" role="alert">
            การเชื่อมต่อกับห้องขัดข้อง ข้อมูลที่เห็นอาจไม่เป็นปัจจุบัน กำลังลองใหม่…
          </p>
        ) : null}
        <motion.section className="deck-player" {...fadeUp(0.02, reduceMotion === true)}>
          <Vinyl
            spinning={playing && (audio ? hearing : true)}
            thumbnail={snap.current?.thumbnail ?? null}
            title={snap.current?.title || snap.room.name}
            videoId={snap.current?.youtubeId}
            playback={snap.playback}
            serverNow={snap.serverNow}
            trackId={snap.current?.id}
            durationSec={snap.current?.durationSec}
            interactive={audio}
            unlocked={playing || unlocked}
            muted={muted}
            volume={volume}
            playerRef={vinylRef}
            onAudible={() => {
              speakerRef.current = true;
              setHearing(true);
            }}
            onBlocked={() => setNeedsTap(true)}
            onEnded={async (trackId) => {
              for (let attempt = 0; ; attempt += 1) {
                try {
                  await command("ended", { trackId });
                  return;
                } catch (caught) {
                  const final = attempt >= 2 || (caught instanceof ApiError && caught.status > 0 && caught.status < 500);
                  if (final) throw caught;
                  await new Promise((resolve) => window.setTimeout(resolve, 1000 * (attempt + 1)));
                }
              }
            }}
            onDuration={(trackId, seconds) => {
              revRef.current = "";
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
            onSeek={seekTo}
          />
          <div className="deck-controls">
            <div className="deck-transport" aria-label="การเล่น">
              <div className="transport-side">
                <SpeakerControl
                  role={role}
                  speaker={snap.speaker}
                  busy={speakerBusy}
                  onClaim={claimSpeaker}
                  onListen={listenAlong}
                  onStopListening={stopListening}
                  onSetMode={switchSpeakerMode}
                />
              </div>
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
                onPointerDown={(event) => {
                  if (audio && needsTapRef.current) event.stopPropagation();
                }}
                onClick={() => {
                  setUnlocked(true);
                  if (audio && needsTapRef.current) {
                    needsTapRef.current = false;
                    setNeedsTap(false);
                    vinylRef.current?.release();
                    return;
                  }
                  if (playing) {
                    void command("pause").catch(() => undefined);
                    return;
                  }
                  markPlaying();
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
                    // Tell the server which track we're skipping so a double press skips once.
                    const skipping = snap.playback.trackId;
                    void command("next", skipping ? { trackId: skipping } : {}).catch(() => undefined);
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
                    if (!nextMuted) {
                      needsTapRef.current = false;
                      setNeedsTap(false);
                      vinylRef.current?.release();
                    }
                  }}
                />
              </div>
            </div>
            <p className="visual-note" hidden={!(audio && needsTap && playing && !muted)}>
              แตะที่ใดก็ได้เพื่อเปิดเสียง
            </p>
          </div>
          </div>
        </motion.section>
        <motion.section className="deck-side" {...fadeUp(0.08, reduceMotion === true)}>
          <motion.div
            className="deck-bar"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease, delay: 0.08 }}
          >
            <form className={`add-pill${pending.length > 0 ? " is-busy" : ""}`} onSubmit={addTrack}>
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
              <button
                className="add-go"
                type="submit"
                disabled={!url.trim()}
                aria-label="เพิ่มเข้าคิว"
              >
                <span className="add-go-plus" aria-hidden="true">
                  <Icon icon={PlusSignIcon} size={14} />
                </span>
                <span>เพิ่มเข้าคิว</span>
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
          {snap.queue.length === 0 && pending.length === 0 ? (
            <p className="queue-empty">ยังไม่มีเพลงรอ เพลงที่เพิ่มจะต่อจากเพลงนี้</p>
          ) : (
            <ul className="queue">
              <AnimatePresence initial={false}>
              {snap.queue.map((track) => (
                <motion.li
                  key={track.id}
                  layout="position"
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
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
                      <Thumb src={track.thumbnail} />
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="queue-play"
                    title={track.title}
                    onClick={() => playFromQueue(track.id)}
                  >
                    {/* name = "เล่น " + visible text (axe label-content-name-mismatch) */}
                    <span className="sr-only">เล่น </span>
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
              {pending.map((item) => (
                <motion.li
                  key={`pending-${item.key}`}
                  className="queue-pending"
                  aria-busy="true"
                  aria-label="กำลังเพิ่มเพลง"
                  layout="position"
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ opacity: { duration: 0.22 }, y: { duration: 0.3, ease }, layout: { type: "spring", bounce: 0.16, duration: 0.45 } }}
                >
                  <span aria-hidden="true" />
                  <span className="queue-disc" aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`https://i.ytimg.com/vi/${item.youtubeId}/mqdefault.jpg`} alt="" />
                  </span>
                  <span className="queue-skel" aria-hidden="true">
                    <i />
                    <i />
                  </span>
                  <span className="queue-eq" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
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
        {confirmingClose ? (
          <CloseRoomDialog
            key="close-room"
            name={snap.room.name}
            pending={closing}
            onCancel={() => {
              if (!closing) setConfirmingClose(false);
            }}
            onConfirm={() => {
              setClosing(true);
              void api(`/api/rooms/${code}/close`, {
                method: "POST",
                body: JSON.stringify({ memberId: identity.id, memberName: identity.name }),
              })
                .then(() => router.replace("/archive"))
                .catch((caught) => {
                  setClosing(false);
                  setConfirmingClose(false);
                  setFormError(caught instanceof ApiError ? caught.message : "ปิดห้องไม่สำเร็จ");
                });
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function CloseRoomDialog({
  name,
  pending,
  onCancel,
  onConfirm,
}: {
  name: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const titleId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, pending]);

  return (
    <motion.div
      className="overlay"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      onClick={() => {
        if (!pending) onCancel();
      }}
    >
      <motion.div
        className="sheet invite close-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={reduceMotion ? false : { y: 12, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 8, opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.35, ease }}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">ปิดห้อง</p>
        <h2 id={titleId} className="invite-lead">{name}</h2>
        <p className="close-copy">ทุกคนจะออกจากห้องนี้ และลิงก์เดิมจะใช้ไม่ได้อีก</p>
        <div className="close-actions">
          <button type="button" className="btn" disabled={pending} onClick={onCancel}>อยู่ต่อ</button>
          <button type="button" className="btn btn-solid" disabled={pending} onClick={onConfirm}>
            {pending ? "กำลังปิด" : "ปิดห้อง"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
