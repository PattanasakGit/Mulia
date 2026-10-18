/**
 * Short-lived, single-flight cache. Concurrent callers for one key share one load, and a fresh
 * value is reused for `ttlMs`. Per server instance: it turns "every listener polls the database"
 * into "every instance reads each room about once per TTL", whatever the listener count.
 */
type Entry = { at: number; value?: unknown; pending?: Promise<unknown> };

const store = new Map<string, Entry>();
const MAX_ENTRIES = 500;

function prune(now: number) {
  if (store.size <= MAX_ENTRIES) return;
  for (const [key, entry] of store) {
    if (!entry.pending && now - entry.at > 60_000) store.delete(key);
  }
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function memo<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit) {
    if (hit.pending) return hit.pending as Promise<T>;
    if (now - hit.at < ttlMs) return Promise.resolve(hit.value as T);
  }
  const pending: Promise<T> = load().then(
    (value) => {
      // forgotten (or replaced) while loading: hand the value to the waiters, but don't keep it
      if (store.get(key)?.pending === pending) store.set(key, { at: Date.now(), value });
      return value;
    },
    (error) => {
      if (store.get(key)?.pending === pending) store.delete(key);
      throw error;
    },
  );
  store.set(key, { at: now, pending });
  prune(now);
  return pending;
}

export function forget(key: string) {
  store.delete(key);
}

export function clearMemo() {
  store.clear();
}
