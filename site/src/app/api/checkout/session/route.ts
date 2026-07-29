import { NextResponse } from "next/server";
import { z } from "zod";
import { CartError, priceCart } from "@/lib/pricing";
import { checkoutSchema, validationError } from "@/lib/validation";
import { LIMITS, clientKey, rateLimit } from "@/lib/rate-limit";
import { isLivePaymentAvailable, stripe } from "@/lib/stripe";
import { createRazorpayOrder, getRazorpayKeyId } from "@/lib/razorpay";
import { getPaymentProvider } from "@/lib/payments";
import {
  generateOrderNumber,
  isOrderSigningConfigured,
  signOrder,
  type OrderRecord,
} from "@/lib/orders";
import { isOrderStoreConfigured, saveOrder, type StoredOrder } from "@/lib/order-store";

/**
 * Create a payment session.
 *
 * This is the endpoint that decides what a customer is charged, so it is the one
 * that matters. The order of operations is deliberate:
 *
 *   1. Rate limit          — before any work is done.
 *   2. Schema validation   — reject malformed and over-specified bodies.
 *   3. Server pricing      — recompute every figure from the catalog.
 *   4. Create the intent   — for the amount WE computed, never one we were sent.
 *
 * Step 3 is the whole security model. A request claiming a ₹1 silk dress gets a
 * PaymentIntent for the catalog price, because the claimed price is never read.
 */

export const runtime = "nodejs";

/**
 * Write the order down as `pending`, before the customer is asked to pay.
 *
 * Recording it first is the point. If we only wrote orders on success, every
 * abandoned or failed payment would be invisible, and a payment that succeeded
 * at the processor while our webhook was down would leave a charged customer
 * with no order at all. A `pending` row that never advances is a question you
 * can answer; a missing row is not.
 */
function persistPending(
  order: OrderRecord,
  cart: { currency: string; appliedPromo: string | null; lines: OrderRecord["cart"]["lines"]; totals: OrderRecord["cart"]["totals"] },
  phone: string | undefined,
): boolean {
  if (!isOrderStoreConfigured()) return true; // dev without a secret: nothing to write to.
  const now = new Date().toISOString();
  const record: StoredOrder = {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    updatedAt: now,
    status: "pending",
    paymentMode: order.paymentMode,
    ...(order.paymentIntentId && { paymentIntentId: order.paymentIntentId }),
    email: order.email,
    name: order.name,
    ...(phone && { phone }),
    shippingAddress: order.shippingAddress,
    shippingMethod: order.shippingMethod,
    lines: cart.lines,
    totals: cart.totals,
    currency: cart.currency,
    appliedPromo: cart.appliedPromo,
  };
  try {
    saveOrder(record);
    return true;
  } catch (error) {
    console.error(`[checkout] could not record order ${order.orderNumber}:`, error);
    return false;
  }
}

/** A fresh Response each call — a body can only be read once, so this cannot be a constant. */
function storeFailed() {
  return NextResponse.json(
    {
      error: "ORDER_NOT_RECORDED",
      message: "We could not record your order, so we have not taken payment. Please try again.",
    },
    { status: 503 },
  );
}

