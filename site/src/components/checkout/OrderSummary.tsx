"use client";

import { ProductImage } from "@/components/product/ProductImage";
import { displayPrice } from "@/lib/currency";
import type { CartEntry } from "@/components/cart/CartProvider";
import type { OrderTotals, ShippingMethod } from "@/lib/types";

/**
 * The order summary rail.
 *
 * `totals` comes from the server quote endpoint. Until it arrives the money
 * lines show a skeleton rather than a locally computed guess — showing one
 * number and charging another is how a checkout loses trust.
 */
export function OrderSummary({
  entries,
  totals,
  loading,
  shippingMethod,
  compact = false,
}: {
  entries: CartEntry[];
  totals: OrderTotals | null;
  loading: boolean;
  shippingMethod: ShippingMethod;
  compact?: boolean;
}) {
  return (
    <div className="border border-line">
      <div className="border-b border-line px-6 py-5">
        <h2 className="font-display text-2xl">Order summary</h2>
        <p className="mt-1 text-[11px] text-ink-muted">
          {entries.reduce((n, e) => n + e.quantity, 0)} items
        </p>
      </div>

      {!compact && (
        <ul className="max-h-[320px] divide-y divide-line overflow-y-auto px-6">
          {entries.map((entry) => (
            <li key={`${entry.sku}-${entry.size}-${entry.colorway}`} className="flex gap-4 py-4">
              <div className="relative aspect-[3/4] w-14 shrink-0 overflow-hidden bg-ivory-deep">
                <ProductImage
                  id={entry.product.id}
                  name={entry.product.name}
                  category={entry.product.category}
                  subcategory={entry.product.subcategory}
                  image={entry.product.image}
                  sizes="56px"
                />
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[10px] text-ivory tabular">
                  {entry.quantity}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-base leading-tight">
                  {entry.product.name}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  {entry.colorway}
                  {entry.size !== "One size" && ` · ${entry.size}`}
                </p>
              </div>
              <span className="shrink-0 text-sm tabular">
                {displayPrice(entry.lineTotalMinor)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3 border-t border-line px-6 py-5 text-sm">
        {loading || !totals ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-4 w-full" />
            ))}
          </div>
        ) : (
          <>
            <Row label="Subtotal" value={displayPrice(totals.subtotalMinor)} />

            {totals.savingMinor > 0 && (
              <Row
                label="Against boutique pricing"
                value={`− ${displayPrice(totals.savingMinor)}`}
                accent
              />
            )}

            {totals.discountMinor > 0 && (
              <Row label="Promotion" value={`− ${displayPrice(totals.discountMinor)}`} accent />
            )}

            <Row
              label={`Shipping · ${shippingMethod === "express" ? "Express" : "Standard"}`}
              value={
                totals.shippingMinor === 0 ? "Complimentary" : displayPrice(totals.shippingMinor)
              }
            />

            <Row label="GST" value={displayPrice(totals.taxMinor)} />

            <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
              <span className="text-base">Total</span>
              <span className="font-display text-3xl tabular">
                {displayPrice(totals.totalMinor)}
              </span>
            </div>

            <p className="pt-1 text-[10px] text-ink-muted">Inclusive of all taxes.</p>
          </>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-ink-soft">{label}</span>
      <span className={`tabular ${accent ? "text-madder" : "text-ink"}`}>{value}</span>
    </div>
  );
}
