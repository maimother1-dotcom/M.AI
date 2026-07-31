import { NextResponse } from "next/server";
import { z } from "zod";
import { TAX, financialYear } from "@/data/tax";
import { deliveryEstimate } from "@/lib/orders";
import {
  findOrderForCustomer,
  isOrderStoreConfigured,
  issueInvoiceNumber,
} from "@/lib/order-store";
import { signOrderAccess } from "@/lib/order-access";
import { LIMITS, clientKey, rateLimit } from "@/lib/rate-limit";

/**
 * A customer looking up their own order.
 *
 * There is no login on this site, so the credential is the pair: an order number
 * they were given and the email it was placed with. Both must match.
 *
 * THE THING THIS ENDPOINT MUST NOT DO is confirm that an order number exists.
 * An order number alone is guessable-ish, and a response that distinguished
 * "no such order" from "wrong email" would turn this into an oracle for
 * discovering which numbers are real and then brute-forcing addresses against
 * them. So there is exactly one failure response, whatever went wrong, and the
 * rate limit is tight.
 *
 * Nothing here reveals more than the customer already has. No payment
 * identifiers, no internal state, no other order.
 */

export const runtime = "nodejs";

const schema = z
  .object({
    orderNumber: z.string().trim().min(4).max(40),
    email: z.string().trim().email().max(200),
  })
  .strict();

/** One response for every failure, so nothing is learned from which one came back. */
function notFound() {
  return NextResponse.json(
    {
      error: "NOT_FOUND",
      message:
        "We could not find an order with that number and email address. Check both, or write to care@lindienne.com.",
    },
    { status: 404 },
  );
}

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, "order-lookup"), LIMITS.orderLookup);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Too many attempts. Wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  if (!isOrderStoreConfigured()) return notFound();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON", message: "Malformed request." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return notFound();

  let order;
  try {
    order = await findOrderForCustomer(parsed.data.orderNumber, parsed.data.email);
  } catch (error) {
    console.error("[lookup] store read failed:", error);
    return NextResponse.json(
      { error: "UNAVAILABLE", message: "We could not look that up just now. Please try again." },
      { status: 503 },
    );
  }

  if (!order) return notFound();

  // A pending order is one nobody has paid for. Showing its contents is fine —
  // the customer created it — but it gets no invoice.
  let invoiceNumber = order.invoiceNumber ?? null;
  if (order.status === "paid" && !invoiceNumber) {
    try {
      invoiceNumber = await issueInvoiceNumber(
        order.orderNumber,
        TAX.invoicePrefix,
        financialYear(new Date(order.paidAt ?? order.createdAt)),
      );
    } catch (error) {
      console.error(`[lookup] could not issue an invoice number for ${order.orderNumber}:`, error);
    }
  }

  return NextResponse.json({
    orderNumber: order.orderNumber,
    placedAt: order.createdAt,
    status: order.status,
    fulfilmentStatus: order.fulfilmentStatus ?? "unfulfilled",
    courierName: order.courierName ?? null,
    awbCode: order.awbCode ?? null,
    trackingUrl: order.trackingUrl ?? null,
    courierStatus: order.courierStatus ?? null,
    deliveryEstimate: deliveryEstimate(order.shippingMethod),
    shippingMethod: order.shippingMethod,
    lines: order.lines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      size: line.size,
      colorway: line.colorway,
      lineTotalMinor: line.lineTotalMinor,
    })),
    totals: order.totals,
    shippingAddress: order.shippingAddress,
    invoiceNumber,
    // A short-lived token, so the invoice page can be opened without putting the
    // customer's email in a URL that lands in browser history and referrers.
    invoiceToken: invoiceNumber ? signOrderAccess(order.orderNumber) : null,
  });
}
