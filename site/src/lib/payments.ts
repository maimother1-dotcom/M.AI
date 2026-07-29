import "server-only";
import { isLivePaymentAvailable as isStripeLive } from "@/lib/stripe";
import { isRazorpayEnabled } from "@/lib/razorpay";

/**
 * Which payment provider this deployment uses.
 *
 * One function decides, so there is a single place to reason about it rather
 * than a scatter of `if (stripeKey)` checks across routes and components.
 *
 * Order of preference is deliberate. Razorpay wins when both are configured,
 * because this store prices in rupees and sells to Indian customers — Razorpay
 * settles INR domestically and supports UPI, which Stripe India does not.
 */
export type PaymentProvider = "razorpay" | "stripe" | "demo";

export function getPaymentProvider(): PaymentProvider {
  if (isRazorpayEnabled()) return "razorpay";
  if (isStripeLive()) return "stripe";
  return "demo";
}

export function isLivePayments(): boolean {
  return getPaymentProvider() !== "demo";
}

/** Human-readable, for the payment page banner. */
export function describeProvider(provider: PaymentProvider): {
  label: string;
  note: string;
} {
  switch (provider) {
    case "razorpay":
      return {
        label: "Razorpay",
        note: "Card, UPI, netbanking and wallets. Payment details go directly to Razorpay and never reach this server.",
      };
    case "stripe":
      return {
        label: "Stripe",
        note: "Card details are entered inside a frame served by Stripe and go directly to them.",
      };
    default:
      return {
        label: "Demo",
        note: "No payment keys are configured on this deployment, so no card is charged and none is stored.",
      };
  }
}
