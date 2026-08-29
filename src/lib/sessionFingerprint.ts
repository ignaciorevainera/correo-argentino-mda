import { createHash } from "crypto";

// Design decision (Task 10): fingerprint binds the session to the User-Agent
// only. IP is deliberately excluded from the hash because mobile networks,
// corporate NAT rotation, and VPNs change IPs mid-session and would cause
// mass lockouts. UA-only still catches cookie exfiltration to another
// browser/device. Legacy sessions with a NULL fingerprint pass through.
export function computeFingerprint(userAgent: string | null | undefined): string {
  return createHash("sha256").update(userAgent ?? "").digest("hex");
}

export function isFingerprintValid(
  stored: string | null,
  current: string,
): boolean {
  if (stored === null) return true;
  return stored === current;
}
