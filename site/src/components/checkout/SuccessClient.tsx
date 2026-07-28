"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { ProductImage } from "@/components/product/ProductImage";
import { Motif, MotifDivider } from "@/components/brand/Motif";
import { ButtonLink } from "@/components/ui";
import { displayPrice } from "@/lib/currency";
import { getProductBySku } from "@/data/products";
import type { OrderTotals, PricedLine } from "@/lib/types";

const ORDER_KEY = "lindienne.order.v1";

interface ConfirmedOrder {
  orderNumber: string;
  createdAt: string;
  email: string;
  name: string;
  lines: PricedLine[];
  totals: OrderTotals;
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  shippingMethod: string;
  paymentMode: "demo" | "stripe";
  deliveryEstimate: string;
}

export function SuccessClient() {
  const searchParams = useSearchParams();
  const { clear } = useCart();

  const [order, setOrder] = useState<ConfirmedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function confirm() {
      // Stripe appends these on its redirect back.
      const paymentIntentId = searchParams.get("payment_intent");
      const orderToken =
        sessionStorage.getItem(ORDER_KEY) ??
        (() => {
          // The Stripe path never wrote ORDER_KEY, so fall back to the handoff.
          const raw = sessionStorage.getItem("lindienne.checkout.v1");
          if (!raw) return null;
          try {
            return (JSON.parse(raw) as { orderToken?: string }).orderToken ?? null;
          } catch {
            return null;
          }
        })();

      if (!orderToken) {
        if (!cancelled) {
          setError(
            "We could not find an order in this browser session. If you completed a payment, your confirmation email has the details.",
          );
          setLoading(false);
        }
        return;
      }

      try {
        const response = await fetch("/api/orders/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderToken, paymentIntentId }),
        });
        const data = await response.json();

        if (cancelled) return;

        if (!response.ok) {
          setError(data.message ?? "We could not verify this order.");
          setLoading(false);
          return;
        }

        setOrder(data);
        setLoading(false);

        // The order is confirmed — the bag and the session handoff are done with.
        clear();
        sessionStorage.removeItem(ORDER_KEY);
        sessionStorage.removeItem("lindienne.checkout.v1");
      } catch {
        if (!cancelled) {
          setError("Network error while confirming your order.");
          setLoading(false);
        }
      }
    }

    void confirm();
    return () => {
      cancelled = true;
    };
    // clear is stable from the provider; re-running this would double-confirm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  if (loading) {
    return (
      <div className="flex flex-col items-center py-28 text-center">
        <Motif className="h-14 w-14 animate-pulse text-gold/60" />
        <p className="mt-7 font-display text-2xl">Confirming your order…</p>
        <p className="mt-2 text-xs text-ink-muted">Verifying the payment with our processor.</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center py-24 text-center">
        <Motif className="h-14 w-14 text-madder/50" />
        <h1 className="mt-8 text-3xl">We could not confirm this order</h1>
        <p className="mt-4 text-pretty text-sm leading-relaxed text-ink-soft">{error}</p>
        <p className="mt-6 text-xs leading-relaxed text-ink-muted">
          This page verifies every order against our payment processor before showing it, so a
          receipt is never displayed for a payment that did not complete.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/cart">Back to bag</ButtonLink>
          <ButtonLink href="/contact" variant="secondary">
            Contact us
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-gold">
          <Motif className="h-9 w-9 text-gold" />
        </div>
        <p className="eyebrow mt-7">Order confirmed</p>
        <h1 className="mt-4 text-balance text-4xl sm:text-5xl">Thank you, {order.name.split(" ")[0]}.</h1>
        <p className="mt-5 text-pretty text-sm leading-relaxed text-ink-soft">
          Your order is placed and a confirmation is on its way to{" "}
          <span className="text-ink">{order.email}</span>. Everything is packed by hand in
          Kolkata, usually within one working day.
        </p>
        <MotifDivider className="mx-auto my-10 max-w-[220px]" />
      </header>

      {order.paymentMode === "demo" && (
        <p className="mb-8 border border-gold bg-gold/10 p-5 text-center text-xs leading-relaxed text-ink-soft">
          <span className="text-ink">Demo order.</span> This deployment has no payment keys, so
          nothing was charged and no card details were collected. The order record below is
          genuine and cryptographically signed — it simply has no payment attached.
        </p>
      )}

      {/* Facts */}
      <dl className="grid gap-6 border-y border-line py-8 sm:grid-cols-3">
        <div>
          <dt className="eyebrow">Order number</dt>
          <dd className="mt-2 font-display text-xl tabular">{order.orderNumber}</dd>
        </div>
        <div>
          <dt className="eyebrow">Estimated delivery</dt>
          <dd className="mt-2 font-display text-xl">{order.deliveryEstimate}</dd>
        </div>
        <div>
          <dt className="eyebrow">Delivering to</dt>
          <dd className="mt-2 text-sm leading-relaxed text-ink-soft">
            {order.shippingAddress.line1}
            {order.shippingAddress.line2 && <>, {order.shippingAddress.line2}</>}
            <br />
            {order.shippingAddress.city}, {order.shippingAddress.state}{" "}
            {order.shippingAddress.postalCode}
          </dd>
        </div>
      </dl>

      {/* Lines */}
      <ul className="divide-y divide-line">
        {order.lines.map((line) => {
          const product = getProductBySku(line.sku);
          return (
            <li key={`${line.sku}-${line.size}-${line.colorway}`} className="flex gap-5 py-6">
              <div className="relative aspect-[3/4] w-20 shrink-0 overflow-hidden bg-ivory-deep">
                {product && (
                  <ProductImage
                    id={product.id}
                    name={product.name}
                    category={product.category}
                    subcategory={product.subcategory}
                    image={product.image}
                    sizes="80px"
                  />
                )}
              </div>
              <div className="flex-1">
                <p className="font-display text-xl leading-tight">{line.name}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {line.colorway}
                  {line.size !== "One size" && ` · ${line.size}`} · Qty {line.quantity}
                </p>
              </div>
              <span className="shrink-0 text-sm tabular">
                {displayPrice(line.lineTotalMinor)}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Totals */}
      <div className="space-y-3 border-t border-line py-7 text-sm">
        <Row label="Subtotal" value={displayPrice(order.totals.subtotalMinor)} />
        {order.totals.discountMinor > 0 && (
          <Row label="Promotion" value={`− ${displayPrice(order.totals.discountMinor)}`} accent />
        )}
        <Row
          label="Shipping"
          value={
            order.totals.shippingMinor === 0
              ? "Complimentary"
              : displayPrice(order.totals.shippingMinor)
          }
        />
        <Row label="GST" value={displayPrice(order.totals.taxMinor)} />
        <div className="flex items-baseline justify-between border-t border-line pt-5">
          <span className="text-base">Total paid</span>
          <span className="font-display text-3xl tabular">
            {displayPrice(order.totals.totalMinor)}
          </span>
        </div>
        {order.totals.savingMinor > 0 && (
          <p className="pt-1 text-right text-xs text-madder tabular">
            You paid {displayPrice(order.totals.savingMinor)} less than boutique pricing.
          </p>
        )}
      </div>

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/shop">Continue shopping</ButtonLink>
        <ButtonLink href="/help/returns" variant="secondary">
          Returns policy
        </ButtonLink>
      </div>

      <p className="mt-10 text-center text-xs leading-relaxed text-ink-muted">
        Questions about this order? Email{" "}
        <Link href="/contact" className="link-underline">
          care@lindienne.com
        </Link>{" "}
        quoting {order.orderNumber}.
      </p>
    </div>
  );
}

function Row({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-ink-soft">{label}</span>
      <span className={`tabular ${accent ? "text-madder" : "text-ink"}`}>{value}</span>
    </div>
  );
}
