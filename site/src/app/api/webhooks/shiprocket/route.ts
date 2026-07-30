import { NextResponse } from "next/server";
import { mapCourierStatus } from "@/lib/fulfilment";
import {
  getOrder,
  getOrderByShipmentId,
  isOrderStoreConfigured,
  recordFulfilment,
} from "@/lib/order-store";
import { trackingUrlFor, verifyWebhookToken } from "@/lib/shiprocket";

/**
 * Shiprocket status updates.
 *
 * Configure it at Settings → API → Webhooks in the Shiprocket dashboard, with
 * the same token you put in SHIPROCKET_WEBHOOK_TOKEN.
 *
 * A word on how much this endpoint trusts its input. Shiprocket authenticates
 * with a shared token in `x-api-key` rather than an HMAC over the body, which
 * proves the sender knows a secret but says nothing about whether the body was
 * modified in flight. So this handler is written to be harmless even if the body
 * is a lie: it only ever moves a parcel's status. It cannot mark an order paid,
 * it cannot change what anything cost, and it cannot create an order that does
 * not already exist. The worst a forged body with a stolen token achieves is a
 * wrong delivery status on one order, which a human notices.
 */

export const runtime = "nodejs";

/** Deliveries already handled, so a redelivery is a no-op. */
const processed = new Set<string>();
const MAX_TRACKED = 5000;

export async function POST(request: Request) {
  if (!process.env.SHIPROCKET_WEBHOOK_TOKEN) {
    return NextResponse.json(
      { error: "NOT_CONFIGURED", message: "Webhooks are not enabled on this deployment." },
      { status: 503 },
    );
  }

  if (!verifyWebhookToken(request.headers.get("x-api-key"))) {
    console.error("[shiprocket-webhook] token verification failed");
    return NextResponse.json({ error: "UNAUTHORISED" }, { status: 401 });
  }

  let event: {
    order_id?: string;
    shipment_id?: number | string;
    awb?: string;
    courier_name?: string;
    current_status?: string;
    "current-status"?: string;
    scans?: unknown[];
  };
  try {
    event = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  // Shiprocket has shipped both spellings of this field over the years.
  const rawStatus = event.current_status ?? event["current-status"] ?? "";
  const shipmentId = Number(event.shipment_id);
  const orderId = typeof event.order_id === "string" ? event.order_id : null;

  if (!rawStatus) {
    // Nothing to record. Acknowledge so they stop retrying.
    return NextResponse.json({ received: true, ignored: "no status" });
  }

  const key = `${orderId ?? shipmentId}:${rawStatus}`;
  if (processed.has(key)) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (processed.size > MAX_TRACKED) processed.clear();
  processed.add(key);

  if (!isOrderStoreConfigured()) {
    return NextResponse.json({ received: true, ignored: "no store" });
  }

  // `order_id` is our own order number, because that is what we sent when we
  // created the shipment. The shipment id is the fallback.
  let order = orderId ? await getOrder(orderId) : undefined;
  if (!order && Number.isFinite(shipmentId)) {
    order = await getOrderByShipmentId(shipmentId);
  }

  if (!order) {
    console.warn(
      `[shiprocket-webhook] status "${rawStatus}" for unknown order ${orderId ?? shipmentId}`,
    );
    // Still a 200: retrying will not make the order exist.
    return NextResponse.json({ received: true, ignored: "unknown order" });
  }

  const mapped = mapCourierStatus(rawStatus);
  console.info(
    `[shiprocket-webhook] ${order.orderNumber}: "${rawStatus}"${mapped ? ` → ${mapped}` : " (unmapped)"}`,
  );

  const awb = typeof event.awb === "string" && event.awb ? event.awb : undefined;

  await recordFulfilment(order.orderNumber, {
    // An unrecognised courier status leaves our status alone rather than
    // guessing. The verbatim string is still recorded, so nothing is lost.
    status: mapped ?? order.fulfilmentStatus ?? "pushed",
    courierStatus: rawStatus,
    ...(awb && { awbCode: awb, trackingUrl: trackingUrlFor(awb) }),
    ...(typeof event.courier_name === "string" && { courierName: event.courier_name }),
  });

  return NextResponse.json({ received: true });
}
