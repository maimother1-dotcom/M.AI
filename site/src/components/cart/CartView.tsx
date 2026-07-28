"use client";

import Link from "next/link";
import { useCart } from "@/components/cart/CartProvider";
import { ProductImage } from "@/components/product/ProductImage";
import { Motif, MotifDivider } from "@/components/brand/Motif";
import { ButtonLink } from "@/components/ui";
import { displayPrice } from "@/lib/currency";
import { FREE_SHIPPING_THRESHOLD, amountToFreeShipping } from "@/lib/pricing";

export function CartView() {
  const { entries, subtotalMinor, compareAtSubtotalMinor, setQuantity, remove, hydrated } =
    useCart();

  // Until localStorage has been read there is nothing meaningful to draw.
  // Rendering "empty" first and then swapping is worse than a brief skeleton.
  if (!hydrated) {
    return (
      <div className="grid gap-12 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-36 w-full" />
          ))}
        </div>
        <div className="skeleton h-72 w-full" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <Motif className="h-16 w-16 text-gold/50" />
        <h1 className="mt-8 text-3xl sm:text-4xl">Your bag is empty</h1>
        <p className="mt-4 max-w-md text-pretty text-sm leading-relaxed text-ink-soft">
          Nothing in it yet. Everything we make is built to be worn for years rather than
          seasons, which tends to mean fewer decisions rather than more.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/shop">Shop everything</ButtonLink>
          <ButtonLink href="/editorial" variant="secondary">
            Read the journal
          </ButtonLink>
        </div>
      </div>
    );
  }

  const saving = compareAtSubtotalMinor - subtotalMinor;
  const toFree = amountToFreeShipping(subtotalMinor);
  const progress = Math.min(100, (subtotalMinor / FREE_SHIPPING_THRESHOLD) * 100);

  return (
    <>
      <header className="mb-12 text-center">
        <p className="eyebrow mb-4">Step one of three</p>
        <h1 className="text-4xl sm:text-5xl">Your bag</h1>
        <MotifDivider className="mx-auto mt-7 max-w-[200px]" />
      </header>

      <div className="grid gap-12 lg:grid-cols-[1fr_380px] lg:gap-16">
        {/* Lines */}
        <div>
          <ul className="divide-y divide-line border-y border-line">
            {entries.map((entry) => (
              <li
                key={`${entry.sku}-${entry.size}-${entry.colorway}`}
                className="flex gap-5 py-7 sm:gap-7"
              >
                <Link
                  href={`/product/${entry.product.slug}`}
                  className="relative aspect-[3/4] w-24 shrink-0 overflow-hidden bg-ivory-deep sm:w-32"
                >
                  <ProductImage
                    id={entry.product.id}
                    name={entry.product.name}
                    category={entry.product.category}
                    subcategory={entry.product.subcategory}
                    image={entry.product.image}
                    sizes="128px"
                  />
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Link
                        href={`/product/${entry.product.slug}`}
                        className="font-display text-xl leading-tight hover:text-madder sm:text-2xl"
                      >
                        {entry.product.name}
                      </Link>
                      <p className="mt-1.5 text-xs text-ink-muted">
                        {entry.colorway}
                        {entry.size !== "One size" && ` · Size ${entry.size}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(entry.sku, entry.size, entry.colorway)}
                      className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-ink-muted transition-colors hover:text-madder"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-5">
                    <div className="inline-flex items-center border border-line">
                      <button
                        type="button"
                        onClick={() =>
                          setQuantity(entry.sku, entry.size, entry.colorway, entry.quantity - 1)
                        }
                        aria-label="Decrease quantity"
                        className="px-3.5 py-2 text-ink-muted transition-colors hover:text-ink"
                      >
                        −
                      </button>
                      <span className="min-w-8 text-center text-sm tabular">{entry.quantity}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setQuantity(entry.sku, entry.size, entry.colorway, entry.quantity + 1)
                        }
                        aria-label="Increase quantity"
                        className="px-3.5 py-2 text-ink-muted transition-colors hover:text-ink"
                      >
                        +
                      </button>
                    </div>

                    <div className="text-right">
                      <p className="text-base tabular">{displayPrice(entry.lineTotalMinor)}</p>
                      {entry.lineCompareAtMinor > entry.lineTotalMinor && (
                        <p className="text-xs text-ink-muted line-through tabular">
                          {displayPrice(entry.lineCompareAtMinor)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <Link
            href="/shop"
            className="mt-8 inline-block text-[11px] uppercase tracking-[0.16em] text-ink-soft hover:text-ink"
          >
            ← Continue shopping
          </Link>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-[calc(var(--nav-height)+2rem)] lg:self-start">
          <div className="border border-line p-7">
            <h2 className="font-display text-2xl">Summary</h2>

            <div className="mt-6 space-y-3 text-sm">
              <Row label="Subtotal" value={displayPrice(subtotalMinor)} />
              {saving > 0 && (
                <Row
                  label="Against boutique pricing"
                  value={`− ${displayPrice(saving)}`}
                  accent
                />
              )}
              <Row
                label="Shipping"
                value={toFree === 0 ? "Complimentary" : "Calculated at checkout"}
                muted
              />
              <Row label="Tax" value="Calculated at checkout" muted />
            </div>

            <div className="mt-6 border-t border-line pt-5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm">Estimated total</span>
                <span className="font-display text-3xl tabular">
                  {displayPrice(subtotalMinor)}
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                Final tax and shipping are computed on our server at the next step. The figure
                you are charged is always the one we calculate, never one sent from this page.
              </p>
            </div>

            {toFree > 0 && (
              <div className="mt-6 border-t border-line pt-5">
                <p className="mb-2.5 text-[11px] text-ink-soft">
                  Add <span className="tabular text-ink">{displayPrice(toFree)}</span> for
                  complimentary shipping
                </p>
                <div className="h-px w-full bg-line">
                  <div
                    className="h-px bg-gold transition-all duration-700"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <ButtonLink href="/checkout" size="lg" className="mt-7 w-full">
              Checkout
            </ButtonLink>

            <ul className="mt-6 space-y-2 text-[11px] text-ink-muted">
              <li>Thirty-day returns, return courier paid</li>
              <li>Two-year repair on making faults</li>
              <li>Card details go straight to our payment processor</li>
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  muted = false,
  accent = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-ink-soft">{label}</span>
      <span
        className={`tabular ${accent ? "text-madder" : muted ? "text-xs text-ink-muted" : "text-ink"}`}
      >
        {value}
      </span>
    </div>
  );
}
