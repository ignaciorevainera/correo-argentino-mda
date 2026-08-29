import { describe, it, expect } from "vitest";
import { computeFingerprint, isFingerprintValid } from "../../../src/lib/sessionFingerprint";

describe("computeFingerprint", () => {
  it("returns the same hash for the same user-agent", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0";
    expect(computeFingerprint(ua)).toBe(computeFingerprint(ua));
  });

  it("returns a different hash for different user-agents", () => {
    const a = computeFingerprint("Mozilla/5.0 Chrome/120.0");
    const b = computeFingerprint("Mozilla/5.0 Firefox/121.0");
    expect(a).not.toBe(b);
  });

  it("returns a 64-char hex sha256", () => {
    const hash = computeFingerprint("some-agent");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hashes empty string for null/undefined user-agent (documented behavior)", () => {
    const empty = computeFingerprint("");
    expect(computeFingerprint(null)).toBe(empty);
    expect(computeFingerprint(undefined)).toBe(empty);
  });
});

describe("isFingerprintValid", () => {
  it("returns true for null stored fingerprint (legacy sessions)", () => {
    expect(isFingerprintValid(null, "anything")).toBe(true);
  });

  it("returns true when stored matches current", () => {
    const fp = computeFingerprint("UA/1.0");
    expect(isFingerprintValid(fp, fp)).toBe(true);
  });

  it("returns false when stored differs from current", () => {
    const stored = computeFingerprint("UA/1.0");
    const current = computeFingerprint("UA/2.0");
    expect(isFingerprintValid(stored, current)).toBe(false);
  });
});