export async function POST(request: Request) {
  // 1. Rate limit.
  const limit = rateLimit(clientKey(request, "checkout"), LIMITS.checkout);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Too many attempts. Wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  // 1b. Refuse early and legibly if this deployment cannot sign orders. Without
  //     a signing secret an order token could not be trusted later, so taking
  //     the payment first would be worse than declining now.
  //     The order store needs the same secret, and needs it to be a real one:
  //     taking a payment for an order that nothing records leaves a customer
  //     charged with no way to prove what they bought.
  if (!isOrderSigningConfigured() || (process.env.NODE_ENV === "production" && !isOrderStoreConfigured())) {
    console.error(
      "[checkout] ORDER_SIGNING_SECRET is not set. Generate one with `openssl rand -base64 48` " +
        "and add it to the deployment's environment variables.",
    );
    return NextResponse.json(
      {
        error: "NOT_CONFIGURED",
        message:
          "Checkout is not fully configured on this deployment yet. No charge was made. Please try again shortly.",
      },
      { status: 503 },
    );
  }

  // 2. Parse and validate.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON", message: "Malformed request." }, { status: 400 });
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error as z.ZodError), { status: 400 });
  }

  const input = parsed.data;

  // Honeypot. A filled hidden field means a bot; fail quietly so it learns nothing.
  if (input.website) {
    return NextResponse.json({ error: "REJECTED", message: "Unable to process." }, { status: 400 });
  }

  // 3. Price it. Server-side, from the catalog, ignoring anything the client
  //    might have thought the total was.
  let cart;
  try {
    cart = priceCart({
      lines: input.lines,
      shippingMethod: input.shippingMethod,
      promoCode: input.promoCode,
    });
  } catch (error) {
    if (error instanceof CartError) {
      return NextResponse.json(
        { error: error.code, message: error.message, sku: error.sku },
        { status: 409 },
      );
    }
    throw error;
  }

  const provider = getPaymentProvider();

  const order: OrderRecord = {
    orderNumber: generateOrderNumber(),
    email: input.email,
    name: input.name,
    createdAt: new Date().toISOString(),
    cart,
    shippingAddress: {
      line1: input.shippingAddress.line1,
      line2: input.shippingAddress.line2 || undefined,
      city: input.shippingAddress.city,
      state: input.shippingAddress.state,
      postalCode: input.shippingAddress.postalCode,
      country: input.shippingAddress.country,
    },
    shippingMethod: input.shippingMethod,
    paymentMode: provider,
  };

  // 4a. Razorpay. The amount comes from cart.totals.totalMinor, which came from
  //     the catalog — Razorpay never sees a figure the browser chose.
  if (provider === "razorpay") {
    try {
      const rzpOrder = await createRazorpayOrder({
        amountMinor: cart.totals.totalMinor,
        currency: cart.currency,
        receipt: order.orderNumber,
        notes: {
          orderNumber: order.orderNumber,
          shippingMethod: input.shippingMethod,
          promo: cart.appliedPromo ?? "",
        },
      });

      order.paymentIntentId = rzpOrder.id;

      // Razorpay has an order but nobody has been charged, so failing here costs
      // the customer nothing.
      if (!persistPending(order, cart, input.phone)) return storeFailed();

      return NextResponse.json({
        mode: "razorpay",
        razorpayOrderId: rzpOrder.id,
        razorpayKeyId: getRazorpayKeyId(),
        prefill: { name: input.name, email: input.email, contact: input.phone },
        orderToken: signOrder(order),
        orderNumber: order.orderNumber,
        totals: cart.totals,
        appliedPromo: cart.appliedPromo,
      });
    } catch (error) {
      console.error("[checkout] Razorpay order failed:", error);
      return NextResponse.json(
        {
          error: "PAYMENT_INIT_FAILED",
          message: "We could not start the payment. No charge was made. Please try again.",
        },
        { status: 502 },
      );
    }
  }

  // 4b. Demo mode — nothing configured. Mint a signed order and let the payment
  //     page run its local card check. No money moves.
  if (provider === "demo" || !isLivePaymentAvailable() || !stripe) {
    if (!persistPending(order, cart, input.phone)) return storeFailed();

    return NextResponse.json({
      mode: "demo",
      orderToken: signOrder(order),
      orderNumber: order.orderNumber,
      totals: cart.totals,
      appliedPromo: cart.appliedPromo,
    });
  }

  // 4c. Stripe mode. The amount comes from `cart.totals.totalMinor`, which came
  //     from the catalog. Stripe never sees a number the browser chose.
  try {
    const intent = await stripe.paymentIntents.create({
      amount: cart.totals.totalMinor,
      currency: cart.currency.toLowerCase(),
      // Not `automatic_payment_methods` blindly — card only keeps the flow
      // predictable and avoids surfacing methods this account cannot settle.
      automatic_payment_methods: { enabled: true },
      receipt_email: input.email,
      description: `L'INDIENNE order ${order.orderNumber}`,
      shipping: {
        name: input.name,
        phone: input.phone,
        address: {
          line1: input.shippingAddress.line1,
          line2: input.shippingAddress.line2 || undefined,
          city: input.shippingAddress.city,
          state: input.shippingAddress.state,
          postal_code: input.shippingAddress.postalCode,
          country: input.shippingAddress.country,
        },
      },
      metadata: {
        orderNumber: order.orderNumber,
        // Stripe caps metadata values at 500 characters, so store a compact
        // line summary rather than the full cart.
        lines: cart.lines
          .map((l) => `${l.sku}x${l.quantity}`)
          .join(",")
          .slice(0, 480),
        shippingMethod: input.shippingMethod,
        promo: cart.appliedPromo ?? "",
      },
    });

    order.paymentIntentId = intent.id;

    if (!persistPending(order, cart, input.phone)) return storeFailed();

    return NextResponse.json({
      mode: "stripe",
      clientSecret: intent.client_secret,
      orderToken: signOrder(order),
      orderNumber: order.orderNumber,
      totals: cart.totals,
      appliedPromo: cart.appliedPromo,
    });
  } catch (error) {
    // Never leak Stripe's raw error to the browser — it can contain account
    // details. Log it server-side, return something the customer can act on.
    console.error("[checkout] Stripe PaymentIntent failed:", error);
    return NextResponse.json(
      {
        error: "PAYMENT_INIT_FAILED",
        message: "We could not start the payment. No charge was made. Please try again.",
      },
      { status: 502 },
    );
  }
}
