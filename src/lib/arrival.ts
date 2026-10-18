import { useSyncExternalStore } from "react";

/**
 * Client-side registry of "when did this serverNow first reach this tab".
 * Previously each component kept this in a ref written during render
 * (`if (clock.current.serverNow !== serverNow) clock.current = {..., at: Date.now()}`).
 * Same semantics, exposed as an external store so render stays pure.
 */
const seen = new Map<number, number>();
const LIMIT = 64;

function arrivalOf(serverNow: number) {
  let at = seen.get(serverNow);
  if (at === undefined) {
    at = Date.now();
    seen.set(serverNow, at);
    if (seen.size > LIMIT) seen.delete(seen.keys().next().value as number);
  }
  return at;
}

const subscribe = () => () => undefined;

/**
 * Arrival time for a server snapshot. A missing serverNow (non-interactive callers) returns 0
 * and is never cached, so "no serverNow" can't share a cache entry with a real value.
 */
export function useArrivalTime(serverNow: number | null | undefined) {
  return useSyncExternalStore(
    subscribe,
    () => (typeof serverNow === "number" ? arrivalOf(serverNow) : 0),
    () => serverNow ?? 0,
  );
}

export { arrivalOf };
