/**
 * Request limits at the HTTP edge. Token buckets, kept per server instance: cheap, no database
 * round trip, and sized so a person (or a whole office behind one IP) never notices them while a
 * script looping on one endpoint is cut off. A rotating-id script still hits the per-IP bucket.
 * For a limit shared across instances use the platform firewall; this is the in-process layer.
 */
type Bucket = { tokens: number; at: number };
export type Policy = { capacity: number; perSecond: number };

class Limiter {
  private buckets = new Map<string, Bucket>();
  constructor(private policy: Policy) {}

  take(key: string, now: number) {
    const { capacity, perSecond } = this.policy;
    const bucket = this.buckets.get(key) ?? { tokens: capacity, at: now };
    bucket.tokens = Math.min(capacity, bucket.tokens + ((now - bucket.at) / 1000) * perSecond);
    bucket.at = now;
    this.buckets.delete(key);
    this.buckets.set(key, bucket); // keep insertion order = recency, so eviction drops the idlest
    if (this.buckets.size > 20_000) this.evict();
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return 0;
    }
    return Math.ceil(((1 - bucket.tokens) / perSecond) * 1000);
  }

  private evict() {
    // insertion order is recency: drop the idlest half
    for (const key of this.buckets.keys()) {
      if (this.buckets.size <= 10_000) break;
      this.buckets.delete(key);
    }
  }
}

export type Kind = "read" | "list" | "beat" | "join" | "playback" | "add" | "queue" | "create" | "close" | "qr";

// ip: shared by everyone behind one address (generous); member: one browser (tighter).
const POLICIES: Record<Kind, { ip: Policy; member?: Policy }> = {
  read: { ip: { capacity: 300, perSecond: 100 }, member: { capacity: 20, perSecond: 4 } },
  list: { ip: { capacity: 60, perSecond: 20 }, member: { capacity: 10, perSecond: 2 } },
  beat: { ip: { capacity: 120, perSecond: 20 }, member: { capacity: 4, perSecond: 0.2 } },
  join: { ip: { capacity: 60, perSecond: 5 }, member: { capacity: 6, perSecond: 0.2 } },
  playback: { ip: { capacity: 120, perSecond: 20 }, member: { capacity: 20, perSecond: 3 } },
  add: { ip: { capacity: 40, perSecond: 2 }, member: { capacity: 8, perSecond: 0.25 } },
  queue: { ip: { capacity: 120, perSecond: 20 }, member: { capacity: 20, perSecond: 3 } },
  create: { ip: { capacity: 6, perSecond: 1 / 30 }, member: { capacity: 4, perSecond: 1 / 30 } },
  close: { ip: { capacity: 6, perSecond: 0.1 } },
  qr: { ip: { capacity: 30, perSecond: 2 } },
};

const limiters = new Map<string, Limiter>();
function limiterFor(kind: Kind, scope: "ip" | "member", policy: Policy) {
  const id = `${kind}:${scope}`;
  let limiter = limiters.get(id);
  if (!limiter) {
    limiter = new Limiter(policy);
    limiters.set(id, limiter);
  }
  return limiter;
}

export function resetRateLimits() {
  limiters.clear();
}

const MEMBER_ID = /^[0-9a-f-]{36}$/i;

export function clientIp(headers: Headers) {
  const direct = headers.get("x-vercel-forwarded-for") ?? headers.get("x-real-ip");
  const ip = direct ?? headers.get("x-forwarded-for")?.split(",")[0];
  return (ip ?? "local").trim().slice(0, 64) || "local";
}

/** Milliseconds to wait before retrying, or 0 when the request may go ahead. */
export function checkLimit(request: Request, kind: Kind, now = Date.now()) {
  if (process.env.RATE_LIMIT === "off") return 0;
  const policy = POLICIES[kind];
  const ip = clientIp(request.headers);
  let wait = limiterFor(kind, "ip", policy.ip).take(ip, now);
  const member = request.headers.get("x-member-id");
  if (policy.member && member && MEMBER_ID.test(member)) {
    wait = Math.max(wait, limiterFor(kind, "member", policy.member).take(`${ip}|${member}`, now));
  }
  return wait;
}
