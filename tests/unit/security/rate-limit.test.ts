import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkRateLimit,
  checkSlidingRateLimit,
  resetRateLimit,
  getSlidingEntryCount,
  RATE_LIMITS,
} from "../../../src/lib/rateLimit";

describe("checkSlidingRateLimit (per-user sliding window)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    resetRateLimit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to maxRequests within window", () => {
    for (let i = 0; i < 10; i++) {
      expect(checkSlidingRateLimit("rate:assign:42", 10, 60_000)).toBe(true);
    }
  });

  it("blocks (maxRequests+1)th request", () => {
    for (let i = 0; i < 10; i++) {
      checkSlidingRateLimit("rate:assign:42", 10, 60_000);
    }
    expect(checkSlidingRateLimit("rate:assign:42", 10, 60_000)).toBe(false);
  });

  it("allows again after window expires", () => {
    for (let i = 0; i < 10; i++) {
      checkSlidingRateLimit("rate:assign:42", 10, 60_000);
    }
    expect(checkSlidingRateLimit("rate:assign:42", 10, 60_000)).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(checkSlidingRateLimit("rate:assign:42", 10, 60_000)).toBe(true);
  });

  it("slides: old requests expire individually", () => {
    for (let i = 0; i < 5; i++) {
      checkSlidingRateLimit("rate:unassign:42", 5, 60_000);
    }
    vi.advanceTimersByTime(30_000);
    for (let i = 0; i < 5; i++) {
      checkSlidingRateLimit("rate:unassign:42", 5, 60_000);
    }
    expect(checkSlidingRateLimit("rate:unassign:42", 5, 60_000)).toBe(false);
    vi.advanceTimersByTime(30_001);
    expect(checkSlidingRateLimit("rate:unassign:42", 5, 60_000)).toBe(true);
  });

  it("keys are isolated between users", () => {
    for (let i = 0; i < 10; i++) {
      checkSlidingRateLimit("rate:hide:1", 10, 60_000);
    }
    expect(checkSlidingRateLimit("rate:hide:1", 10, 60_000)).toBe(false);
    expect(checkSlidingRateLimit("rate:hide:2", 10, 60_000)).toBe(true);
  });

  it("resetRateLimit clears state", () => {
    for (let i = 0; i < 10; i++) {
      checkSlidingRateLimit("rate:show:7", 10, 60_000);
    }
    expect(checkSlidingRateLimit("rate:show:7", 10, 60_000)).toBe(false);
    resetRateLimit();
    expect(checkSlidingRateLimit("rate:show:7", 10, 60_000)).toBe(true);
  });

  it("sweep reclaims abandoned keys after window expires", () => {
    for (let i = 0; i < 10; i++) {
      checkSlidingRateLimit("rate:abandon:1", 10, 60_000);
    }
    expect(getSlidingEntryCount()).toBeGreaterThan(0);
    // force lastSlidingSweep back so the sweep interval has elapsed
    vi.advanceTimersByTime(60_001);
    // trigger sweep via an unrelated key (sweep runs before pruning)
    checkSlidingRateLimit("rate:other:1", 10, 60_000);
    expect(getSlidingEntryCount()).toBe(1);
  });

  it("sweep does not reset live sliding windows (prunes by per-key window)", () => {
    for (let i = 0; i < 10; i++) {
      checkSlidingRateLimit("rate:sweep:1", 10, 60_000);
    }
    // half the window elapsed: all 10 requests still live
    vi.advanceTimersByTime(30_000);
    // trigger sweep via an unrelated key
    checkSlidingRateLimit("rate:sweep:other", 10, 60_000);
    // original key must still remember its earlier requests
    expect(checkSlidingRateLimit("rate:sweep:1", 10, 60_000)).toBe(false);
    // after the window fully elapses, the limit clears
    vi.advanceTimersByTime(30_001);
    expect(checkSlidingRateLimit("rate:sweep:1", 10, 60_000)).toBe(true);
  });

  it("allows request exactly at window boundary (<= cutoff)", () => {
    expect(checkSlidingRateLimit("rate:edge:1", 1, 60_000)).toBe(true);
    expect(checkSlidingRateLimit("rate:edge:1", 1, 60_000)).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(checkSlidingRateLimit("rate:edge:1", 1, 60_000)).toBe(true);
  });
});

describe("checkRateLimit (fixed window, RATE_LIMITS.kbCategoryWrite)", () => {
  const profile = RATE_LIMITS.kbCategoryWrite;
  // El mapa de buckets de ventana fija es estado de modulo y `resetRateLimit`
  // solo limpia las ventanas deslizantes, asi que cada test usa su propia key.
  const key = (identifier: string) =>
    `kb-write:${identifier}:/base-conocimiento/categorias`;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("corta en la escritura 21 del mismo usuario", () => {
    for (let i = 0; i < profile.limit; i += 1) {
      expect(checkRateLimit(key("u:1"), profile).ok).toBe(true);
    }
    const cortado = checkRateLimit(key("u:1"), profile);
    expect(cortado.ok).toBe(false);
    if (cortado.ok) return;
    expect(cortado.retryAfter).toBeGreaterThan(0);
    expect(cortado.retryAfter).toBeLessThanOrEqual(
      Math.ceil(profile.windowMs / 1000),
    );
  });

  it("la ventana vencida reinicia el bucket", () => {
    for (let i = 0; i < profile.limit; i += 1) {
      checkRateLimit(key("u:2"), profile);
    }
    expect(checkRateLimit(key("u:2"), profile).ok).toBe(false);

    vi.advanceTimersByTime(profile.windowMs + 1);

    const despues = checkRateLimit(key("u:2"), profile);
    expect(despues.ok).toBe(true);
    if (!despues.ok) return;
    expect(despues.remaining).toBe(profile.limit - 1);
    expect(despues.resetIn).toBe(Math.ceil(profile.windowMs / 1000));
  });

  it("la key por usuario no comparte bucket con la key ip: anónima", () => {
    for (let i = 0; i < profile.limit; i += 1) {
      checkRateLimit(key("u:3"), profile);
    }
    expect(checkRateLimit(key("u:3"), profile).ok).toBe(false);

    const anon = key("ip:203.0.113.7");
    expect(checkRateLimit(anon, profile).ok).toBe(true);
    for (let i = 1; i < profile.limit; i += 1) {
      expect(checkRateLimit(anon, profile).ok).toBe(true);
    }
    expect(checkRateLimit(anon, profile).ok).toBe(false);

    // El corte de la IP anonima no toca al usuario y viceversa.
    expect(checkRateLimit(key("u:3"), profile).ok).toBe(false);
    expect(checkRateLimit(key("u:4"), profile).ok).toBe(true);
  });
});

describe("checkRateLimit (fixed window, RATE_LIMITS.kbArticleWrite)", () => {
  const profile = RATE_LIMITS.kbArticleWrite;

  it("corta exactamente en el límite y aísla por usuario", () => {
    const key = (id: string) => `kb-article-write:${id}:/base-conocimiento/create`;
    for (let i = 0; i < profile.limit; i += 1) {
      expect(checkRateLimit(key("u:1"), profile).ok).toBe(true);
    }
    expect(checkRateLimit(key("u:1"), profile).ok).toBe(false);
    expect(checkRateLimit(key("u:2"), profile).ok).toBe(true);
  });
});
