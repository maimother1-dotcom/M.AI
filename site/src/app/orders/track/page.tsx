import type { Metadata } from "next";
import { TrackOrder } from "@/components/orders/TrackOrder";
import { Container } from "@/components/ui";
import { MotifDivider } from "@/components/brand/Motif";

export const metadata: Metadata = {
  title: "Track your order",
  description:
    "Look up an order with its number and the email address it was placed with — status, courier tracking and your invoice.",
};

export default function TrackOrderPage() {
  return (
    <Container className="py-16 lg:py-24">
      <div className="max-w-2xl">
        <p className="eyebrow">Your order</p>
        <h1 className="mt-4 text-balance text-4xl leading-tight lg:text-5xl">
          Where is it?
        </h1>
        <p className="mt-5 text-pretty leading-relaxed text-ink-soft">
          Enter your order number and the email address you used at checkout. There is no
          account to create — those two together are enough, and they are all we ask anyone
          to remember.
        </p>
        <MotifDivider className="mt-8 max-w-[160px]" />

        <TrackOrder />
      </div>
    </Container>
  );
}
