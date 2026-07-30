import "server-only";
import { getCatalogProduct } from "@/lib/admin/store";
import { parcelFor, parcelForOrder } from "@/data/shipping";
import {
  claimEmail,
  getOrder,
  isOrderStoreConfigured,
  recordFulfilment,
  type StoredOrder,
} from "@/lib/order-store";
import { sendEmail } from "@/lib/email";
import { despatchEmail, orderConfirmationEmail } from "@/lib/emails/order-emails";
import {
  assignAwb,
  createShiprocketOrder,
  isShiprocketEnabled,
  trackingUrlFor,
} from "@/lib/shiprocket";

/**
 * Turning a paid order into a parcel.
 *
 * This sits between the payment webhook and Shiprocket, and its job is mostly to
 * be careful about the ways that can go wrong:
 *
 *   - **It only ever runs on a paid order.** It re-reads the order from the store
 *     and checks `status === "paid"` itself rather than trusting its caller. A
 *     bug elsewhere should not be able to ship goods for an unpaid order.
 *
 *   - **It is idempotent.** Razorpay retries webhooks, and the confirmation
 *     endpoint can race them. An order that already has a shipment is left
 *     alone, so a customer never gets two parcels for one payment.
 *
 *   - **It never throws at its caller.** The webhook must return 200 or the
 *     processor retries the whole delivery, and a courier outage is not a reason
 *     to make Razorpay think we failed to record a payment. Failures are written
 *     to the order and surfaced in the admin instead.
 */

/** Statuses that mean a shipment already exists and must not be created twice. */
const ALREADY_SHIPPED = new Set(["pushed", "awb-assigned", "in-transit", "delivered", "rto"]);

export interface FulfilResult {
  ok: boolean;
  skipped?: "not-configured" | "not-paid" | "already-fulfilled" | "no-order";
  awbCode?: string;
  error?: string;
}

export async function fulfilOrder(orderNumber: string): Promise<FulfilResult> {
  if (!isOrderStoreConfigured()) return { ok: false, skipped: "not-configured" };

  if (!isShiprocketEnabled()) {
    // Not an error. Plenty of shops start by printing labels by hand, and the
    // admin lists every paid order with the address on it.
    return { ok: false, skipped: "not-configured" };
  }

  let order: StoredOrder | undefined;
  try {
    order = await getOrder(orderNumber);
  } catch (error) {
    console.error(`[fulfilment] could not read order ${orderNumber}:`, error);
    return { ok: false, error: "store-unreadable" };
  }

  if (!order) return { ok: false, skipped: "no-order" };

  // The gate that matters. Shipping is downstream of payment, never a way to
  // assert it.
  if (order.status !== "paid") return { ok: false, skipped: "not-paid" };

  if (order.fulfilmentStatus && ALREADY_SHIPPED.has(order.fulfilmentStatus)) {
    return { ok: true, skipped: "already-fulfilled", ...(order.awbCode && { awbCode: order.awbCode }) };
  }

  // Shiprocket needs a phone number to hand to the courier, and refuses without
  // one. Better to say so on the order than to fail obscurely at their end.
  if (!order.phone) {
    await safeRecord(orderNumber, {
      status: "failed",
      error: "No phone number on the order, and a courier cannot deliver without one.",
    });
    return { ok: false, error: "no-phone" };
  }

  const parcel = parcelForOrder(
    order.lines.map((line) => {
      const product = getCatalogProduct(line.sku);
      return {
        // A line whose product has been removed from the catalogue still has to
        // ship. Fall back to the smallest sensible box rather than dropping it.
        parcel: product
          ? parcelFor(product)
          : { weightKg: 0.5, lengthCm: 25, breadthCm: 20, heightCm: 10 },
        quantity: line.quantity,
      };
    }),
  );

  let shipmentId: number;
  let shiprocketOrderId: number;

  try {
    const created = await createShiprocketOrder({
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      name: order.name,
      email: order.email,
      phone: order.phone,
      address: order.shippingAddress,
      items: order.lines.map((line) => ({
        name: line.name,
        sku: line.sku,
        units: line.quantity,
        // Shiprocket prices in rupees, not paise. Getting this wrong would
        // declare a hundredfold value on the parcel, which matters for insurance
        // and for customs on anything crossing a border.
        sellingPrice: Math.round(line.unitPriceMinor / 100),
      })),
      subTotal: Math.round(order.totals.totalMinor / 100),
      parcel,
    });
    shipmentId = created.shipmentId;
    shiprocketOrderId = created.orderId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[fulfilment] Shiprocket push failed for ${orderNumber}:`, message);
    await safeRecord(orderNumber, { status: "failed", error: message.slice(0, 500) });
    return { ok: false, error: message };
  }

  // The shipment exists. Record that BEFORE assigning an AWB, so a failure in
  // the next call cannot make us push the same order again and create a second
  // shipment.
  await safeRecord(orderNumber, { status: "pushed", shiprocketOrderId, shipmentId });

  try {
    const awb = await assignAwb(shipmentId);
    await safeRecord(orderNumber, {
      status: "awb-assigned",
      shiprocketOrderId,
      shipmentId,
      awbCode: awb.awbCode,
      courierName: awb.courierName,
      trackingUrl: trackingUrlFor(awb.awbCode),
    });
    console.info(
      `[fulfilment] ${orderNumber} → ${awb.courierName} AWB ${awb.awbCode} (shipment ${shipmentId})`,
    );

    await sendDespatchEmail(orderNumber);
    return { ok: true, awbCode: awb.awbCode };
  } catch (error) {
    // A shipment without an AWB is recoverable — usually an unserviceable
    // pincode or an empty Shiprocket wallet — and is fixable from their
    // dashboard. The order keeps its shipment id so nobody pushes it twice.
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[fulfilment] AWB assignment failed for ${orderNumber}:`, message);
    await safeRecord(orderNumber, {
      status: "pushed",
      shiprocketOrderId,
      shipmentId,
      error: `Shipment created but no AWB: ${message}`.slice(0, 500),
    });
    return { ok: false, error: message };
  }
}

