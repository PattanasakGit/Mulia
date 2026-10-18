export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
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
    throw new ApiError(data?.error || "ทำรายการไม่สำเร็จ", response.status);
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
