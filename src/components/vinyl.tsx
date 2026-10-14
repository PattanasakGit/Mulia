"use client";

import { memo, useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type { YouTubePlayer } from "@/types/youtube";
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
};

const PlayerMount = memo(function PlayerMount({
  handlers,
}: {
  handlers: MutableRefObject<Handlers>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let player: YouTubePlayer | null = null;
    let cancelled = false;
    const node = document.createElement("div");
    host.appendChild(node);

    loadYouTubeApi().then(() => {
      if (cancelled || !window.YT || !host.isConnected) return;
      host.querySelectorAll("iframe").forEach((frame) => frame.remove());
      player = new window.YT.Player(node, {
        width: "240",
        height: "240",
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
      try {
        player?.destroy();
      } catch {
        /* the iframe is removed next */
      }
      host.querySelectorAll("iframe").forEach((frame) => frame.remove());
      node.remove();
    };
  }, [handlers]);

  return <div ref={hostRef} className="yt-host" />;
});

export type VinylHandle = {
  play: () => void;
  load: (videoId: string) => void;
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
  onDuration?: (trackId: string, seconds: number) => void;
  playerRef?: RefObject<VinylHandle | null>;
};

export function Vinyl({
  spinning,
  thumbnail,
  title,
  videoId = null,
  playback,
  serverNow = Date.now(),
  trackId = null,
  durationSec = null,
  interactive = false,
  unlocked = false,
  muted = false,
  volume = 100,
  onEnded,
  onAudible,
  onDuration,
  playerRef,
}: VinylProps) {
  const player = useRef<YouTubePlayer | null>(null);
  const ready = useRef(false);
  const loadedId = useRef<string | null>(null);
  const loadedTrackId = useRef<string | null>(null);
  const holdStart = useRef(false);
  const syncedAnchor = useRef<number | null>(null);
  const endedFor = useRef<string | null>(null);
  const reportedFor = useRef<string | null>(null);
  const clock = useRef({ serverNow, at: Date.now() });
  const latest = useRef({
    videoId,
    playback,
    trackId,
    durationSec,
    unlocked,
    muted,
    volume,
    onEnded,
    onAudible,
    onDuration,
  });

  if (clock.current.serverNow !== serverNow) {
    clock.current = { serverNow, at: Date.now() };
  }
  latest.current = {
    videoId,
    playback,
    trackId,
    durationSec,
    unlocked,
    muted,
    volume,
    onEnded,
    onAudible,
    onDuration,
  };

  const handlers = useRef<Handlers>({
    onReady: () => undefined,
    onState: () => undefined,
    onError: () => undefined,
  });

  const applyVolume = (target: YouTubePlayer) => {
    const { muted: isMuted, volume: level } = latest.current;
    if (isMuted) {
      target.mute();
      return;
    }
    target.unMute();
    target.setVolume(Math.max(0, Math.min(100, level)));
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
      projectPosition(current, clock.current.serverNow, clock.current.at) / 1000;
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
    const target = player.current;
    if (!target || !ready.current) return;
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
      if (current.playback?.status === "playing" && current.unlocked) target.playVideo();
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
      }
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
    if (shouldPlay && state !== PLAYING && state !== BUFFERING) target.playVideo();
    if (!shouldPlay && state === PLAYING) target.pauseVideo();
    reportDuration(target);
  };

  const reportDuration = (target: YouTubePlayer) => {
    const current = latest.current;
    if (!current.trackId || reportedFor.current === current.trackId) return;
    const duration = target.getDuration?.() ?? 0;
    if (duration > 0) {
      reportedFor.current = current.trackId;
      current.onDuration?.(current.trackId, duration);
    }
  };

  handlers.current = {
    onReady: (next) => {
      player.current = next;
      ready.current = true;
      sync();
    },
    onState: (state) => {
      const current = latest.current;
      if (state === PLAYING) {
        current.onAudible?.();
        if (player.current) applyVolume(player.current);
      }
      if (state === ENDED && current.trackId && endedFor.current !== current.trackId) {
        endedFor.current = current.trackId;
        Promise.resolve(current.onEnded?.(current.trackId)).catch(() => {
          endedFor.current = null;
        });
      }
      if (state === PLAYING && player.current) reportDuration(player.current);
    },
    onError: () => {
      /* a rejected video stays cued once, so it is not started again underneath itself */
    },
  };

  const imperative = useRef<VinylHandle>({
    play() {
      const target = player.current;
      if (!target || !ready.current) return;
      applyVolume(target);
      target.playVideo();
    },
    load(videoId: string) {
      const target = player.current;
      if (!target || !ready.current || !videoId) return;
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
  if (playerRef) playerRef.current = imperative.current;

  useEffect(() => {
    if (!interactive) return;
    sync();
    const id = window.setInterval(sync, 1500);
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
      <div className="label">
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt="" />
        ) : (
          <div className="monogram" aria-hidden="true">
            M
          </div>
        )}
        {interactive && videoId ? <PlayerMount handlers={handlers} /> : null}
      </div>
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
