"use client";

import { Thumb } from "@/components/thumb";
import { createPortal } from "react-dom";
import { memo, useEffect, useImperativeHandle, useEffectEvent, useLayoutEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type { YouTubePlayer } from "@/types/youtube";
import { useArrivalTime } from "@/lib/arrival";
import { useHydrated } from "@/lib/client-store";
import { projectPosition } from "@/lib/time";
import type { Playback } from "@/lib/types";

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
        width: "240",
        height: "135",
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
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
  return createPortal(<div ref={hostRef} className="yt-park" />, document.body);
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
  const blockTimer = useRef<number | null>(null);
  const syncedAnchor = useRef<number | null>(null);
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

  const applyVolume = (target: YouTubePlayer) => {
    const { muted: isMuted, volume: level } = latest.current;
    try {
      if (soundHeld.current || isMuted) {
        target.mute();
        return;
      }
      target.unMute();
      target.setVolume(Math.max(0, Math.min(100, level)));
    } catch {
      /* player went away; the next ready player picks the volume up */
    }
  };

  const clearBlockCheck = () => {
    if (blockTimer.current === null) return;
    window.clearTimeout(blockTimer.current);
    blockTimer.current = null;
  };

  const requestPlay = (target: YouTubePlayer) => {
    applyVolume(target);
    try {
      target.playVideo();
    } catch {
      return;
    }
    if (soundHeld.current || latest.current.muted || blockTimer.current !== null) return;
    blockTimer.current = window.setTimeout(() => {
      blockTimer.current = null;
      const playerNow = live();
      const current = latest.current;
      if (!playerNow || !current.unlocked || current.playback?.status !== "playing") return;
      if (current.muted || soundHeld.current) return;
      const state = safeState(playerNow);
      if (state === PLAYING || state === BUFFERING) return;
      soundHeld.current = true;
      try {
        playerNow.mute();
        playerNow.playVideo();
      } catch {
        /* the next sync tries again */
      }
      current.onBlocked?.();
    }, 2000);
  };

  const cue = (target: YouTubePlayer, nextId: string, startSeconds: number) => {
    target.cueVideoById({ videoId: nextId, startSeconds: Math.max(0, startSeconds) });
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
        if (loadedId.current !== current.videoId) cue(target, current.videoId, expected);
        else {
          target.seekTo(Math.max(0, expected), true);
          syncedAnchor.current = current.playback?.anchorMs ?? null;
        }
        loadedTrackId.current = current.trackId;
      } catch {
        loadedId.current = null;
      }
      if (current.playback?.status === "playing" && current.unlocked) requestPlay(target);
      reportDuration(target);
      return;
    }

    if (loadedId.current !== current.videoId) {
      endedFor.current = null;
      reportedFor.current = null;
      try {
        cue(target, current.videoId, expected);
      } catch {
        loadedId.current = null;
        return;
      }
      if (current.playback?.status === "playing" && current.unlocked) requestPlay(target);
      return;
    }

    const state = safeState(target);
    const anchor = current.playback?.anchorMs ?? null;
    const drift = Math.abs(safeTime(target) - expected);
    const restarted = expected < 0.5;
    if (
      anchor !== null &&
      syncedAnchor.current !== anchor &&
      state !== BUFFERING &&
      state !== -1 &&
      (restarted ? drift > 0.35 : drift > 8)
    ) {
      syncedAnchor.current = anchor;
      if (restarted) endedFor.current = null;
      target.seekTo(Math.max(0, expected), true);
    } else if (syncedAnchor.current !== anchor && state !== BUFFERING && state !== -1) {
      syncedAnchor.current = anchor;
    }

    const shouldPlay = current.playback?.status === "playing" && current.unlocked;
    if (shouldPlay && state !== PLAYING && state !== BUFFERING) requestPlay(target);
    if (!shouldPlay && state === PLAYING) {
      clearBlockCheck();
      target.pauseVideo();
    }
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
      if (state === PLAYING) {
        if (!soundHeld.current) clearBlockCheck();
        current.onAudible?.();
        if (target) applyVolume(target);
      }
      if (state === ENDED && current.trackId && endedFor.current !== current.trackId) {
        endedFor.current = current.trackId;
        Promise.resolve(current.onEnded?.(current.trackId)).catch(() => {
          endedFor.current = null;
        });
      }
      if (state === PLAYING && target) reportDuration(target);
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
      soundHeld.current = false;
      clearBlockCheck();
      const target = live();
      if (!target) return;
      applyVolume(target);
      try {
        target.playVideo();
      } catch {
        /* player went away */
      }
    },
    release() {
      soundHeld.current = false;
      clearBlockCheck();
      const target = live();
      if (!target) return;
      applyVolume(target);
      try {
        if (latest.current.playback?.status === "playing") target.playVideo();
      } catch {
        /* player went away */
      }
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
        cue(target, videoId, 0);
        target.seekTo(0, true);
        target.playVideo();
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
    if (!interactive) return;
    syncNow();
    const id = window.setInterval(syncNow, 1500);
    return () => window.clearInterval(id);
  }, [
    interactive,
    videoId,
    trackId,
    unlocked,
    playback?.status,
    playback?.positionMs,
    playback?.anchorMs,
    serverNow,
    muted,
    volume,
  ]);

  return (
    <div className="turntable">
      <div className="platter-shadow" />
      <div className={`disc ${spinning ? "is-spinning" : ""}`} />
      <div className={`label ${spinning ? "is-spinning" : ""}`}>
        {thumbnail ? (
          <Thumb src={thumbnail} eager />
        ) : (
          <div className="monogram" aria-hidden="true">
            M
          </div>
        )}
      </div>
      {interactive && videoId ? <PlayerMount handlers={handlers} /> : null}
      <div className="spindle" />
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
