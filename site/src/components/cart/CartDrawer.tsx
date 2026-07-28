"use client";

import Link from "next/link";
import { useCart } from "@/components/cart/CartProvider";
import { ProductImage } from "@/components/product/ProductImage";
import { Motif } from "@/components/brand/Motif";
import { ButtonLink } from "@/components/ui";
import { displayPrice } from "@/lib/currency";
import { FREE_SHIPPING_THRESHOLD, amountToFreeShipping } from "@/lib/pricing";

export function CartDrawer() {
  const { isOpen, closeCart, entries, subtotalMinor, compareAtSubtotalMinor, setQuantity, remove } =
    useCart();

  const toFree = amountToFreeShipping(subtotalMinor);
  const progress = Math.min(100, (subtotalMinor / FREE_SHIPPING_THRESHOLD) * 100);
  const saving = compareAtSubtotalMinor - subtotalMinor;

  return (
    <div className={`fixed inset-0 z-50 ${isOpen ? "" : "pointer-events-none"}`} aria-hidden={!isOpen}>
      <div
        className={`absolute inset-0 bg-ink/40 backdrop-blur-[2px] transition-opacity duration-500 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={closeCart}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Shopping bag"
        className={`absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-ivory shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between border-b border-line px-6 py-5">
          <h2 className="font-display text-2xl">Your bag</h2>
          <button type="button" onClick={closeCart} aria-label="Close bag" className="text-ink-muted hover:text-ink">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {entries.length > 0 && (
          <div className="border-b border-line px-6 py-4">
            <p className="mb-2.5 text-[11px] tracking-wide text-ink-soft">
              {toFree > 0 ? (
                <>
                  Add <span className="text-ink tabular">{displayPrice(toFree)}</span> for
                  complimentary shipping
                </>
              ) : (
                <span className="text-madder">Complimentary shipping unlocked</span>
              )}
            </p>
            <div className="h-px w-full bg-line">
              <div
                className="h-px bg-gold transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6">
          {entries.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-16 text-center">
              <Motif className="h-14 w-14 text-gold/50" />
              <p className="mt-6 font-display text-2xl">Your bag is empty</p>
              <p className="mt-2 max-w-[24ch] text-sm text-ink-muted">
                Everything here was made to be worn for years, not seasons.
              </p>
              <ButtonLink href="/shop" variant="secondary" size="sm" className="mt-8" onClick={closeCart}>
                Start shopping
              </ButtonLink>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {entries.map((entry) => (
                <li key={`${entry.sku}-${entry.size}-${entry.colorway}`} className="flex gap-4 py-5">
                  <Link
                    href={`/product/${entry.product.slug}`}
                    onClick={closeCart}
                    className="relative aspect-[3/4] w-20 shrink-0 overflow-hidden bg-ivory-deep"
                  >
                    <ProductImage
                      id={entry.product.id}
                      name={entry.product.name}
                      category={entry.product.category}
                      subcategory={entry.product.subcategory}
                      image={entry.product.image}
                      sizes="80px"
                    />
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/product/${entry.product.slug}`}
                        onClick={closeCart}
                        className="font-display text-lg leading-tight hover:text-madder"
                      >
                        {entry.product.name}
                      </Link>
                      <button
                        type="button"
                        onClick={() => remove(entry.sku, entry.size, entry.colorway)}
                        aria-label={`Remove ${entry.product.name}`}
                        className="mt-1 shrink-0 text-ink-muted transition-colors hover:text-madder"
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
                          <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>

                    <p className="mt-1 text-xs text-ink-muted">
                      {entry.colorway}
                      {entry.size !== "One size" && ` · ${entry.size}`}
                    </p>

                    <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                      <div className="inline-flex items-center border border-line">
                        <button
                          type="button"
                          onClick={() =>
                            setQuantity(entry.sku, entry.size, entry.colorway, entry.quantity - 1)
                          }
                          className="px-2.5 py-1 text-sm text-ink-muted transition-colors hover:text-ink"
                          aria-label="Decrease quantity"
                        >
                          −
                        </button>
                        <span className="min-w-6 text-center text-xs tabular">{entry.quantity}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setQuantity(entry.sku, entry.size, entry.colorway, entry.quantity + 1)
                          }
                          className="px-2.5 py-1 text-sm text-ink-muted transition-colors hover:text-ink"
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-sm tabular">{displayPrice(entry.lineTotalMinor)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {entries.length > 0 && (
          <footer className="border-t border-line px-6 py-5">
            {saving > 0 && (
              <div className="mb-3 flex items-center justify-between text-xs">
                <span className="text-ink-muted">Against boutique pricing</span>
                <span className="text-madder tabular">You save {displayPrice(saving)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between">
              <span className="text-sm">Subtotal</span>
              <span className="font-display text-2xl tabular">{displayPrice(subtotalMinor)}</span>
            </div>
            <p className="mt-1.5 text-[11px] text-ink-muted">
              Taxes and shipping are calculated at checkout.
            </p>

            <ButtonLink href="/checkout" size="md" className="mt-5 w-full" onClick={closeCart}>
              Checkout
            </ButtonLink>
            <ButtonLink href="/cart" variant="ghost" size="sm" className="mt-2 w-full" onClick={closeCart}>
              View full bag
            </ButtonLink>
          </footer>
        )}
      </aside>
    </div>
  );
}
