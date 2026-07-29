import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay";

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
    payload?: { payment?: { entity?: Record<string, unknown> } };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const payment = event.payload?.payment?.entity;
  const paymentId = typeof payment?.id === "string" ? payment.id : "unknown";

  if (processed.has(paymentId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (processed.size > MAX_TRACKED) processed.clear();
  processed.add(paymentId);

  switch (event.event) {
    case "payment.captured": {
      const notes = payment?.notes as Record<string, string> | undefined;
      // Fulfilment belongs HERE, not on the success page — the customer's
      // browser may never reach the success page. Write the order, decrement
      // stock, send the confirmation email.
      console.info(
        `[razorpay-webhook] captured: order ${notes?.orderNumber ?? "unknown"}, ` +
          `${payment?.amount} ${payment?.currency}, method ${payment?.method}`,
      );
      break;
    }

    case "payment.failed": {
      const notes = payment?.notes as Record<string, string> | undefined;
      console.warn(
        `[razorpay-webhook] failed: order ${notes?.orderNumber ?? "unknown"} — ` +
          `${(payment?.error_description as string) ?? "no reason given"}`,
      );
      break;
    }

    case "refund.created":
      console.info(`[razorpay-webhook] refund created for payment ${paymentId}`);
      break;

    default:
      // Acknowledge unhandled types so Razorpay stops retrying them.
      break;
  }

  return NextResponse.json({ received: true });
}
