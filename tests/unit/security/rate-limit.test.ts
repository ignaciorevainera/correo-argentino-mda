import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkSlidingRateLimit,
  resetRateLimit,
  getSlidingEntryCount,
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

  it("allows request exactly at window boundary (<= cutoff)", () => {
    expect(checkSlidingRateLimit("rate:edge:1", 1, 60_000)).toBe(true);
    expect(checkSlidingRateLimit("rate:edge:1", 1, 60_000)).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(checkSlidingRateLimit("rate:edge:1", 1, 60_000)).toBe(true);
  });
});
