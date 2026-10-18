"use client";

import { createPortal } from "react-dom";
import { memo, useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
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
  const [parked, setParked] = useState(false);

  useEffect(() => {
    setParked(true);
  }, []);

  useEffect(() => {
    if (!parked) return;
    const host = hostRef.current;
    if (!host) return;
    let player: YouTubePlayer | null = null;
    let cancelled = false;
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
      if (!doomed) {
        node.remove();
        return;
      }
      window.setTimeout(() => {
        try {
          doomed.destroy();
        } catch {
          node.remove();
        }
      }, 0);
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
  serverNow = Date.now(),
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
    onBlocked,
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
    onBlocked,
    onDuration,
  };

  const handlers = useRef<Handlers>({
    onReady: () => undefined,
    onState: () => undefined,
    onError: () => undefined,
  });

  const applyVolume = (target: YouTubePlayer) => {
    const { muted: isMuted, volume: level } = latest.current;
    if (soundHeld.current || isMuted) {
      target.mute();
      return;
    }
    target.unMute();
    target.setVolume(Math.max(0, Math.min(100, level)));
  };

  const clearBlockCheck = () => {
    if (blockTimer.current === null) return;
    window.clearTimeout(blockTimer.current);
    blockTimer.current = null;
  };

  const armBlockCheck = (retried: boolean) => {
    blockTimer.current = window.setTimeout(() => {
      blockTimer.current = null;
      const playerNow = player.current;
      const current = latest.current;
      if (!playerNow || !current.unlocked || current.playback?.status !== "playing") return;
      if (current.muted || soundHeld.current) return;
      const state = safeState(playerNow);
      if (state === PLAYING || state === BUFFERING) return;
      if (!retried) {
        // a slow-loading video looks the same as a blocked one, so ask once more before muting
        try {
          playerNow.playVideo();
        } catch {
          /* the next sync tries again */
        }
        armBlockCheck(true);
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

  const wantsSound = (current: typeof latest.current) =>
    current.playback?.status === "playing" && current.unlocked;

  const sync = () => {
    try {
      syncPlayer();
    } catch {
      /* the iframe is mid-reload; the next tick syncs again */
    }
  };

  const syncPlayer = () => {
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
        if (loadedId.current !== current.videoId) cue(target, current.videoId, expected, wantsSound(current));
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
        cue(target, current.videoId, expected, wantsSound(current));
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
      (restarted ? drift > 0.35 : drift > 2)
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
        if (!soundHeld.current) clearBlockCheck();
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
      soundHeld.current = false;
      clearBlockCheck();
      const target = player.current;
      if (!target || !ready.current) return;
      applyVolume(target);
      target.playVideo();
    },
    release() {
      soundHeld.current = false;
      clearBlockCheck();
      const target = player.current;
      if (!target || !ready.current) return;
      applyVolume(target);
      if (latest.current.playback?.status === "playing") target.playVideo();
    },
    load(videoId: string) {
      const target = player.current;
      if (!target || !ready.current || !videoId) return;
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
  if (playerRef) playerRef.current = imperative.current;

  useEffect(() => {
    return () => {
      if (blockTimer.current === null) return;
      window.clearTimeout(blockTimer.current);
      blockTimer.current = null;
    };
  }, []);

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
      <div className={`label ${spinning ? "is-spinning" : ""}`}>
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt="" />
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
