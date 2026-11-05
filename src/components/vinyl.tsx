"use client";

import { TonearmGold } from "@/components/tonearm-gold";
import { Thumb } from "@/components/thumb";
import { memo, useEffect, useImperativeHandle, useEffectEvent, useLayoutEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type { YouTubePlayer } from "@/types/youtube";
import { useArrivalTime } from "@/lib/arrival";
import { useHydrated } from "@/lib/client-store";
import { projectPosition } from "@/lib/time";
import type { Playback } from "@/lib/types";

/** True (and restarts the clock) when more than `ms` passed since the last time it was true. */
function cooledDown(last: { current: number }, ms: number) {
  const now = Date.now();
  if (now - last.current <= ms) return false;
  last.current = now;
  return true;
}

const DRIFT_SECONDS = 1.5;
const DRIFT_COOLDOWN_MS = 10_000;
const ENDED = 0;
const PLAYING = 1;
const BUFFERING = 3;

let apiPromise: Promise<void> | null = null;

function loadYouTubeApi() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

type Handlers = {
  onReady: (player: YouTubePlayer) => void;
  onState: (state: number) => void;
  onError: () => void;
  /** The player is being torn down; drop every reference to it before its iframe goes away. */
  onGone: (player: YouTubePlayer) => void;
};

/** True while the player's iframe is still in the document (widgetapi throws once it is gone). */
export function isPlayerAlive(target: YouTubePlayer | null): target is YouTubePlayer {
  if (!target) return false;
  try {
    const frame = target.getIframe?.();
    return frame ? frame.isConnected : true;
  } catch {
    return false;
  }
}

const PlayerMount = memo(function PlayerMount({
  handlers,
}: {
  handlers: MutableRefObject<Handlers>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const parked = useHydrated();

  useEffect(() => {
    if (!parked) return;
    const host = hostRef.current;
    if (!host) return;
    let player: YouTubePlayer | null = null;
    let cancelled = false;
    // The handlers ref is a "latest callbacks" box (not a DOM ref); reading it at cleanup is intended.
    const latestHandlers = handlers;
    const node = document.createElement("div");
    host.appendChild(node);

    loadYouTubeApi().then(() => {
      if (cancelled || !window.YT || !host.isConnected) return;
      player = new window.YT.Player(node, {
        width: "363",
        height: "204",
        playerVars: {
          autoplay: 0,
          controls: 1,
          disablekb: 0,
          fs: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            if (!cancelled) handlers.current.onReady(event.target);
          },
          onStateChange: (event) => {
            if (!cancelled) handlers.current.onState(event.data);
          },
          onError: () => {
            if (!cancelled) handlers.current.onError();
          },
        },
      });
    });

    return () => {
      cancelled = true;
      const doomed = player;
      player = null;
      if (!doomed) {
        node.remove();
        return;
      }
      // Detach first so no sync/imperative call can message the dying iframe, then destroy now
      // (while the iframe is still attached) instead of on a later tick.
      // The old setTimeout(0) deferral (3f69ff5, Chrome crash on enter) is not needed now that the
      // player is portalled to <body>: re-verified 2026-10-18 with 20 rapid enter/leave + track-switch
      // cycles while playing in Chrome 155 (headed + headless) and Chromium 156: 0 crashes, 0 page errors.
      latestHandlers.current.onGone(doomed);
      try {
        doomed.destroy();
      } catch {
        /* already gone */
      }
      node.remove();
    };
  }, [handlers, parked]);

  if (!parked) return null;
  return <div ref={hostRef} className="yt-player-mount" />;
});

export type VinylHandle = {
  play: () => void;
  load: (videoId: string) => void;
  release: () => void;
};

type VinylProps = {
  spinning: boolean;
  thumbnail: string | null;
  title: string;
  videoId?: string | null;
  playback?: Playback;
  serverNow?: number;
  trackId?: string | null;
  durationSec?: number | null;
  interactive?: boolean;
  unlocked?: boolean;
  muted?: boolean;
  volume?: number;
  onEnded?: (trackId: string) => Promise<void> | void;
  onAudible?: () => void;
  onBlocked?: () => void;
  onDuration?: (trackId: string, seconds: number) => void;
  playerRef?: RefObject<VinylHandle | null>;
};

export function Vinyl({
  spinning,
  thumbnail,
  title,
  videoId = null,
  playback,
  serverNow,
  trackId = null,
  durationSec = null,
  interactive = false,
  unlocked = false,
  muted = false,
  volume = 100,
  onEnded,
  onAudible,
  onBlocked,
  onDuration,
  playerRef,
}: VinylProps) {
  const player = useRef<YouTubePlayer | null>(null);
  const ready = useRef(false);
  const loadedId = useRef<string | null>(null);
  const loadedTrackId = useRef<string | null>(null);
  const holdStart = useRef(false);
  const soundHeld = useRef(false);
  /** User gesture on this device; allows unmute attempts before React sees `unlocked`. */
  const gestured = useRef(false);
  /** Once the player is verified unmuted for this track, never re-mute from sync unless the user mutes. */
  const soundLatched = useRef(false);
  const latchedTrackId = useRef<string | null>(null);
  const blockTimer = useRef<number | null>(null);
  const syncedAnchor = useRef<number | null>(null);
  const lastDriftSeek = useRef(0);
  const endedFor = useRef<string | null>(null);
  const reportedFor = useRef<string | null>(null);
  const arrivedAt = useArrivalTime(serverNow);
  const latest = useRef({
    serverNow: serverNow ?? 0,
    arrivedAt,
    videoId,
    playback,
    trackId,
    durationSec,
    unlocked,
    muted,
    volume,
    interactive,
    onEnded,
    onAudible,
    onBlocked,
    onDuration,
  });

  const nextLatest = {
    serverNow: serverNow ?? 0,
    arrivedAt,
    videoId,
    playback,
    trackId,
    durationSec,
    unlocked,
    muted,
    volume,
    interactive,
    onEnded,
    onAudible,
    onBlocked,
    onDuration,
  };

  const handlers = useRef<Handlers>({
    onReady: () => undefined,
    onState: () => undefined,
    onError: () => undefined,
    onGone: () => undefined,
  });

  /** The current player, only if it is ready and its iframe still exists. */
  const live = (): YouTubePlayer | null => {
    const target = player.current;
    return ready.current && isPlayerAlive(target) ? target : null;
  };

  const detach = () => {
    player.current = null;
    ready.current = false;
    loadedId.current = null;
    loadedTrackId.current = null;
    syncedAnchor.current = null;
  };

  const mayAttemptSound = () => {
    const { interactive: canSound, unlocked: confirmed } = latest.current;
    return canSound && (confirmed || gestured.current);
  };

  /** Chrome may report unmuted before playback is audible; require PLAYING too. */
  const playerReallyAudible = (target: YouTubePlayer) => {
    try {
      return target.isMuted() === false && safeState(target) === PLAYING;
    } catch {
      return false;
    }
  };

  /** Route the browser user-activation bit toward the iframe (API-only unMute is often ignored). */
  const stealUserActivationForPlayer = (target: YouTubePlayer) => {
    try {
      const iframe = target.getIframe?.();
      if (!iframe) return;
      iframe.focus({ preventScroll: true });
      const opts: PointerEventInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
      };
      iframe.dispatchEvent(new PointerEvent("pointerdown", opts));
      iframe.dispatchEvent(new PointerEvent("pointerup", opts));
      iframe.click();
    } catch {
      /* cross-origin iframe may ignore synthetic events */
    }
  };

  const notifyAudibleIfNeeded = (target: YouTubePlayer) => {
    const current = latest.current;
    if (!current.interactive || soundLatched.current) return;
    if (!gestured.current && !current.unlocked) return;
    if (!playerReallyAudible(target)) return;
    soundLatched.current = true;
    current.onAudible?.();
  };

  const applyVolume = (target: YouTubePlayer) => {
    const { muted: userMuted, volume: level } = latest.current;
    try {
      if (userMuted) {
        target.mute();
        return;
      }
      if (mayAttemptSound() || soundLatched.current) {
        if (!soundHeld.current) {
          target.unMute();
          target.setVolume(Math.max(0, Math.min(100, level)));
        }
        notifyAudibleIfNeeded(target);
        return;
      }
      if (soundHeld.current) {
        target.mute();
        return;
      }
      target.mute();
    } catch {
      /* player went away; the next ready player picks the volume up */
    }
  };

  const clearBlockCheck = () => {
    if (blockTimer.current === null) return;
    window.clearTimeout(blockTimer.current);
    blockTimer.current = null;
  };

  const armBlockCheck = (retried: boolean) => {
    blockTimer.current = window.setTimeout(() => {
      blockTimer.current = null;
      const playerNow = live();
      const current = latest.current;
      if (!playerNow || !mayAttemptSound() || current.playback?.status !== "playing") return;
      if (current.muted || soundHeld.current) return;
      const state = safeState(playerNow);
      if (state === PLAYING || state === BUFFERING) return;
      if (!retried) {
        try {
          playerNow.playVideo();
        } catch {
          /* the next sync tries again */
        }
        armBlockCheck(true);
        return;
      }
      if (gestured.current && !soundLatched.current) {
        current.onBlocked?.();
        return;
      }
      soundHeld.current = true;
      try {
        playerNow.mute();
        playerNow.playVideo();
      } catch {
        /* the next sync tries again */
      }
      current.onBlocked?.();
    }, retried ? 3000 : 2500);
  };

  const requestPlay = (target: YouTubePlayer) => {
    applyVolume(target);
    try {
      target.playVideo();
    } catch {
      return;
    }
    if (soundHeld.current || latest.current.muted || blockTimer.current !== null) return;
    if (gestured.current && !soundLatched.current) return;
    armBlockCheck(false);
  };

  const cue = (target: YouTubePlayer, nextId: string, startSeconds: number, autoplay = false) => {
    const options = { videoId: nextId, startSeconds: Math.max(0, startSeconds) };
    // cueVideoById followed by playVideo is dropped while the new video is still loading, which left
    // the next song silent; loadVideoById starts it as soon as it is ready.
    if (autoplay) target.loadVideoById(options);
    else target.cueVideoById(options);
    loadedId.current = nextId;
    syncedAnchor.current = latest.current.playback?.anchorMs ?? null;
  };

  const expectedSeconds = () => {
    const current = latest.current.playback;
    if (!current) return 0;
    const raw =
      projectPosition(current, latest.current.serverNow, latest.current.arrivedAt) / 1000;
    const cap = latest.current.durationSec ?? 0;
    if (cap <= 0) return Math.max(0, raw);
    if (raw > cap + 1) return 0;
    return Math.min(raw, Math.max(0, cap - 0.5));
  };

  const parkAtStart = (target: YouTubePlayer) => {
    const id = latest.current.videoId;
    if (!id) return;
    endedFor.current = null;
    try {
      if (loadedId.current !== id) cue(target, id, 0);
      else target.seekTo(0, true);
    } catch {
      loadedId.current = null;
    }
  };

  const wantsSound = (current: typeof latest.current) =>
    current.playback?.status === "playing" && (current.unlocked || gestured.current);

  const sync = () => {
    const target = live();
    if (!target) return;
    try {
      syncWith(target);
    } catch {
      /* the player was torn down mid-sync; a fresh one re-syncs on ready */
    }
  };

  const syncWith = (target: YouTubePlayer) => {
    const current = latest.current;
    const maySound = mayAttemptSound();
    const gated = current.interactive && !maySound;
    const roomPlayingEarly = current.playback?.status === "playing";
    if (gated && roomPlayingEarly) {
      const early = safeState(target);
      if (early === PLAYING || early === BUFFERING) {
        clearBlockCheck();
        try {
          target.pauseVideo();
        } catch {
          /* player went away */
        }
      }
    }
    applyVolume(target);
    if (!current.videoId) {
      if (safeState(target) === PLAYING) target.pauseVideo();
      return;
    }

    if (holdStart.current) {
      if (expectedSeconds() > 0.75) {
        parkAtStart(target);
        return;
      }
      holdStart.current = false;
      loadedTrackId.current = current.trackId;
      syncedAnchor.current = current.playback?.anchorMs ?? null;
    }

    const expected = expectedSeconds();
    if (current.trackId && loadedTrackId.current !== current.trackId) {
      endedFor.current = null;
      reportedFor.current = null;
      try {
        if (loadedId.current !== current.videoId) cue(target, current.videoId, expected, wantsSound(current));
        else {
          target.seekTo(Math.max(0, expected), true);
          syncedAnchor.current = current.playback?.anchorMs ?? null;
        }
        loadedTrackId.current = current.trackId;
      } catch {
        loadedId.current = null;
      }
      if (current.playback?.status === "playing" && !gated) requestPlay(target);
      reportDuration(target);
      return;
    }

    if (loadedId.current !== current.videoId) {
      endedFor.current = null;
      reportedFor.current = null;
      try {
        cue(target, current.videoId, expected, wantsSound(current));
      } catch {
        loadedId.current = null;
        return;
      }
      if (current.playback?.status === "playing" && !gated) requestPlay(target);
      return;
    }

    const state = safeState(target);
    const anchor = current.playback?.anchorMs ?? null;
    const drift = Math.abs(safeTime(target) - expected);
    const restarted = expected < 0.5;
    const roomPlaying = current.playback?.status === "playing";
    if (
      anchor !== null &&
      syncedAnchor.current !== anchor &&
      state !== BUFFERING &&
      state !== -1 &&
      (restarted ? drift > 0.35 : drift > 2)
    ) {
      syncedAnchor.current = anchor;
      if (restarted) endedFor.current = null;
      target.seekTo(Math.max(0, expected), true);
    } else if (syncedAnchor.current !== anchor && state !== BUFFERING && state !== -1) {
      syncedAnchor.current = anchor;
    } else if (
      gated &&
      roomPlaying &&
      state !== BUFFERING &&
      state !== -1 &&
      drift > DRIFT_SECONDS &&
      cooledDown(lastDriftSeek, DRIFT_COOLDOWN_MS)
    ) {
      target.seekTo(Math.max(0, expected), true);
    } else if (
      state === PLAYING &&
      roomPlaying &&
      drift > DRIFT_SECONDS &&
      cooledDown(lastDriftSeek, DRIFT_COOLDOWN_MS)
    ) {
      // Playing, but off the room's clock (a stall on this device, a late start): catch up.
      // Commands re-sync above; this covers the long stretches between them. The cooldown keeps a
      // slow seek from being "corrected" again before the player has caught up with it.
      target.seekTo(Math.max(0, expected), true);
    }

    const roomPlayingFinal = current.playback?.status === "playing";
    if (gated && (state === PLAYING || state === BUFFERING)) {
      clearBlockCheck();
      try {
        target.pauseVideo();
      } catch {
        /* player went away */
      }
    } else if (roomPlayingFinal && !gated && state !== PLAYING && state !== BUFFERING) {
      requestPlay(target);
    } else if (!roomPlayingFinal && state === PLAYING) {
      clearBlockCheck();
      target.pauseVideo();
    }
    notifyAudibleIfNeeded(target);
    reportDuration(target);
  };

  const reportDuration = (target: YouTubePlayer) => {
    const current = latest.current;
    if (!current.trackId || reportedFor.current === current.trackId) return;
    let duration = 0;
    try {
      duration = target.getDuration?.() ?? 0;
    } catch {
      return;
    }
    if (duration > 0) {
      reportedFor.current = current.trackId;
      current.onDuration?.(current.trackId, duration);
    }
  };

  const nextHandlers: Handlers = {
    onReady: (next) => {
      player.current = next;
      ready.current = true;
      sync();
    },
    onState: (state) => {
      const current = latest.current;
      const target = live();
      if (target) {
        if (!soundHeld.current) clearBlockCheck();
        applyVolume(target);
        notifyAudibleIfNeeded(target);
        if (state === PLAYING) reportDuration(target);
      }
      if (state === ENDED && current.trackId && endedFor.current !== current.trackId) {
        endedFor.current = current.trackId;
        Promise.resolve(current.onEnded?.(current.trackId)).catch(() => {
          endedFor.current = null;
        });
      }
    },
    onError: () => {
      /* a rejected video stays cued once, so it is not started again underneath itself */
    },
    onGone: (gone) => {
      if (player.current !== gone) return;
      clearBlockCheck();
      detach();
    },
  };

  const imperative = useRef<VinylHandle>({
    play() {
      gestured.current = true;
      soundHeld.current = false;
      clearBlockCheck();
      const target = live();
      if (!target) return;
      stealUserActivationForPlayer(target);
      applyVolume(target);
      try {
        target.playVideo();
      } catch {
        /* player went away */
      }
      notifyAudibleIfNeeded(target);
    },
    release() {
      gestured.current = true;
      soundHeld.current = false;
      clearBlockCheck();
      const target = live();
      if (!target) return;
      stealUserActivationForPlayer(target);
      applyVolume(target);
      try {
        if (latest.current.playback?.status === "playing") target.playVideo();
      } catch {
        /* player went away */
      }
      notifyAudibleIfNeeded(target);
    },
    load(videoId: string) {
      const target = live();
      if (!target || !videoId) return;
      soundHeld.current = false;
      clearBlockCheck();
      applyVolume(target);
      holdStart.current = true;
      endedFor.current = null;
      loadedTrackId.current = null;
      try {
        cue(target, videoId, 0, true);
      } catch {
        loadedId.current = null;
      }
    },
  });
  useImperativeHandle(playerRef, () => imperative.current, []);

  // Refresh the "latest props" refs after each render, before any effect reads them.
  useLayoutEffect(() => {
    latest.current = nextLatest;
    handlers.current = nextHandlers;
  });

  useEffect(() => {
    return () => {
      if (blockTimer.current !== null) window.clearTimeout(blockTimer.current);
      blockTimer.current = null;
      detach();
    };
  }, []);

  // Effect Event: always calls the latest `sync` without re-subscribing (same as before).
  const syncNow = useEffectEvent(() => sync());

  useEffect(() => {
    if (trackId === latchedTrackId.current) return;
    latchedTrackId.current = trackId ?? null;
    gestured.current = false;
    soundLatched.current = false;
  }, [trackId]);

  useEffect(() => {
    if (!videoId) return;
    syncNow();
    const id = window.setInterval(syncNow, 1500);
    return () => window.clearInterval(id);
  }, [
    videoId,
    interactive,
    trackId,
    unlocked,
    playback?.status,
    playback?.positionMs,
    playback?.anchorMs,
    serverNow,
    muted,
    volume,
  ]);

  const hasTrack = Boolean(videoId);
  const showLabelArt = Boolean(thumbnail) && !hasTrack;

  return (
    <div className={`deck-visual${hasTrack ? " has-track" : ""}`}>
      <div className={`turntable${hasTrack ? " has-track" : ""}`}>
        <div className="turntable-platter" aria-hidden="true">
          <div className="platter-shadow" />
          <div className={`disc ${spinning ? "is-spinning" : ""}`} />
          <div className={`label ${spinning ? "is-spinning" : ""}`}>
            {showLabelArt && thumbnail ? (
              <Thumb src={thumbnail} eager />
            ) : hasTrack ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="label-art label-art-full"
                  src="/mulia-label-full.svg"
                  alt=""
                  aria-hidden="true"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="label-art label-art-mark"
                  src="/mulia-label-mark.svg"
                  alt=""
                  aria-hidden="true"
                />
              </>
            ) : (
              <div className="monogram" aria-hidden="true">
                <span className="monogram-letter">M</span>
              </div>
            )}
          </div>
          <div className="spindle" />
        </div>
      </div>
      <div className="yt-player-shell">
        <div className="yt-player" data-player>
          {hasTrack ? <PlayerMount handlers={handlers} /> : (
            <p className="yt-idle">ยังไม่มีเพลงที่กำลังเล่น</p>
          )}
        </div>
      </div>
      {hasTrack ? <TonearmGold spinning={spinning} /> : null}
      <span className="sr-only">{title}</span>
    </div>
  );
}

function safeState(player: YouTubePlayer) {
  try {
    return player.getPlayerState();
  } catch {
    return -1;
  }
}

function safeTime(player: YouTubePlayer) {
  try {
    return player.getCurrentTime() || 0;
  } catch {
    return 0;
  }
}
