"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { ProductImage } from "@/components/product/ProductImage";
import { Button, Price, ProductBadge, Stars } from "@/components/ui";
import { displayPrice, savingPercent } from "@/lib/currency";
import { FREE_SHIPPING_THRESHOLD } from "@/lib/limits";
import type { Product } from "@/lib/types";

export function BuyBox({ product }: { product: Product }) {
  const { add, toggleWishlist, inWishlist, hydrated } = useCart();

  const [colorIndex, setColorIndex] = useState(0);
  const [size, setSize] = useState<string | null>(
    product.sizes.length === 1 ? product.sizes[0]! : null,
  );
  const [sizeError, setSizeError] = useState(false);
  const [added, setAdded] = useState(false);
  const [openPanel, setOpenPanel] = useState<string | null>("details");

  const colorway = product.colorways[colorIndex]!;
  const saving = savingPercent(product.priceMinor, product.compareAtMinor);
  const saved = hydrated && inWishlist(product.slug);
  const needsSize = product.sizes.length > 1;

  function addToBag() {
    if (needsSize && !size) {
      setSizeError(true);
      return;
    }
    setSizeError(false);
    add({
      sku: product.id,
      quantity: 1,
      size: size ?? product.sizes[0]!,
      colorway: colorway.name,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
      {/* Gallery. One generated plate per colourway, so switching colour changes
          the image rather than just a swatch outline. */}
      <div className="lg:sticky lg:top-[calc(var(--nav-height)+2rem)] lg:self-start">
        <div className="relative aspect-[3/4] overflow-hidden bg-ivory-deep">
          <ProductImage
            id={`${product.id}-${colorIndex}`}
            name={`${product.name} in ${colorway.name}`}
            category={product.category}
            subcategory={product.subcategory}
            image={product.image}
            tint={colorIndex > 0 ? colorway.hex : undefined}
            priority
            sizes="(max-width: 1024px) 100vw, 45vw"
          />
          {product.badges.length > 0 && (
            <div className="absolute left-4 top-4 flex flex-col items-start gap-2">
              {product.badges.map((badge) => (
                <ProductBadge key={badge} badge={badge} />
              ))}
            </div>
          )}
        </div>

        {product.colorways.length > 1 && (
          <div className="mt-3 grid grid-cols-4 gap-3">
            {product.colorways.map((c, i) => (
              <button
                key={c.name}
                type="button"
                onClick={() => setColorIndex(i)}
                aria-label={`View ${c.name}`}
                aria-pressed={i === colorIndex}
                className={`relative aspect-[3/4] overflow-hidden border-2 transition-colors ${
                  i === colorIndex ? "border-ink" : "border-transparent hover:border-line"
                }`}
              >
                <ProductImage
                  id={`${product.id}-${i}`}
                  name={c.name}
                  category={product.category}
            subcategory={product.subcategory}
                  tint={i > 0 ? c.hex : undefined}
                  sizes="120px"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Buy column */}
      <div>
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-ink-muted">
            <li>
              <Link href="/shop" className="hover:text-ink">
                Shop
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href={`/shop/${product.category}`} className="capitalize hover:text-ink">
                {product.category}
              </Link>
            </li>
          </ol>
        </nav>

        <h1 className="text-balance text-3xl leading-tight sm:text-4xl lg:text-[2.75rem]">
          {product.name}
        </h1>

        <p className="mt-3 text-pretty text-base text-ink-soft">{product.summary}</p>

        <div className="mt-5 flex items-center gap-3">
          <Stars rating={product.rating} />
          <span className="text-xs text-ink-muted tabular">
            {product.rating} · {product.reviewCount} reviews
          </span>
        </div>

        <div className="mt-7">
          <Price
            priceMinor={product.priceMinor}
            compareAtMinor={product.compareAtMinor}
            size="lg"
          />
          {saving > 0 && (
            <p className="mt-2.5 text-xs text-ink-muted">
              Typical boutique price for this construction:{" "}
              <span className="tabular">{displayPrice(product.compareAtMinor)}</span>. You save{" "}
              <span className="text-madder tabular">
                {displayPrice(product.compareAtMinor - product.priceMinor)}
              </span>
              .
            </p>
          )}
        </div>

        {/* Colourway */}
        <div className="mt-9">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="eyebrow">Colour</span>
            <span className="text-xs text-ink-soft">{colorway.name}</span>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {product.colorways.map((c, i) => (
              <button
                key={c.name}
                type="button"
                onClick={() => setColorIndex(i)}
                aria-label={c.name}
                aria-pressed={i === colorIndex}
                className={`h-9 w-9 rounded-full border-2 p-0.5 transition-all ${
                  i === colorIndex ? "border-ink" : "border-transparent hover:border-line"
                }`}
              >
                <span
                  className="block h-full w-full rounded-full border border-black/10"
                  style={{ backgroundColor: c.hex }}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Size */}
        {needsSize && (
          <div className="mt-8">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="eyebrow">Size</span>
              <Link href="/help/size-guide" className="link-underline text-[11px] text-ink-soft">
                Size guide
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSize(s);
                    setSizeError(false);
                  }}
                  aria-pressed={size === s}
                  className={`min-w-[3.25rem] border px-4 py-2.5 text-xs transition-colors ${
                    size === s
                      ? "border-ink bg-ink text-ivory"
                      : "border-line hover:border-ink/50"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            {sizeError && (
              <p role="alert" className="mt-2.5 text-xs text-madder">
                Choose a size to continue.
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-9 flex gap-3">
          <Button onClick={addToBag} size="lg" className="flex-1" disabled={product.stock === 0}>
            {product.stock === 0 ? "Sold out" : added ? "Added to bag ✓" : "Add to bag"}
          </Button>
          <button
            type="button"
            onClick={() => toggleWishlist(product.slug)}
            aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
            aria-pressed={saved}
            className="flex w-14 shrink-0 items-center justify-center border border-ink/25 transition-colors hover:border-ink"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill={saved ? "var(--color-madder)" : "none"}
              stroke={saved ? "var(--color-madder)" : "currentColor"}
              strokeWidth="1.3"
            >
              <path d="M12 20.5S3.5 15 3.5 8.9A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.5 1.9c0 6.1-8.5 11.6-8.5 11.6Z" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {product.stock <= 10 && product.stock > 0 && (
          <p className="mt-3 text-xs text-madder">
            Only {product.stock} left. We make in small runs.
          </p>
        )}

        <p className="mt-5 text-xs leading-relaxed text-ink-muted">
          Complimentary shipping over {displayPrice(FREE_SHIPPING_THRESHOLD)} · Thirty-day
          returns · Two-year repair on making faults
        </p>

        {/* Accordions */}
        <div className="mt-11 border-t border-line">
          <Accordion
            id="story"
            title="The making of it"
            open={openPanel === "story"}
            onToggle={setOpenPanel}
          >
            <p className="text-pretty leading-relaxed">{product.story}</p>
          </Accordion>

          <Accordion
            id="details"
            title="Details"
            open={openPanel === "details"}
            onToggle={setOpenPanel}
          >
            <ul className="space-y-2.5">
              {product.details.map((d) => (
                <li key={d} className="flex gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </Accordion>

          <Accordion
            id="materials"
            title="Materials"
            open={openPanel === "materials"}
            onToggle={setOpenPanel}
          >
            <ul className="space-y-2.5">
              {product.materials.map((m) => (
                <li key={m} className="flex gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </Accordion>

          <Accordion id="care" title="Care" open={openPanel === "care"} onToggle={setOpenPanel}>
            <ul className="space-y-2.5">
              {product.care.map((c) => (
                <li key={c} className="flex gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </Accordion>

          <Accordion
            id="shipping"
            title="Shipping & returns"
            open={openPanel === "shipping"}
            onToggle={setOpenPanel}
          >
            <p className="leading-relaxed">
              Standard delivery is five to eight working days and complimentary over{" "}
              {displayPrice(FREE_SHIPPING_THRESHOLD)}. Express is two to three working days.
              Returns are accepted for thirty days on unworn pieces with tags attached, and we
              pay the return courier. Beauty is returnable unopened only, for hygiene reasons.
            </p>
          </Accordion>
        </div>
      </div>
    </div>
  );
}

function Accordion({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: (id: string | null) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-line">
      <button
        type="button"
        onClick={() => onToggle(open ? null : id)}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-5 text-left"
      >
        <span className="text-[11px] uppercase tracking-[0.16em]">{title}</span>
        <span className="relative h-3 w-3 shrink-0">
          <span className="absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 bg-ink" />
          <span
            className={`absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-ink transition-transform duration-400 ${
              open ? "scale-y-0" : "scale-y-100"
            }`}
          />
        </span>
      </button>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="pb-6 text-sm text-ink-soft">{children}</div>
        </div>
      </div>
    </div>
  );
}
