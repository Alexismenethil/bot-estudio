import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "session";
export const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

function textToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function hmac(key: string, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    textToBytes(key) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, textToBytes(message) as BufferSource);
}

function bytesToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Double-HMAC timing-safe compare (research.md R6): comparing two HMAC
// digests of the candidate/expected values (rather than the raw values
// themselves) removes the timing signal a naive `===` would otherwise leak,
// without depending on Node's `crypto.timingSafeEqual` (portable across the
// Node.js and Edge runtimes Proxy can run under).
export async function verifyPasscode(candidate: string, expected: string): Promise<boolean> {
  const key = crypto.randomUUID();
  const [candidateDigest, expectedDigest] = await Promise.all([
    hmac(key, candidate),
    hmac(key, expected),
  ]);
  return bytesToHex(candidateDigest) === bytesToHex(expectedDigest);
}

function sessionSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is not set");
  }
  return textToBytes(secret);
}

export async function signSession(payload: Record<string, unknown>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_COOKIE_MAX_AGE_SECONDS}s`)
    .sign(sessionSecretKey());
}

export async function verifySession(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, sessionSecretKey());
    return true;
  } catch {
    return false;
  }
}
