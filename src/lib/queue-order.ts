import type { Track } from "@/lib/types";

/** Move `fromId` to the index of `toId`. Returns null when nothing should change. */
export function moveId(ids: string[], fromId: string, toId: string) {
  if (fromId === toId) return null;
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from < 0 || to < 0) return null;
  const order = ids.slice();
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved);
  return order;
}

/** Id of the neighbour one step up (-1) or down (1), if any. */
export function neighborId(ids: string[], id: string, direction: -1 | 1) {
  return ids[ids.indexOf(id) + direction];
}

/** Reorder tracks to match `order`, dropping unknown ids. */
export function orderTracks(queue: Track[], order: string[]) {
  const byId = new Map(queue.map((track) => [track.id, track]));
  return order.map((id) => byId.get(id)).filter((track): track is Track => Boolean(track));
}

/** Optimistic "this track is now current" status update. */
export function markCurrent(queue: Track[], trackId: string) {
  return queue.map((item) => {
    if (item.id === trackId) return { ...item, status: "current" as const };
    if (item.status === "current") return { ...item, status: "played" as const };
    return item;
  });
}
