import "server-only";
import { getOrder, recordPaymentOutcome } from "@/lib/order-store";
import { createRefund } from "@/lib/razorpay";
import { getPaymentProvider } from "@/lib/payments";
import { isStripeEnabled, stripe } from "@/lib/stripe";
import {
  claimRefund,
  claimRestock,
  getReturn,
  recordRefund,
  releaseRefundClaim,
  transitionReturn,
  type ReturnRecord,
} from "@/lib/returns";
import { restock } from "@/lib/stock";
import { sendEmail } from "@/lib/email";
import { refundEmail } from "@/lib/emails/order-emails";

/**
 * Putting money back, and pieces back on the shelf.
 *
 * The order of operations is the whole design:
 *
 *   1. Claim the refund. One caller wins; everyone else is told it is already
 *      done. A double-click must not become two refunds.
 *   2. Ask the processor. This is the only step that can fail in a way that
 *      leaves reality and our records disagreeing.
 *   3. Record what happened.
 *
 * Claiming BEFORE calling the processor is the safer direction. If step 2 fails
 * we release the claim so it can be retried, and if that release itself fails
 * the return sits marked refunded with a zero amount — visibly wrong in the
 * admin, and a human fixes it. The other order risks refunding twice, which is
 * money gone with nothing to attribute it to.
 */

export interface RefundResult {
  ok: boolean;
  amountMinor?: number;
  refundId?: string;
  reason?: "not-found" | "already-refunded" | "not-received" | "no-payment" | "processor-failed";
  message?: string;
}

export async function refundReturn(rma: string): Promise<RefundResult> {
  const existing = await getReturn(rma);
  if (!existing) return { ok: false, reason: "not-found" };

  if (existing.status !== "received") {
    return {
      ok: false,
      reason: existing.status === "refunded" ? "already-refunded" : "not-received",
      message:
        existing.status === "refunded"
          ? "This return has already been refunded."
          : "Mark the parcel received before refunding it. Stock goes back when the pieces do.",
    };
  }

  const order = await getOrder(existing.orderNumber);
  if (!order) return { ok: false, reason: "not-found" };

  // 1. Claim it. Exactly one caller gets a record back.
  const claimed = await claimRefund(rma);
  if (!claimed) {
    return {
      ok: false,
      reason: "already-refunded",
      message: "Another request is already refunding this return.",
    };
  }

  const amountMinor = claimed.refundableMinor;
  const provider = getPaymentProvider();

  // 2. Move the money.
  let refundId: string | null = null;
  try {
    if (provider === "razorpay") {
      if (!order.paymentId) throw new Error("no Razorpay payment id on the order");
      const refund = await createRefund({
        paymentId: order.paymentId,
        amountMinor,
        receipt: rma,
        notes: { orderNumber: order.orderNumber, rma },
      });
      refundId = refund.id;
    } else if (provider === "stripe" && isStripeEnabled && stripe) {
      if (!order.paymentIntentId) throw new Error("no PaymentIntent on the order");
      const refund = await stripe.refunds.create({
        payment_intent: order.paymentIntentId,
        amount: amountMinor,
        metadata: { orderNumber: order.orderNumber, rma },
      });
      refundId = refund.id;
    } else {
      // Demo mode. Nothing moves, and the record says so rather than implying
      // a customer has been paid.
      console.info(`[refund] demo mode — would have refunded ${amountMinor} for ${rma}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[refund] processor refused ${rma}:`, message);
    // Hand the claim back so it can be tried again once the cause is fixed.
    await releaseRefundClaim(rma);
    return { ok: false, reason: "processor-failed", message };
  }

  // 3. Record it.
  await recordRefund(rma, amountMinor, refundId);

  // A full refund makes the order refunded; a partial one leaves it paid, which
  // is what it still is for the pieces the customer kept.
  if (amountMinor >= order.totals.totalMinor) {
    await recordPaymentOutcome(order.orderNumber, { status: "refunded" });
  }

  const updated = await getReturn(rma);
  if (updated) await sendRefundEmail(order.email, order.orderNumber, updated);

  console.info(`[refund] ${rma}: ${amountMinor} refunded via ${provider}${refundId ? ` (${refundId})` : ""}`);
  return { ok: true, amountMinor, ...(refundId && { refundId }) };
}

/**
 * Put returned pieces back on the shelf.
 *
 * Called when the parcel arrives, not when the money goes back — those are
 * different days, and a piece is only sellable once it is physically in your
 * hands and has passed inspection.
 *
 * `commitSale()` decremented `on_hand` when the order was paid, so putting stock
 * back means raising `on_hand` again. Claimed once, because marking a parcel
 * received twice must not invent inventory.
 */
export async function restockReturn(rma: string): Promise<{ ok: boolean; restocked: number }> {
  const record = await getReturn(rma);
  if (!record) return { ok: false, restocked: 0 };

  if (!(await claimRestock(rma))) return { ok: true, restocked: 0 };

  let restocked = 0;
  try {
    await restock(record.lines);
    restocked = record.lines.reduce((sum, line) => sum + line.quantity, 0);
  } catch (error) {
    console.error(`[refund] could not restock ${rma}:`, error);
    return { ok: false, restocked };
  }

  return { ok: true, restocked };
}

/** Receive the parcel: advance the return and put the pieces back. */
export async function receiveReturn(rma: string): Promise<ReturnRecord | null> {
  const moved = await transitionReturn(rma, "requested", "received");
  if (!moved) return null;
  await restockReturn(rma);
  return getReturn(rma).then((r) => r ?? moved);
}

async function sendRefundEmail(
  to: string,
  orderNumber: string,
  record: ReturnRecord,
): Promise<void> {
  try {
    await sendEmail(refundEmail(to, orderNumber, record.rma, record.refundedMinor));
  } catch (error) {
    // The money has moved. A failed email must not undo that or throw.
    console.error(`[refund] could not email the customer about ${record.rma}:`, error);
  }
}
