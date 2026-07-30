import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/guard";
import { fulfilOrder } from "@/lib/fulfilment";
import { isShiprocketEnabled } from "@/lib/shiprocket";

/**
 * Push a paid order to the courier by hand.
 *
 * The webhook does this automatically on capture, so this exists for the times
 * it did not work: Shiprocket was down, the wallet was empty, the pincode was
 * briefly unserviceable. Those are all recoverable, and all need a human to
 * decide the moment to retry.
 *
 * It cannot ship an unpaid order — `fulfilOrder()` re-reads the order and checks
 * that itself rather than trusting a caller, so this route being authenticated is
 * defence in depth rather than the only control.
 */

export const runtime = "nodejs";

const schema = z.object({ orderNumber: z.string().trim().min(4).max(40) }).strict();

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  if (!isShiprocketEnabled()) {
    return NextResponse.json(
      {
        error: "NOT_CONFIGURED",
        message:
          "Shiprocket is not configured. Set SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD and SHIPROCKET_PICKUP_LOCATION.",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const result = await fulfilOrder(parsed.data.orderNumber);
  console.info(`[admin] ${auth.subject} pushed ${parsed.data.orderNumber}: ${JSON.stringify(result)}`);

  revalidatePath("/admin/orders");

  if (result.ok) {
    return NextResponse.json({ ok: true, awbCode: result.awbCode, skipped: result.skipped });
  }

  const message =
    result.skipped === "not-paid"
      ? "That order has not been paid, so it cannot be shipped."
      : result.skipped === "no-order"
        ? "No such order."
        : result.error === "no-phone"
          ? "That order has no phone number, and a courier cannot deliver without one."
          : (result.error ?? "The courier rejected it. See the server logs.");

  return NextResponse.json({ ok: false, message }, { status: 409 });
}
