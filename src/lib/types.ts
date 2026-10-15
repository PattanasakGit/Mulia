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

export type RoomSnapshot = {
  serverNow: number;
  room: {
    id: string;
    code: string;
    name: string;
    openedBy: string | null;
    createdAt: number;
  };
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

export type LiveNow = {
  serverNow: number;
  roomCode: string | null;
  roomName: string | null;
  listeners: number;
  title: string | null;
  author: string | null;
  thumbnail: string | null;
  youtubeId: string | null;
  status: PlaybackStatus;
  positionMs: number;
  anchorMs: number;
  durationSec: number | null;
};

export type Identity = {
  id: string;
  name: string;
  hue: number;
  emoji: string;
};
