"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { displayPrice } from "@/lib/currency";

/**
 * Looking up your own order.
 *
 * Deliberately not an account. Accounts mean passwords to store, resets to
 * secure and a database of people; an order number and the email it was placed
 * with is the same proof for this purpose and leaves nothing to steal.
 */

interface LookupResult {
  orderNumber: string;
  placedAt: string;
  status: string;
  fulfilmentStatus: string;
  courierName: string | null;
  awbCode: string | null;
  trackingUrl: string | null;
  courierStatus: string | null;
  deliveryEstimate: string;
  shippingMethod: string;
  lines: { name: string; quantity: number; size: string; colorway: string; lineTotalMinor: number }[];
  totals: {
    subtotalMinor: number;
    discountMinor: number;
    shippingMinor: number;
    taxMinor: number;
    totalMinor: number;
  };
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  invoiceNumber: string | null;
  invoiceToken: string | null;
}

/** Plain words for each state, because "awb-assigned" means nothing to a customer. */
const STAGE: Record<string, string> = {
  unfulfilled: "We are getting it ready",
  pushed: "Packed and waiting for the courier",
  "awb-assigned": "Handed to the courier",
  "in-transit": "On its way",
  delivered: "Delivered",
  rto: "Returning to us",
  cancelled: "Cancelled",
  failed: "Held up — we are on it",
};

export function TrackOrder() {
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/orders/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: orderNumber.trim(), email: email.trim() }),
      });
      const data = await response.json();
      if (response.ok) setResult(data as LookupResult);
      else setError(data?.message ?? "We could not look that up.");
    } catch {
      setError("We could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="mt-10 grid gap-6 sm:max-w-lg">
        <div>
          <label htmlFor="orderNumber" className="eyebrow mb-2 block">
            Order number
          </label>
          <input
            id="orderNumber"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
            placeholder="LI-XXXX-XXXX"
            autoComplete="off"
            required
            className="w-full border-b border-line bg-transparent py-2.5 font-mono text-sm outline-none transition-colors focus:border-ink"
          />
        </div>

        <div>
          <label htmlFor="email" className="eyebrow mb-2 block">
            Email used at checkout
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            className="w-full border-b border-line bg-transparent py-2.5 text-sm outline-none transition-colors focus:border-ink"
          />
        </div>

        <Button type="submit" size="lg" disabled={busy} className="justify-self-start">
          {busy ? "Looking…" : "Find my order"}
        </Button>
      </form>

      {error && (
        <p role="alert" className="mt-6 max-w-lg text-sm leading-relaxed text-madder">
          {error}
        </p>
      )}

      {result && <Result result={result} />}
    </>
  );
}

function Result({ result }: { result: LookupResult }) {
  const paid = result.status === "paid";

  return (
    <section className="mt-14 border-t border-line pt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="eyebrow">Order</p>
          <p className="mt-1 font-mono text-lg">{result.orderNumber}</p>
        </div>
        <p className="text-xs text-ink-muted">
          Placed{" "}
          {new Date(result.placedAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      <p className="mt-8 font-display text-2xl">
        {paid ? STAGE[result.fulfilmentStatus] ?? "In progress" : "Awaiting payment"}
      </p>

      {paid && result.fulfilmentStatus !== "delivered" && (
        <p className="mt-2 text-sm text-ink-soft">
          Estimated delivery {result.deliveryEstimate}.
        </p>
      )}

      {result.courierStatus && (
        <p className="mt-2 text-sm text-ink-soft">
          Latest from the courier: {result.courierStatus}
        </p>
      )}

      {result.trackingUrl && (
        <a
          href={result.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-block border border-ink px-6 py-3 text-[11px] uppercase tracking-[0.16em] transition-colors hover:bg-ink hover:text-ivory"
        >
          Track with {result.courierName ?? "the courier"}
        </a>
      )}

      {result.awbCode && (
        <p className="mt-3 text-xs text-ink-muted">
          Tracking number <span className="font-mono">{result.awbCode}</span>
        </p>
      )}

      <div className="mt-12 grid gap-10 sm:grid-cols-2">
        <div>
          <p className="eyebrow mb-4">Your order</p>
          <ul className="space-y-3 text-sm">
            {result.lines.map((line) => (
              <li key={`${line.name}-${line.size}-${line.colorway}`} className="flex gap-4">
                <span className="tabular text-ink-muted">{line.quantity}×</span>
                <span className="flex-1">
                  {line.name}
                  <span className="block text-xs text-ink-muted">
                    {line.size} · {line.colorway}
                  </span>
                </span>
                <span className="tabular">{displayPrice(line.lineTotalMinor)}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-5 space-y-1.5 border-t border-line pt-4 text-sm">
            <Row label="Subtotal" value={displayPrice(result.totals.subtotalMinor)} />
            {result.totals.discountMinor > 0 && (
              <Row label="Discount" value={`−${displayPrice(result.totals.discountMinor)}`} />
            )}
            <Row
              label="Shipping"
              value={
                result.totals.shippingMinor === 0
                  ? "Complimentary"
                  : displayPrice(result.totals.shippingMinor)
              }
            />
            <Row label="Includes GST" value={displayPrice(result.totals.taxMinor)} />
            <div className="flex justify-between border-t border-line pt-3 font-medium">
              <dt>Total</dt>
              <dd className="tabular">{displayPrice(result.totals.totalMinor)}</dd>
            </div>
          </dl>
        </div>

        <div>
          <p className="eyebrow mb-4">Delivering to</p>
          <address className="text-sm not-italic leading-relaxed text-ink-soft">
            {result.shippingAddress.line1}
            <br />
            {result.shippingAddress.line2 && (
              <>
                {result.shippingAddress.line2}
                <br />
              </>
            )}
            {result.shippingAddress.city}, {result.shippingAddress.state}{" "}
            {result.shippingAddress.postalCode}
          </address>

          {result.invoiceToken && (
            <>
              <p className="eyebrow mb-3 mt-8">Invoice</p>
              <a
                href={`/orders/invoice?t=${encodeURIComponent(result.invoiceToken)}`}
                className="link-underline text-sm"
              >
                {result.invoiceNumber ?? "View invoice"}
              </a>
              <p className="mt-2 text-xs text-ink-muted">
                Opens for the next thirty minutes. Look your order up again for a fresh link.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
