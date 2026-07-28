import { NextResponse } from "next/server";
import type { z } from "zod";
import { CartError, priceCart } from "@/lib/pricing";
import { quoteSchema, validationError } from "@/lib/validation";
import { LIMITS, clientKey, rateLimit } from "@/lib/rate-limit";

/**
 * Price a cart without creating a payment.
 *
 * The checkout page calls this whenever the shipping method or promo code
 * changes, so the totals on screen are always the server's totals rather than
 * a client-side guess that could disagree at the final step.
 *
 * It shares `priceCart` with the session endpoint, which is the point: there is
 * exactly one place where money is calculated, and both routes go through it.
 */

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, "quote"), LIMITS.quote);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Too many attempts. Wait a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON", message: "Malformed request." }, { status: 400 });
  }

  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error as z.ZodError), { status: 400 });
  }

  try {
    const cart = priceCart(parsed.data);
    return NextResponse.json({
      totals: cart.totals,
      appliedPromo: cart.appliedPromo,
      lines: cart.lines,
      // Tell the customer their code was not recognised rather than silently
      // charging full price and letting them find out on the receipt.
      promoRejected: Boolean(parsed.data.promoCode) && cart.appliedPromo === null,
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
}
