
import { createHmac, randomBytes } from "crypto";
import type { AstroCookies } from "astro";

const SECRET = import.meta.env.SESSION_SECRET;
if (!SECRET) {
  if (import.meta.env.PROD) {
    throw new Error("CRITICAL: SESSION_SECRET is not defined in production environment!");
  }
  console.warn("WARNING: SESSION_SECRET is not defined. Using an insecure fallback secret for development.");
}
const SECRET_KEY = SECRET || randomBytes(32).toString("hex");

// Firma el sessionId usando HMAC-SHA256
export function signSessionId(sessionId: string): string {
  const signature = createHmac("sha256", SECRET_KEY).update(sessionId).digest("base64url");
  return `${sessionId}.${signature}`;
}

// Verifica la firma y retorna el sessionId original, o null si fue alterado
export function verifySessionId(signedSessionId: string): string | null {
  const parts = signedSessionId.split(".");
  if (parts.length !== 2) return null;
  const [sessionId, signature] = parts;
  const expectedSignature = createHmac("sha256", SECRET_KEY).update(sessionId).digest("base64url");
  if (signature === expectedSignature) {
    return sessionId;
  }
  return null;
}

// Genera un ID de sesión criptográficamente seguro
export function generateSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export function setSessionCookie(cookies: AstroCookies, signedSessionId: string, expiresAt: Date) {
  cookies.set("session_id", signedSessionId, {
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    expires: expiresAt,
  });
}

export function deleteSessionCookie(cookies: AstroCookies) {
  cookies.delete("session_id", {
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "lax",
  });
}
