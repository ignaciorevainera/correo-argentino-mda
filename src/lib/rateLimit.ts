type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();
const SWEEP_INTERVAL = 60_000;

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

export type RateLimitResult =
  | { ok: true; remaining: number; resetIn: number }
  | { ok: false; retryAfter: number };

export interface RateLimitProfile {
  limit: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 60_000 },
  apiRead: { limit: 60, windowMs: 60_000 },
  apiWrite: { limit: 20, windowMs: 60_000 },
  upload: { limit: 10, windowMs: 60 * 60_000 },
} as const satisfies Record<string, RateLimitProfile>;

const slidingWindows = new Map<string, number[]>();
let lastSlidingSweep = Date.now();

function sweepSliding(now: number) {
  if (now - lastSlidingSweep < SWEEP_INTERVAL) return;
  lastSlidingSweep = now;
  for (const [k, timestamps] of slidingWindows) {
    if (timestamps.length === 0) {
      slidingWindows.delete(k);
    }
  }
}

export function checkSlidingRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  sweepSliding(now);

  let timestamps = slidingWindows.get(key);
  if (!timestamps) {
    timestamps = [];
    slidingWindows.set(key, timestamps);
  }

  const cutoff = now - windowMs;
  while (timestamps.length > 0 && timestamps[0] <= cutoff) {
    timestamps.shift();
  }

  if (timestamps.length >= maxRequests) {
    return false;
  }

  timestamps.push(now);
  return true;
}

export function resetRateLimit(): void {
  slidingWindows.clear();
}

export function checkRateLimit(
  key: string,
  profile: RateLimitProfile,
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + profile.windowMs });
    return {
      ok: true,
      remaining: profile.limit - 1,
      resetIn: Math.ceil(profile.windowMs / 1000),
    };
  }

  if (bucket.count >= profile.limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count++;
  return {
    ok: true,
    remaining: profile.limit - bucket.count,
    resetIn: Math.ceil((bucket.resetAt - now) / 1000),
  };
}
