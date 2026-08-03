import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AdminNav } from "@/components/admin/AdminNav";
import { FulfilButton } from "@/components/admin/FulfilButton";
import { ReturnPanel } from "@/components/admin/ReturnPanel";
import { ADMIN_COOKIE, isAdminEnabled, readSession } from "@/lib/admin/auth";
import {
  countExpiredOrders,
  describeOrderStore,
  listOrders,
  retentionDays,
  type StoredOrder,
} from "@/lib/order-store";
import { displayPrice } from "@/lib/currency";
import { isEmailConfigured } from "@/lib/email";
import { signOrderAccess } from "@/lib/order-access";
import { isShiprocketEnabled } from "@/lib/shiprocket";
import { isReturnsEnabled, listReturns } from "@/lib/returns";
import { Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Orders",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

/** Fulfilment states where a shipment already exists, so nothing needs pushing. */
const SHIPPED = new Set(["pushed", "awb-assigned", "in-transit", "delivered", "rto", "cancelled"]);

const STATUS_STYLE: Record<StoredOrder["status"], string> = {
  paid: "border-celadon bg-celadon/20 text-ink",
  pending: "border-gold bg-gold/15 text-ink",
  failed: "border-madder/40 bg-madder/10 text-madder",
  refunded: "border-line bg-ivory-deep text-ink-soft",
  cancelled: "border-line bg-ivory-deep text-ink-muted",
};

export default async function AdminOrdersPage() {
  if (!isAdminEnabled()) notFound();

  const store = await cookies();
  if (!readSession(store.get(ADMIN_COOKIE)?.value)) {
    redirect("/admin/login");
  }

  const info = await describeOrderStore();
  let orders: StoredOrder[] = [];
  let readError: string | null = null;
  try {
    orders = await listOrders();
  } catch {
    readError =
      "The order store could not be decrypted. This almost always means ORDER_SIGNING_SECRET changed since these orders were written. The file is intact — restore the original secret and they will read again.";
  }

  const paid = orders.filter((o) => o.status === "paid");
  const revenueMinor = paid.reduce((sum, o) => sum + o.totals.totalMinor, 0);
  const shiprocketOn = isShiprocketEnabled();
  const emailOn = isEmailConfigured();
  const expired = readError ? 0 : await countExpiredOrders();
  const toShip = paid.filter((o) => !SHIPPED.has(o.fulfilmentStatus ?? "unfulfilled")).length;

  // One query for every return, grouped here, rather than one per order row.
  const returnsByOrder = new Map<string, Awaited<ReturnType<typeof listReturns>>>();
  if (isReturnsEnabled() && !readError) {
    for (const record of await listReturns()) {
      const list = returnsByOrder.get(record.orderNumber) ?? [];
      list.push(record);
      returnsByOrder.set(record.orderNumber, list);
    }
  }

  return (
    <Container className="py-12 lg:py-16">
      <AdminNav current="orders" />

      <h1 className="mt-8 font-display text-4xl">Orders</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">{info.note}</p>
      <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-muted">
        {emailOn
          ? "Confirmation and despatch emails are being sent."
          : "Email is not configured, so customers get no confirmation. Set RESEND_API_KEY and EMAIL_FROM."}
        {" "}Personal data is kept for {retentionDays()} days, then deleted; nothing runs on a
        timer until you point one at <code>/api/admin/retention</code>.{" "}
        {expired > 0 && `${expired} order${expired === 1 ? " is" : "s are"} past that now.`}
      </p>

      {readError && (
        <p className="mt-6 border border-madder/40 bg-madder/5 p-5 text-sm leading-relaxed text-ink-soft">
          {readError}
        </p>
      )}

      {!readError && orders.length > 0 && (
        <dl className="mt-8 flex flex-wrap gap-x-12 gap-y-4">
          {[
            { label: "Orders", value: String(orders.length) },
            { label: "Paid", value: String(paid.length) },
            { label: "Paid revenue", value: displayPrice(revenueMinor) },
            { label: "Awaiting despatch", value: String(toShip) },
          ].map((stat) => (
            <div key={stat.label}>
              <dt className="eyebrow">{stat.label}</dt>
              <dd className="mt-1.5 font-display text-2xl tabular">{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {!readError && orders.length === 0 && (
        <p className="mt-10 border border-line bg-ivory-deep p-8 text-sm text-ink-soft">
          No orders yet. One appears here the moment a customer reaches the payment step, as
          <span className="mx-1 font-medium">pending</span>, and turns
          <span className="mx-1 font-medium">paid</span> when the processor confirms it.
        </p>
      )}

      {orders.length > 0 && (
        <div className="mt-10 divide-y divide-line border-y border-line">
          {orders.map((order) => (
            <details key={order.orderNumber} className="group">
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-5 gap-y-2 py-5 marker:content-['']">
                <span
                  className={`shrink-0 border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] ${STATUS_STYLE[order.status]}`}
                >
                  {order.status}
                </span>
                <span className="font-mono text-sm tabular">{order.orderNumber}</span>
                <span className="text-sm text-ink-soft">{order.name}</span>
                <span className="ml-auto text-sm tabular">
                  {displayPrice(order.totals.totalMinor)}
                </span>
                <span className="w-full text-xs text-ink-muted sm:w-auto sm:min-w-[150px] sm:text-right">
                  {new Date(order.createdAt).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </summary>

              <div className="grid gap-8 pb-8 sm:grid-cols-2 lg:grid-cols-3">
                <section>
                  <p className="eyebrow mb-3">Deliver to</p>
                  <address className="text-sm not-italic leading-relaxed text-ink-soft">
                    {order.name}
                    <br />
                    {order.shippingAddress.line1}
                    <br />
                    {order.shippingAddress.line2 && (
                      <>
                        {order.shippingAddress.line2}
                        <br />
                      </>
                    )}
                    {order.shippingAddress.city}, {order.shippingAddress.state}{" "}
                    {order.shippingAddress.postalCode}
                    <br />
                    {order.shippingAddress.country}
                  </address>
                  <p className="mt-3 text-sm text-ink-soft">
                    {order.email}
                    {order.phone && (
                      <>
                        <br />
                        {order.phone}
                      </>
                    )}
                  </p>
                </section>

                <section>
                  <p className="eyebrow mb-3">Fulfilment</p>
                  {order.status !== "paid" ? (
                    <p className="text-sm text-ink-muted">Nothing ships until it is paid.</p>
                  ) : (
                    <>
                      <dl className="space-y-1.5 text-sm text-ink-soft">
                        <Row label="Status" value={order.fulfilmentStatus ?? "unfulfilled"} />
                        {order.courierName && <Row label="Courier" value={order.courierName} />}
                        {order.awbCode && <Row label="AWB" value={order.awbCode} />}
                        {order.courierStatus && (
                          <Row label="Last scan" value={order.courierStatus} />
                        )}
                      </dl>

                      {order.trackingUrl && (
                        <a
                          href={order.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link-underline mt-3 inline-block text-xs"
                        >
                          Track this parcel
                        </a>
                      )}

                      {order.fulfilmentError && (
                        <p className="mt-3 border border-madder/40 bg-madder/5 p-3 text-xs leading-relaxed text-ink-soft">
                          {order.fulfilmentError}
                        </p>
                      )}

                      {shiprocketOn && !SHIPPED.has(order.fulfilmentStatus ?? "unfulfilled") && (
                        <FulfilButton
                          orderNumber={order.orderNumber}
                          label={order.fulfilmentStatus === "failed" ? "Retry courier push" : "Push to courier"}
                        />
                      )}
                      {shiprocketOn && order.fulfilmentStatus === "pushed" && !order.awbCode && (
                        <FulfilButton orderNumber={order.orderNumber} label="Assign AWB" />
                      )}
                    </>
                  )}
                </section>

                <section>
                  <p className="eyebrow mb-3">Payment</p>
                  <dl className="space-y-1.5 text-sm text-ink-soft">
                    <Row label="Processor" value={order.paymentMode} />
                    {order.paymentMethod && <Row label="Method" value={order.paymentMethod} />}
                    {order.paymentId && <Row label="Payment id" value={order.paymentId} />}
                    {order.paymentIntentId && (
                      <Row label="Order id" value={order.paymentIntentId} />
                    )}
                    {order.invoiceNumber && <Row label="Invoice" value={order.invoiceNumber} />}
                    {order.paidAt && (
                      <Row
                        label="Paid at"
                        value={new Date(order.paidAt).toLocaleString("en-IN")}
                      />
                    )}
                    {order.failureReason && <Row label="Failure" value={order.failureReason} />}
                    <Row label="Shipping" value={order.shippingMethod} />
                    {order.appliedPromo && <Row label="Promo" value={order.appliedPromo} />}
                  </dl>

                  {order.status === "paid" && (
                    <a
                      href={`/orders/invoice?t=${encodeURIComponent(signOrderAccess(order.orderNumber))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-underline mt-3 inline-block text-xs"
                    >
                      {order.invoiceNumber ? "View invoice" : "Preview invoice"}
                    </a>
                  )}
                </section>

                <section className="sm:col-span-2 lg:col-span-1">
                  <p className="eyebrow mb-3">Items</p>
                  <ul className="space-y-2.5 text-sm text-ink-soft">
                    {order.lines.map((line) => (
                      <li key={`${line.sku}-${line.size}-${line.colorway}`} className="flex gap-3">
                        <span className="tabular">{line.quantity}×</span>
                        <span className="flex-1">
                          {line.name}
                          <span className="block text-xs text-ink-muted">
                            {line.sku} · {line.size} · {line.colorway}
                          </span>
                        </span>
                        <span className="tabular">{displayPrice(line.lineTotalMinor)}</span>
                      </li>
                    ))}
                  </ul>
                  <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm text-ink-soft">
                    <Row label="Subtotal" value={displayPrice(order.totals.subtotalMinor)} />
                    {order.totals.discountMinor > 0 && (
                      <Row label="Discount" value={`−${displayPrice(order.totals.discountMinor)}`} />
                    )}
                    <Row label="Shipping" value={displayPrice(order.totals.shippingMinor)} />
                    <Row label="Includes GST" value={displayPrice(order.totals.taxMinor)} />
                    <Row label="Total" value={displayPrice(order.totals.totalMinor)} />
                  </dl>
                </section>

                {isReturnsEnabled() && order.status !== "pending" && (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <ReturnPanel
                      orderNumber={order.orderNumber}
                      orderLines={order.lines.map((line) => ({
                        sku: line.sku,
                        name: line.name,
                        quantity: line.quantity,
                        size: line.size,
                        colorway: line.colorway,
                      }))}
                      returns={returnsByOrder.get(order.orderNumber) ?? []}
                    />
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </Container>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3">
      <dt className="text-xs uppercase tracking-[0.1em] text-ink-muted">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}

