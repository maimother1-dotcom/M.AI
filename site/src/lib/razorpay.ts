import "server-only";
import crypto from "node:crypto";

/**
 * Razorpay — the payment provider for an Indian storefront.
 *
 * Why this rather than Stripe: Stripe India is invite-only and does not support
 * UPI. For a store selling to Indian customers in rupees, that is disqualifying
 * — UPI is how most people actually pay. Razorpay is RBI-licensed, settles in
 * INR, and covers UPI, cards, netbanking and wallets from one integration.
 *
 * No SDK. Razorpay's REST API is three endpoints and its signature scheme is
 * HMAC-SHA256, so a dependency here would add supply-chain risk to the payment
 * path in exchange for very little.
 *
 * THE SECURITY MODEL, which is the whole reason this file is careful:
 *
 *   1. We create the Order server-side, for an amount OUR pricing authority
 *      computed. Razorpay never sees a number the browser chose.
 *   2. The browser completes payment against Razorpay directly. Card details
 *      never touch this server.
 *   3. Razorpay hands the browser back a signature. We verify it server-side
 *      before believing a single thing about the payment. An unverified
 *      "payment succeeded" from a browser is just a claim.
 *   4. The webhook is verified separately, against the raw body.
 */

const API_BASE = "https://api.razorpay.com/v1";

export function getRazorpayConfig(): { keyId: string; keySecret: string } | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  // Razorpay key ids are `rzp_test_...` or `rzp_live_...`.
  if (!keyId.startsWith("rzp_")) return null;
  return { keyId, keySecret };
}

export function isRazorpayEnabled(): boolean {
  return getRazorpayConfig() !== null;
}

/** Safe to expose: the key id identifies the account, it cannot move money. */
export function getRazorpayKeyId(): string | null {
  return getRazorpayConfig()?.keyId ?? null;
}

function authHeader(keyId: string, keySecret: string): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string;
}

/**
 * Create an Order.
 *
 * `amountMinor` must come from `priceCart()`. Passing anything a client sent
 * would defeat the entire pricing authority.
 */
export async function createRazorpayOrder(input: {
  amountMinor: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  const config = getRazorpayConfig();
  if (!config) throw new Error("Razorpay is not configured");

  const response = await fetch(`${API_BASE}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(config.keyId, config.keySecret),
    },
    body: JSON.stringify({
      amount: input.amountMinor,
      currency: input.currency,
      // Razorpay caps receipt at 40 characters and rejects longer ones.
      receipt: input.receipt.slice(0, 40),
      notes: input.notes ?? {},
      payment_capture: 1, // capture immediately; no separate auth/capture step
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const detail = await response.text();
    // Logged server-side only — Razorpay errors can carry account information.
    console.error(`[razorpay] order creation failed (${response.status}):`, detail);
    throw new Error("Razorpay order creation failed");
  }

  return (await response.json()) as RazorpayOrder;
}

/**
 * Verify the signature the browser returns after checkout.
 *
 * Razorpay signs `order_id|payment_id` with the key secret. Since only Razorpay
 * and this server know the secret, a valid signature proves Razorpay actually
 * processed this payment for this order — a browser cannot forge one.
 */
export function verifyPaymentSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const config = getRazorpayConfig();
  if (!config) return false;

  const expected = crypto
    .createHmac("sha256", config.keySecret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");

  const given = Buffer.from(input.signature);
  const want = Buffer.from(expected);
  // Timing-safe: a plain === on an HMAC leaks how many leading bytes matched.
  if (given.length !== want.length) return false;
  return crypto.timingSafeEqual(given, want);
}

/**
 * Verify a webhook, against the RAW body.
 *
 * Parsing the body first and re-serialising it changes the bytes and the
 * signature will never match — the raw text is what was signed.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length) return false;
  return crypto.timingSafeEqual(given, want);
}

/**
 * Fetch a payment from Razorpay.
 *
 * Used by the confirmation page so a receipt reflects what Razorpay says, not
 * what the browser claims. Signature verification proves the payment happened;
 * this proves it is captured and for the right amount.
 */
export async function fetchRazorpayPayment(paymentId: string): Promise<{
  id: string;
  status: string;
  amount: number;
  currency: string;
  order_id: string;
  method?: string;
} | null> {
  const config = getRazorpayConfig();
  if (!config) return null;

  try {
    const response = await fetch(`${API_BASE}/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: authHeader(config.keyId, config.keySecret) },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[razorpay] payment fetch failed:", error);
    return null;
  }
}

/* -------------------------------------------------------------------------
   Refunds
   ------------------------------------------------------------------------- */

export interface RazorpayRefund {
  id: string;
  amount: number;
  status: string;
  payment_id: string;
}

/**
 * Refund a captured payment, in whole or in part.
 *
 * `amountMinor` must be computed server-side from what the customer was actually
 * charged for the pieces coming back. Nothing a browser or a form supplied has
 * any business reaching this function — it moves real money out.
 *
 * `receipt` is our own return number, and Razorpay treats it as an idempotency
 * key: a second refund request carrying a receipt it has already seen is
 * rejected rather than performed twice. That is the backstop behind our own
 * claim-before-refund, because a duplicated refund is money gone with no order
 * to attribute it to.
 */
export async function createRefund(input: {
  paymentId: string;
  amountMinor: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayRefund> {
  const config = getRazorpayConfig();
  if (!config) throw new Error("Razorpay is not configured");
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error(`Refusing to refund a nonsensical amount: ${input.amountMinor}`);
  }

  const response = await fetch(
    `${API_BASE}/payments/${encodeURIComponent(input.paymentId)}/refund`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(config.keyId, config.keySecret),
        // Razorpay's own idempotency header, belt to our braces.
        "X-Payment-Idempotency": input.receipt,
      },
      body: JSON.stringify({
        amount: input.amountMinor,
        speed: "normal",
        receipt: input.receipt,
        ...(input.notes && { notes: input.notes }),
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  const text = await response.text();
  if (!response.ok) {
    // Never echo the body to a customer — it can carry account details.
    throw new Error(`Razorpay refund failed: HTTP ${response.status} ${text.slice(0, 300)}`);
  }

  const refund = JSON.parse(text) as RazorpayRefund;
  if (!refund.id) throw new Error("Razorpay returned no refund id");
  return refund;
}
