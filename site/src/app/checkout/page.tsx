import type { Metadata } from "next";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Checkout",
  // Checkout pages carry order state and must never appear in search results.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Dynamic, deliberately.
 *
 * The strict nonce-based CSP in `src/proxy.ts` only functions on dynamically
 * rendered routes — a prerendered page has no nonce on its script tags. This is
 * the flow where card details are entered, so it gets the strict policy.
 */
export const dynamic = "force-dynamic";

export default function CheckoutPage() {
  return (
    <Container className="py-14 lg:py-20">
      <CheckoutForm />
    </Container>
  );
}
