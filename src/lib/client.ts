export class ApiError extends Error {
  status: number;
  /** Set on 429: how long the server wants us to wait. */
  retryAfterMs?: number;

  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

// Lets the server rate-limit one browser separately from everyone sharing its IP address.
function memberHeader(): Record<string, string> {
  try {
    const id = (JSON.parse(window.localStorage.getItem("sound-index-identity") ?? "null") as { id?: string } | null)?.id;
    return id ? { "x-member-id": id } : {};
  } catch {
    return {};
  }
}

const TIMEOUT_MS = 10_000;

async function attempt<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...memberHeader(),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ApiError("เชื่อมต่อไม่ได้ ลองอีกครั้ง", 0);
  }
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    const waitMs = response.status === 429
      ? Math.max(Number((data as { retryAfterMs?: number } | null)?.retryAfterMs) || 0, Number(response.headers.get("retry-after") ?? 0) * 1000)
      : undefined;
    throw new ApiError(data?.error || "ทำรายการไม่สำเร็จ", response.status, waitMs);
  }
  return data as T;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const idempotent = !init?.method || init.method === "GET";
  try {
    return await attempt<T>(path, init);
  } catch (error) {
    // A read that fails on the network or with a 5xx is retried once; the next try usually lands.
    if (!idempotent || !(error instanceof ApiError) || (error.status !== 0 && error.status < 500)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 600));
    return attempt<T>(path, init);
  }
}
