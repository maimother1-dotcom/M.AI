import "server-only";
import crypto from "node:crypto";

/**
 * A short-lived pass to view one order's invoice.
 *
 * The customer has already proved who they are by supplying the order number
 * and the email it was placed with. This is what carries that proof to the
 * invoice page, so the page does not need the email in its URL — a URL lands in
 * browser history, in the Referer header of anything the page loads, and in the
 * clipboard when somebody shares "look at my order". An opaque token that
 * expires is a much smaller thing to leak.
 *
 * Signed with a key derived from ORDER_SIGNING_SECRET under its own HKDF label,
 * so this token cannot be used as an order token and vice versa even though both
 * come from the same secret.
 */

const TTL_MS = 30 * 60 * 1000;

const HKDF_SALT = Buffer.from("lindienne.order-access.v1", "utf8");
const HKDF_INFO = Buffer.from("customer order access token", "utf8");

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.ORDER_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ORDER_SIGNING_SECRET must be set to issue order access tokens.");
  }
  cachedKey = Buffer.from(
    crypto.hkdfSync("sha256", Buffer.from(secret, "utf8"), HKDF_SALT, HKDF_INFO, 32),
  );
  return cachedKey;
}

export function signOrderAccess(orderNumber: string): string {
  const payload = Buffer.from(
    JSON.stringify({ o: orderNumber, e: Date.now() + TTL_MS }),
    "utf8",
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", getKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

/** Returns the order number, or null on any tampering or expiry. */
export function verifyOrderAccess(token: string | null | undefined): string | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts as [string, string];

  let expected: string;
  try {
    expected = crypto.createHmac("sha256", getKey()).update(payload).digest("base64url");
  } catch {
    return null;
  }

  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  // Timing-safe, because a plain comparison on an HMAC leaks how many leading
  // bytes were right, which is enough to forge one byte at a time.
  if (given.length !== want.length) return null;
  if (!crypto.timingSafeEqual(given, want)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      o?: string;
      e?: number;
    };
    if (!decoded.o || typeof decoded.e !== "number") return null;
    if (Date.now() > decoded.e) return null;
    return decoded.o;
  } catch {
    return null;
  }
}
