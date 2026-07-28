import "server-only";
import crypto from "node:crypto";
import type { PricedCart } from "@/lib/types";

/**
 * Order records without a database.
 *
 * Stripe is the system of record when Stripe is configured: the confirmation
 * page re-fetches the PaymentIntent from Stripe rather than believing anything
 * in the URL. In demo mode there is no Stripe to ask, so the order summary is
 * carried in an HMAC-signed token instead.
 *
 * Either way the confirmation page never renders numbers that came from an
 * unverified query parameter. Editing `?total=1` in the address bar produces an
 * error, not a receipt.
 *
 * This module is the single seam where a real database plugs in. Replace
 * `signOrder`/`verifyOrder` with inserts and selects and nothing else changes.
 */

/**
 * Resolved lazily, on first use, rather than at module load.
 *
 * `next build` imports every route module to collect page data, with NODE_ENV
 * set to production. Evaluating this at module scope would abort the build on
 * any machine without the secret — including CI, which has no business holding
 * production signing keys. Deferring it means the guard fires on the first
 * request instead, which is where it belongs.
 */
let cachedSecret: string | null = null;

/**
 * Whether order signing is usable.
 *
 * Routes call this BEFORE doing any work, so a deployment that is missing its
 * secret returns a clear 503 explaining exactly what to set — rather than
 * throwing mid-request and showing the customer a generic 500 with no clue what
 * went wrong. The guard itself does not soften: without a secret, no order is
 * ever signed.
 */
export function isOrderSigningConfigured(): boolean {
  if (cachedSecret) return true;
  const fromEnv = process.env.ORDER_SIGNING_SECRET;
  if (fromEnv && fromEnv.length >= 32) return true;
  // Outside production a per-process secret is generated on demand.
  return process.env.NODE_ENV !== "production";
}

function getSecret(): string {
  if (cachedSecret) return cachedSecret;

  const fromEnv = process.env.ORDER_SIGNING_SECRET;
  if (fromEnv && fromEnv.length >= 32) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }

  if (process.env.NODE_ENV === "production") {
    // Failing loudly beats silently signing every order with a value an
    // attacker could read off GitHub.
    throw new Error(
      "ORDER_SIGNING_SECRET must be set to at least 32 characters in production. " +
        "Generate one with: openssl rand -base64 48",
    );
  }

  // Development only. Regenerated per process, so tokens do not survive a restart.
  cachedSecret = crypto.randomBytes(48).toString("base64");
  return cachedSecret;
}

export interface OrderRecord {
  orderNumber: string;
  email: string;
  name: string;
  createdAt: string;
  cart: PricedCart;
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  shippingMethod: string;
  /** "demo" when no Stripe key was configured, "stripe" otherwise. */
  paymentMode: "demo" | "stripe";
  paymentIntentId?: string;
}

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

/** Sign an order into a self-contained, tamper-evident token. */
export function signOrder(order: OrderRecord): string {
  const payload = base64url(Buffer.from(JSON.stringify(order), "utf8"));
  const signature = base64url(
    crypto.createHmac("sha256", getSecret()).update(payload).digest(),
  );
  return `${payload}.${signature}`;
}

/**
 * Verify and decode. Returns null on any tampering.
 *
 * The comparison is timing-safe: a plain `===` on an HMAC leaks how many leading
 * bytes were correct, which is enough to forge one byte at a time given enough
 * requests.
 */
export function verifyOrder(token: string | null | undefined): OrderRecord | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts as [string, string];

  const expected = base64url(
    crypto.createHmac("sha256", getSecret()).update(payload).digest(),
  );

  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length) return null;
  if (!crypto.timingSafeEqual(given, want)) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as OrderRecord;
    if (!decoded.orderNumber || !decoded.cart) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Human-facing order number. Random rather than sequential, because a sequential
 * order number tells a competitor exactly how many orders you took last month —
 * and lets anyone enumerate other people's orders by counting.
 */
export function generateOrderNumber(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1
  const bytes = crypto.randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return `LI-${out.slice(0, 4)}-${out.slice(4)}`;
}

/** Estimated delivery window, as a display string. */
export function deliveryEstimate(method: string): string {
  const days = method === "express" ? [2, 3] : [5, 8];
  const format = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };
  return `${format(days[0]!)} – ${format(days[1]!)}`;
}
