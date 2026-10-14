import type { LiveNow, RoomSnapshot } from "@/lib/types";

export function liveFromSnapshot(snapshot: RoomSnapshot): LiveNow {
  return {
    serverNow: snapshot.serverNow,
    roomCode: snapshot.room.code,
    roomName: snapshot.room.name,
    listeners: snapshot.members.length,
    title: snapshot.current?.title ?? null,
    author: snapshot.current?.author ?? null,
    thumbnail: snapshot.current?.thumbnail ?? null,
    youtubeId: snapshot.current?.youtubeId ?? null,
    status: snapshot.playback.status,
    positionMs: snapshot.playback.positionMs,
    anchorMs: snapshot.playback.anchorMs,
    durationSec: snapshot.current?.durationSec ?? null,
  };
}
