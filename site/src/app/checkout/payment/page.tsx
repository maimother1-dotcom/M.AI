import type { Metadata } from "next";
import { PaymentClient } from "@/components/checkout/PaymentClient";
import { getPublishableKey } from "@/lib/stripe";
import { Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Payment",
  robots: { index: false, follow: false, nocache: true },
};

/** Strict-CSP route. See the note in src/proxy.ts. */
export const dynamic = "force-dynamic";

export default function PaymentPage() {
  // The publishable key is safe in the client by design — it can only create
  // tokens, never move money. The secret key never leaves the server.
  return (
    <Container className="py-14 lg:py-20">
      <PaymentClient publishableKey={getPublishableKey()} />
    </Container>
  );
}
