export type RetryBudget = { count: number; at: number };

/** If the last auto-retry was long enough ago the page worked in between, so the budget starts over. */
export const RETRY_RESET_MS = 30_000;

export function spendRetry(prev: RetryBudget, now: number, max: number): { allowed: boolean; next: RetryBudget } {
  const fresh = now - prev.at > RETRY_RESET_MS ? { count: 0, at: prev.at } : prev;
  if (fresh.count >= max) return { allowed: false, next: fresh };
  return { allowed: true, next: { count: fresh.count + 1, at: now } };
}
