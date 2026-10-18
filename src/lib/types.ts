export type PlaybackStatus = "idle" | "playing" | "paused";

export type Track = {
  id: string;
  youtubeId: string;
  title: string;
  author: string;
  thumbnail: string | null;
  durationSec: number | null;
  addedBy: string;
  adder: { hue: number; emoji: string };
  status: "queued" | "current" | "played";
};

export type Member = {
  id: string;
  name: string;
  hue: number;
  emoji: string;
};

export type Playback = {
  status: PlaybackStatus;
  positionMs: number;
  anchorMs: number;
  trackId: string | null;
};

export type SpeakerMode = "single" | "all";

export type SpeakerState = {
  mode: SpeakerMode;
  /** Device that plays the sound in "single" mode; null while nobody holds it. */
  mainDeviceId: string | null;
  mainLabel: string | null;
  /** False once the main device stopped sending heartbeats. */
  mainOnline: boolean;
};

export type RoomSnapshot = {
  serverNow: number;
  /** Content hash (ignores serverNow). Send it back as ?v= to skip an unchanged payload. */
  rev?: string;
  /** Server-chosen delay before the next poll; grows with the room so big rooms cost less. */
  pollMs?: number;
  room: {
    id: string;
    code: string;
    name: string;
    openedBy: string | null;
    createdAt: number;
  };
  /** Absent on older servers/mocks: treat as "all". */
  speaker?: SpeakerState;
  members: Member[];
  current: Track | null;
  queue: Track[];
  playback: Playback;
};

export type RoomCard = {
  code: string;
  name: string;
  listeners: number;
  title: string | null;
  author: string | null;
  thumbnail: string | null;
  status: PlaybackStatus;
  createdAt: number;
};

export type Identity = {
  id: string;
  name: string;
  hue: number;
  emoji: string;
};

export type SnapshotUnchanged = { unchanged: true; serverNow: number; rev: string; pollMs: number };
