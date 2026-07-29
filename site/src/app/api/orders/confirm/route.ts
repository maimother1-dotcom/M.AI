import { NextResponse } from "next/server";
import { z } from "zod";
import { deliveryEstimate, verifyOrder } from "@/lib/orders";
import { isLivePaymentAvailable, stripe } from "@/lib/stripe";
import { fetchRazorpayPayment, verifyPaymentSignature } from "@/lib/razorpay";
import { LIMITS, clientKey, rateLimit } from "@/lib/rate-limit";

/**
 * Confirm an order for the receipt page.
 *
 * The confirmation page renders whatever this returns, so this is where the
 * "edit the URL and print yourself a receipt" attack has to die. Two checks:
 *
 *   1. The order token must carry a valid HMAC. A token whose contents were
 *      edited — a different total, a different order number — fails the
 *      signature and is rejected outright.
 *
 *   2. In Stripe mode the PaymentIntent is re-fetched FROM STRIPE and must
 *      report `succeeded`, and its amount must match the signed order. A valid
 *      token for an order that was never actually paid does not produce a
 *      receipt.
 *
 * Check 2 matters because check 1 alone only proves we issued the order, not
 * that anybody paid for it.
 */

export const runtime = "nodejs";

const schema = z
  .object({
    orderToken: z.string().min(10).max(8000),
    paymentIntentId: z.string().max(120).optional().nullable(),
    // Razorpay hands these back to the browser after checkout. They are only
    // ever believed after the signature verifies against our key secret.
    razorpayPaymentId: z.string().max(120).optional().nullable(),
    razorpayOrderId: z.string().max(120).optional().nullable(),
    razorpaySignature: z.string().max(256).optional().nullable(),
  })
  .strict();

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, "confirm"), LIMITS.checkout);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Too many attempts." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON", message: "Malformed request." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", message: "Invalid request." },
      { status: 400 },
    );
  }

  // 1. Signature.
  const order = verifyOrder(parsed.data.orderToken);
  if (!order) {
    return NextResponse.json(
      {
        error: "INVALID_ORDER",
        message: "We could not verify this order. If you were charged, contact care@lindienne.com.",
      },
      { status: 400 },
    );
  }

  // 2a. Razorpay: the signature proves Razorpay processed THIS payment for THIS
  //     order — a browser cannot forge it without our key secret. Then the
  //     payment is re-fetched so a receipt reflects Razorpay's view, not the
  //     browser's claim.
  if (order.paymentMode === "razorpay") {
    const { razorpayPaymentId, razorpayOrderId, razorpaySignature } = parsed.data;

    if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
      return NextResponse.json(
        { error: "UNVERIFIABLE", message: "We could not verify the payment for this order." },
        { status: 409 },
      );
    }

    // The order id must be the one WE created, not one supplied alongside a
    // signature for some other order.
    if (razorpayOrderId !== order.paymentIntentId) {
      return NextResponse.json(
        { error: "ORDER_MISMATCH", message: "We could not verify this order." },
        { status: 409 },
      );
    }

    if (
      !verifyPaymentSignature({
        orderId: razorpayOrderId,
        paymentId: razorpayPaymentId,
        signature: razorpaySignature,
      })
    ) {
      console.error(`[confirm] Razorpay signature failed for ${order.orderNumber}`);
      return NextResponse.json(
        { error: "INVALID_SIGNATURE", message: "We could not verify this order." },
        { status: 409 },
      );
    }

    const payment = await fetchRazorpayPayment(razorpayPaymentId);
    if (!payment) {
      return NextResponse.json(
        { error: "VERIFY_FAILED", message: "We could not reach our payment processor." },
        { status: 502 },
      );
    }
    if (payment.status !== "captured") {
      return NextResponse.json(
        {
          error: "NOT_PAID",
          message: `This payment is ${payment.status}. Nothing has been charged yet.`,
          status: payment.status,
        },
        { status: 409 },
      );
    }
    // Without this, a valid small payment could be replayed against a large order.
    if (payment.amount !== order.cart.totals.totalMinor) {
      return NextResponse.json(
        { error: "AMOUNT_MISMATCH", message: "We could not verify this order." },
        { status: 409 },
      );
    }
  }

  // 2b. Payment status, from Stripe rather than from the request.
  if (order.paymentMode === "stripe") {
    const intentId = parsed.data.paymentIntentId ?? order.paymentIntentId;

    if (!isLivePaymentAvailable() || !stripe || !intentId) {
      return NextResponse.json(
        { error: "UNVERIFIABLE", message: "We could not verify the payment for this order." },
        { status: 409 },
      );
    }

    try {
      const intent = await stripe.paymentIntents.retrieve(intentId);

      if (intent.status !== "succeeded") {
        return NextResponse.json(
          {
            error: "NOT_PAID",
            message: `This payment is ${intent.status.replace(/_/g, " ")}. Nothing has been charged yet.`,
            status: intent.status,
          },
          { status: 409 },
        );
      }

      // The intent must belong to THIS order, and be for the signed amount.
      // Without this, a valid ₹200 payment could be replayed against a ₹90,000
      // order token.
      if (intent.metadata?.orderNumber !== order.orderNumber) {
        return NextResponse.json(
          { error: "ORDER_MISMATCH", message: "We could not verify this order." },
          { status: 409 },
        );
      }
      if (intent.amount !== order.cart.totals.totalMinor) {
        return NextResponse.json(
          { error: "AMOUNT_MISMATCH", message: "We could not verify this order." },
          { status: 409 },
        );
      }
    } catch (error) {
      console.error("[confirm] Stripe retrieve failed:", error);
      return NextResponse.json(
        { error: "VERIFY_FAILED", message: "We could not reach our payment processor." },
        { status: 502 },
      );
    }
  }

  // Return only what the receipt needs. The full signed record stays server-side.
  return NextResponse.json({
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    email: order.email,
    name: order.name,
    lines: order.cart.lines,
    totals: order.cart.totals,
    shippingAddress: order.shippingAddress,
    shippingMethod: order.shippingMethod,
    paymentMode: order.paymentMode,
    deliveryEstimate: deliveryEstimate(order.shippingMethod),
  });
}
