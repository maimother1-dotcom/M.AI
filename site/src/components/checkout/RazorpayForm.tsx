"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { Button } from "@/components/ui";
import { displayPrice } from "@/lib/currency";
import type { OrderTotals } from "@/lib/types";

/**
 * Razorpay checkout.
 *
 * Razorpay's script opens its own modal over the page — card, UPI, netbanking
 * and wallets all live inside it, served by Razorpay. Payment details never
 * enter our DOM, so they cannot be read by anything running here.
 *
 * On success Razorpay hands back a payment id, order id and signature. None of
 * that is believed in the browser: it is posted to /api/orders/confirm, which
 * verifies the signature against our key secret and re-fetches the payment from
 * Razorpay before it will render a receipt.
 */

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export interface RazorpayHandoff {
  razorpayOrderId: string;
  razorpayKeyId: string;
  orderToken: string;
  orderNumber: string;
  totals: OrderTotals;
  email: string;
  name: string;
  prefill?: { name: string; email: string; contact: string };
}

/** Load Razorpay's script once, on demand. */
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(Boolean(window.Razorpay)));
      existing.addEventListener("error", () => resolve(false));
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function RazorpayForm({ handoff }: { handoff: RazorpayHandoff }) {
  const router = useRouter();
  const { clear } = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = useCallback(async () => {
    setSubmitting(true);
    setError(null);

    const ready = await loadRazorpayScript();
    if (!ready || !window.Razorpay) {
      setError(
        "We could not load the payment window. Check your connection or any ad blocker, then try again.",
      );
      setSubmitting(false);
      return;
    }

    const checkout = new window.Razorpay({
      key: handoff.razorpayKeyId,
      // Amount and order come from OUR server. Razorpay validates them against
      // the order it already holds, so a tampered amount here simply fails.
      order_id: handoff.razorpayOrderId,
      amount: handoff.totals.totalMinor,
      currency: "INR",
      name: "L'INDIENNE",
      description: `Order ${handoff.orderNumber}`,
      prefill: handoff.prefill ?? { name: handoff.name, email: handoff.email },
      notes: { orderNumber: handoff.orderNumber },
      theme: { color: "#9C3A2C" },

      handler: async (response: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      }) => {
        // Hand the whole thing to the server. Nothing is trusted until it has
        // verified the signature and re-checked the payment with Razorpay.
        sessionStorage.setItem(
          "lindienne.order.v1",
          JSON.stringify({
            orderToken: handoff.orderToken,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpayOrderId: response.razorpay_order_id,
            razorpaySignature: response.razorpay_signature,
          }),
        );
        sessionStorage.removeItem("lindienne.checkout.v1");
        clear();
        router.push("/checkout/success");
      },

      modal: {
        ondismiss: () => {
          setSubmitting(false);
          setError("Payment was cancelled. Nothing has been charged.");
        },
      },
    });

    checkout.open();
  }, [handoff, router, clear]);

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl">Payment</h2>
        <span className="border border-line px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-soft">
          Secured by Razorpay
        </span>
      </div>

      <div className="border border-line p-6">
        <p className="eyebrow mb-4">Pay by</p>
        <div className="flex flex-wrap gap-2">
          {["UPI", "Card", "Netbanking", "Wallet", "EMI"].map((method) => (
            <span
              key={method}
              className="border border-line px-3 py-1.5 text-[11px] uppercase tracking-[0.1em] text-ink-soft"
            >
              {method}
            </span>
          ))}
        </div>
        <p className="mt-5 text-[11px] leading-relaxed text-ink-muted">
          Choosing a method opens Razorpay&rsquo;s secure window. Your card or UPI details are
          entered there and go directly to Razorpay — they never pass through this site.
        </p>
      </div>

      {error && (
        <p role="alert" className="border border-madder/40 bg-madder/5 p-4 text-sm text-madder">
          {error}
        </p>
      )}

      <Button onClick={pay} size="lg" className="w-full" disabled={submitting}>
        {submitting ? "Opening Razorpay…" : `Pay ${displayPrice(handoff.totals.totalMinor)}`}
      </Button>

      <p className="text-center text-[11px] text-ink-muted">
        By paying you accept our{" "}
        <Link href="/legal/terms" className="link-underline">
          terms
        </Link>{" "}
        and{" "}
        <Link href="/legal/privacy" className="link-underline">
          privacy policy
        </Link>
        .
      </p>
    </div>
  );
}
