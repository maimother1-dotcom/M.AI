import "server-only";
import Stripe from "stripe";

/**
 * Stripe, with a demo fallback.
 *
 * The site is fully walkable with no Stripe account at all: `isStripeEnabled`
 * is false, checkout mints a signed demo order, and the payment page runs a
 * local card check instead of Stripe Elements. Add the keys and every one of
 * those paths switches to the real one — no code changes.
 *
 * What does NOT change between modes: the server prices the cart. Demo mode is
 * a stand-in for the payment processor, not a bypass of the pricing authority.
 */

const secretKey = process.env.STRIPE_SECRET_KEY;

export const isStripeEnabled = Boolean(secretKey && secretKey.startsWith("sk_"));

export const stripe = isStripeEnabled
  ? new Stripe(secretKey!, {
      // Pin the version. An account-level API upgrade should never silently
      // change the shape of a live payment flow.
      apiVersion: "2025-08-27.basil",
      typescript: true,
      appInfo: { name: "L'INDIENNE", version: "1.0.0" },
      maxNetworkRetries: 3,
      timeout: 20_000,
    })
  : null;

export function getPublishableKey(): string | null {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  return key && key.startsWith("pk_") ? key : null;
}

/**
 * True only when BOTH keys are present. A publishable key without a secret key
 * (or the reverse) is a misconfiguration that would fail halfway through a
 * customer's checkout, so we treat it as demo mode and say so in the banner.
 */
export function isLivePaymentAvailable(): boolean {
  return isStripeEnabled && getPublishableKey() !== null;
}
