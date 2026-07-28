import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { isStripeEnabled, stripe } from "@/lib/stripe";

/**
 * Stripe webhook.
 *
 * This endpoint is publicly reachable, and it is the one that says "this order
 * is paid". If it trusted its input, anyone could POST a fake
 * `payment_intent.succeeded` and get free merchandise shipped.
 *
 * So it does exactly one thing before anything else: verifies the signature
 * against STRIPE_WEBHOOK_SECRET using the RAW body. Not the parsed body — the
 * signature covers the exact bytes Stripe sent, and `await request.json()`
 * destroys them.
 */

export const runtime = "nodejs";

/** Event ids already handled, so a replayed delivery is a no-op. */
const processed = new Set<string>();
const MAX_TRACKED = 5000;

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!isStripeEnabled || !stripe || !secret) {
    // Not configured. Refuse rather than pretending to accept, so a
    // misconfiguration is visible in Stripe's dashboard instead of silent.
    return NextResponse.json(
      { error: "NOT_CONFIGURED", message: "Webhooks are not enabled on this deployment." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "MISSING_SIGNATURE" }, { status: 400 });
  }

  // Raw bytes, exactly as received.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    // Covers a bad signature, a wrong secret, and a replayed request outside
    // Stripe's tolerance window.
    console.error("[webhook] signature verification failed:", (error as Error).message);
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 400 });
  }

  // Idempotency. Stripe retries on any non-2xx and can deliver twice on a 2xx.
  if (processed.has(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (processed.size > MAX_TRACKED) processed.clear();
  processed.add(event.id);

  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object;
      const orderNumber = intent.metadata?.orderNumber ?? "unknown";
      // This is where fulfilment goes: write the order, decrement stock, send
      // the confirmation email. All of it belongs HERE and not on the success
      // page, because the customer's browser may never reach the success page.
      console.info(
        `[webhook] paid: order ${orderNumber}, ${intent.amount} ${intent.currency}`,
      );
      break;
    }

    case "payment_intent.payment_failed": {
      const intent = event.data.object;
      console.warn(
        `[webhook] failed: order ${intent.metadata?.orderNumber ?? "unknown"} — ${
          intent.last_payment_error?.message ?? "no reason given"
        }`,
      );
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object;
      console.info(`[webhook] refunded: charge ${charge.id}`);
      break;
    }

    default:
      // Acknowledge unhandled types so Stripe stops retrying them.
      break;
  }

  return NextResponse.json({ received: true });
}
