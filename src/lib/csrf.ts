import { createHmac, timingSafeEqual } from "crypto";
import { SECRET_KEY } from "./session";

const TOKEN_TTL_MS = 60 * 60 * 1000;

function sign(payload: string): string {
  return createHmac("sha256", SECRET_KEY).update(payload).digest("hex");
}

export function generateCsrfToken(sessionId: string): string {
  const timestamp = Date.now().toString();
  const signature = sign(`${sessionId}.${timestamp}`);
  return `${sessionId}.${timestamp}.${signature}`;
}

export function validateCsrfToken(
  token: string,
  sessionId: string,
  now: number = Date.now(),
): boolean {
  if (typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [tokenSession, timestamp, signature] = parts;
  if (tokenSession !== sessionId) return false;
  const issuedAt = Number(timestamp);
  if (!Number.isInteger(issuedAt) || issuedAt <= 0) return false;
  if (now - issuedAt > TOKEN_TTL_MS || now < issuedAt - 60_000) return false;
  const expected = sign(`${tokenSession}.${timestamp}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function validateRequestCsrf(
  request: Request,
  locals: { sessionId: string | null },
): Promise<boolean> {
  const sessionId = locals?.sessionId;
  if (!sessionId) return false;

  let headerToken: string | null = null;
  try {
    headerToken = request.headers.get("X-CSRF-Token");
  } catch {
    // request without headers (test doubles)
  }
  if (headerToken) {
    return validateCsrfToken(headerToken, sessionId);
  }

  try {
    const source =
      typeof request.clone === "function" ? request.clone() : request;
    const body = await source.json();
    const bodyToken = body?.csrf_token;
    if (typeof bodyToken === "string") {
      return validateCsrfToken(bodyToken, sessionId);
    }
  } catch {
    // not JSON or body already consumed
  }
  return false;
}