/* -------------------------------------------------------------------------
   Emails
   ------------------------------------------------------------------------- */

/**
 * The receipt. Sent once, on payment.
 *
 * Called from the payment webhook and from the confirmation endpoint, which race
 * each other routinely — `claimEmail` decides which one wins, so the customer
 * gets one receipt rather than two, and two receipts read as two charges.
 */
export async function sendConfirmationEmail(orderNumber: string): Promise<boolean> {
  if (!isOrderStoreConfigured()) return false;

  try {
    const order = await getOrder(orderNumber);
    if (!order || order.status !== "paid") return false;

    if (!(await claimEmail(orderNumber, "confirmation"))) return false;

    return await sendEmail(orderConfirmationEmail(order));
  } catch (error) {
    console.error(`[fulfilment] confirmation email for ${orderNumber} failed:`, error);
    return false;
  }
}

/** "It shipped, here is the tracking number." Sent once an AWB exists. */
export async function sendDespatchEmail(orderNumber: string): Promise<boolean> {
  if (!isOrderStoreConfigured()) return false;

  try {
    const order = await getOrder(orderNumber);
    if (!order) return false;

    const email = despatchEmail(order);
    // No AWB yet: nothing worth saying, and no claim spent. It will send when
    // the tracking number arrives.
    if (!email) return false;

    if (!(await claimEmail(orderNumber, "despatch"))) return false;

    return await sendEmail(email);
  } catch (error) {
    console.error(`[fulfilment] despatch email for ${orderNumber} failed:`, error);
    return false;
  }
}

/** Recording progress must never be the thing that throws. */
async function safeRecord(
  orderNumber: string,
  update: Parameters<typeof recordFulfilment>[1],
): Promise<void> {
  try {
    await recordFulfilment(orderNumber, update);
  } catch (error) {
    console.error(`[fulfilment] could not record fulfilment for ${orderNumber}:`, error);
  }
}

/**
 * Map a courier's status text onto ours.
 *
 * Couriers each have their own vocabulary and Shiprocket passes much of it
 * through, so this matches loosely on purpose and keeps the original string on
 * the order either way. An unrecognised status leaves the order where it is
 * rather than guessing — losing track of a parcel is better than claiming it was
 * delivered when it was not.
 */
export function mapCourierStatus(raw: string): "in-transit" | "delivered" | "rto" | "cancelled" | null {
  const status = raw.toLowerCase();

  if (status.includes("deliver") && !status.includes("undeliver") && !status.includes("out for"))
    return "delivered";
  if (status.includes("rto") || status.includes("return")) return "rto";
  if (status.includes("cancel")) return "cancelled";
  if (
    status.includes("transit") ||
    status.includes("picked") ||
    status.includes("shipped") ||
    status.includes("out for delivery") ||
    status.includes("dispatch")
  )
    return "in-transit";

  return null;
}
