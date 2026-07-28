import "server-only";

/**
 * Token-bucket rate limiting.
 *
 * SCOPE, STATED HONESTLY: this bucket lives in the memory of one process. On a
 * single server it is a real control. On Vercel or any autoscaled platform each
 * instance keeps its own counters, so the effective limit is roughly
 * `limit × instances` — enough to stop a naive script, not enough to stop a
 * determined distributed attack.
 *
 * Before taking real payments at volume, move the store behind Upstash Redis or
 * Vercel KV. The interface below does not change; only `buckets` does.
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

/** Evict idle buckets so a long-running process does not grow without bound. */
const MAX_BUCKETS = 10_000;
const IDLE_MS = 10 * 60 * 1000;

function sweep(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > IDLE_MS) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the next token is available. Only meaningful when !ok. */
  retryAfter: number;
}

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const refillRate = limit / windowMs; // tokens per ms
  const existing = buckets.get(key);

  if (!existing) {
    buckets.set(key, { tokens: limit - 1, lastRefill: now });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }

  const elapsed = now - existing.lastRefill;
  const refilled = Math.min(limit, existing.tokens + elapsed * refillRate);
  existing.lastRefill = now;

  if (refilled < 1) {
    existing.tokens = refilled;
    const retryAfter = Math.ceil((1 - refilled) / refillRate / 1000);
    return { ok: false, remaining: 0, retryAfter: Math.max(1, retryAfter) };
  }

  existing.tokens = refilled - 1;
  return { ok: true, remaining: Math.floor(existing.tokens), retryAfter: 0 };
}

/**
 * Best-effort client identity.
 *
 * `x-forwarded-for` is client-controllable in general, which is why the LEFTMOST
 * entry cannot be trusted on its own. Behind a proxy that appends (Vercel,
 * Cloudflare, nginx with the standard config), the RIGHTMOST entry is the one
 * the proxy itself observed, so that is what we key on.
 */
export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");

  let ip = "unknown";
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    ip = parts[parts.length - 1] ?? "unknown";
  } else if (realIp) {
    ip = realIp.trim();
  }

  return `${scope}:${ip}`;
}

/** Standard limits, kept in one place so they are easy to audit. */
export const LIMITS = {
  /** Checkout is expensive and hits Stripe. */
  checkout: { limit: 12, windowMs: 60_000 },
  /** Newsletter is a spam magnet. */
  newsletter: { limit: 4, windowMs: 60_000 },
  /** Contact form. */
  contact: { limit: 4, windowMs: 300_000 },
  /**
   * Re-pricing the cart.
   *
   * Generous on purpose: the checkout page re-quotes on every shipping-method
   * change and every promo attempt, so a customer who is simply comparing
   * delivery options can legitimately make a dozen calls in a minute. The
   * endpoint touches no external service, so the cost of a call is a catalog
   * lookup. Throttling this tightly breaks real checkouts to prevent nothing.
   */
  quote: { limit: 60, windowMs: 60_000 },
  /** Promo codes, if you later expose a dedicated validation endpoint. */
  promo: { limit: 10, windowMs: 60_000 },
} as const;
