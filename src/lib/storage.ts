/**
 * localStorage with an in-memory fallback. When storage is blocked (disabled cookies/site data,
 * some private modes) touching `window.localStorage` throws; we then keep values for this page
 * session only, so the flow still works instead of crashing.
 */
const memory = new Map<string, string>();

function store(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getItem(key: string): string | null {
  try {
    const s = store();
    if (s) return s.getItem(key);
  } catch {
    /* blocked: fall through */
  }
  return memory.has(key) ? (memory.get(key) as string) : null;
}

export function setItem(key: string, value: string): void {
  memory.set(key, value);
  try {
    store()?.setItem(key, value);
  } catch {
    /* blocked or quota: memory copy is used */
  }
}

/** Test hook. */
export function __resetMemory() {
  memory.clear();
}
