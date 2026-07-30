import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { fulfilOrder, sendConfirmationEmail, settleOrderStock } from "@/lib/fulfilment";
import {
  getOrderByPaymentId,
  getOrderByPaymentIntent,
  isOrderStoreConfigured,
  recordPaymentOutcome,
} from "@/lib/order-store";

/**
 * Razorpay webhook.
 *
 * Publicly reachable, and it is what says "this order is paid". If it trusted
 * its input, anyone could POST a fake `payment.captured` and have merchandise
 * shipped for free.
 *
 * So it does one thing before anything else: verifies the HMAC-SHA256 signature
 * over the RAW body. Not the parsed body — the signature covers the exact bytes
 * Razorpay sent, and `await request.json()` destroys them.
 */

export const runtime = "nodejs";

/** Event ids already handled, so a redelivery is a no-op. */
const processed = new Set<string>();
const MAX_TRACKED = 5000;

export async function POST(request: Request) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    // Refuse rather than pretend to accept, so a misconfiguration shows up in
    // Razorpay's dashboard instead of failing silently.
    return NextResponse.json(
      { error: "NOT_CONFIGURED", message: "Webhooks are not enabled on this deployment." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) {
    return NextResponse.json({ error: "MISSING_SIGNATURE" }, { status: 400 });
  }

  // Raw bytes, exactly as received.
  const rawBody = await request.text();

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error("[razorpay-webhook] signature verification failed");
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 400 });
  }

  let event: {
    event?: string;
    payload?: {
      payment?: { entity?: Record<string, unknown> };
      refund?: { entity?: Record<string, unknown> };
    };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const payment = event.payload?.payment?.entity;
  const refund = event.payload?.refund?.entity;
  // A refund event carries a refund entity, not a payment one, and points back at
  // the payment it reverses. Reading only `payment.entity` would silently drop
  // every refund on the floor.
  const paymentId =
    typeof payment?.id === "string"
      ? payment.id
      : typeof refund?.payment_id === "string"
        ? refund.payment_id
        : "unknown";

  // Keyed on the event id, not the payment id: a payment legitimately produces
  // several events (captured, then refunded), and keying on the payment would
  // make the second one look like a redelivery of the first.
  const eventId = request.headers.get("x-razorpay-event-id") ?? `${event.event}:${paymentId}`;

  if (processed.has(eventId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (processed.size > MAX_TRACKED) processed.clear();
  processed.add(eventId);

  /**
   * Which of our orders this event is about.
   *
   * `notes.orderNumber` is what we set when we created the Razorpay order, so it
   * is the direct answer. It is not guaranteed to survive every event shape
   * though, so the Razorpay order id is the fallback — that one we always
   * recorded ourselves.
   */
  async function resolveOrderNumber(): Promise<string | null> {
    const notes = payment?.notes as Record<string, string> | undefined;
    if (typeof notes?.orderNumber === "string" && notes.orderNumber) return notes.orderNumber;
    if (!isOrderStoreConfigured()) return null;
    const rzpOrderId = typeof payment?.order_id === "string" ? payment.order_id : null;
    if (rzpOrderId) return (await getOrderByPaymentIntent(rzpOrderId))?.orderNumber ?? null;
    // Refunds carry neither, so trace back through the payment they reverse.
    if (paymentId !== "unknown") return (await getOrderByPaymentId(paymentId))?.orderNumber ?? null;
    return null;
  }

  switch (event.event) {
    case "payment.captured": {
      // Fulfilment belongs HERE, not on the success page — the customer's
      // browser may never reach the success page.
      const orderNumber = await resolveOrderNumber();
      console.info(
        `[razorpay-webhook] captured: order ${orderNumber ?? "unknown"}, ` +
          `${payment?.amount} ${payment?.currency}, method ${payment?.method}`,
      );
      if (orderNumber && isOrderStoreConfigured()) {
        const result = await recordPaymentOutcome(orderNumber, {
          status: "paid",
          paymentId,
          ...(typeof payment?.method === "string" && { paymentMethod: payment.method }),
        });
        if (!result) {
          // A capture we cannot match to an order is money taken for something
          // we have no record of. Loud, because it needs a human.
          console.error(
            `[razorpay-webhook] CAPTURED PAYMENT WITH NO MATCHING ORDER: ${paymentId} (${orderNumber}). Reconcile manually.`,
          );
        } else {
          // Hand it to the courier. Awaited rather than fired and forgotten,
          // because a serverless instance is frozen the moment this handler
          // returns and a dangling promise would simply never run. `fulfilOrder`
          // is idempotent and never throws, so this cannot cost us the 200 that
          // stops Razorpay retrying.
          // The pieces are sold: off the shelf and out of the hold.
          await settleOrderStock(orderNumber, "committed");
          await sendConfirmationEmail(orderNumber);
          await fulfilOrder(orderNumber);
        }
      }
      break;
    }

    case "payment.failed": {
      const orderNumber = await resolveOrderNumber();
      const reason = (payment?.error_description as string) ?? "no reason given";
      console.warn(`[razorpay-webhook] failed: order ${orderNumber ?? "unknown"} — ${reason}`);
      if (orderNumber && isOrderStoreConfigured()) {
        await recordPaymentOutcome(orderNumber, { status: "failed", paymentId, failureReason: reason });
        // Nobody is paying for this, so the pieces go back on the shelf.
        await settleOrderStock(orderNumber, "released");
      }
      break;
    }

    case "refund.created": {
      console.info(`[razorpay-webhook] refund created for payment ${paymentId}`);
      const orderNumber = await resolveOrderNumber();
      if (orderNumber && isOrderStoreConfigured()) {
        await recordPaymentOutcome(orderNumber, { status: "refunded", paymentId });
      }
      break;
    }

    default:
      // Acknowledge unhandled types so Razorpay stops retrying them.
      break;
  }

  return NextResponse.json({ received: true });
}
