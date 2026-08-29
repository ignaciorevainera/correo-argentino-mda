import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkSlidingRateLimit,
  resetRateLimit,
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
});
