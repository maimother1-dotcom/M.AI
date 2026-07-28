"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { ProductImage } from "@/components/product/ProductImage";
import { Price, ProductBadge, Stars } from "@/components/ui";
import type { Product } from "@/lib/types";

export function ProductCard({
  product,
  priority = false,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
}: {
  product: Product;
  priority?: boolean;
  sizes?: string;
}) {
  const { add, toggleWishlist, inWishlist, hydrated } = useCart();
  const [colorIndex, setColorIndex] = useState(0);
  const [quickAdding, setQuickAdding] = useState(false);

  const colorway = product.colorways[colorIndex] ?? product.colorways[0]!;
  const singleSize = product.sizes.length === 1;
  const saved = hydrated && inWishlist(product.slug);

  function quickAdd() {
    // Only offered where there is no size to choose. Anything with a size grid
    // sends the customer to the product page, because guessing their size for
    // them is how returns happen.
    if (!singleSize) return;
    add({
      sku: product.id,
      quantity: 1,
      size: product.sizes[0]!,
      colorway: colorway.name,
    });
    setQuickAdding(true);
    setTimeout(() => setQuickAdding(false), 1200);
  }

  return (
    <article className="group relative">
      <div className="relative aspect-[3/4] overflow-hidden bg-ivory-deep">
        <Link href={`/product/${product.slug}`} className="absolute inset-0" aria-label={product.name}>
          <div className="h-full w-full transition-transform duration-[1.1s] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.05]">
            <ProductImage
              id={product.id}
              name={product.name}
              category={product.category}
              subcategory={product.subcategory}
              image={product.image}
              tint={colorIndex > 0 ? colorway.hex : undefined}
              priority={priority}
              sizes={sizes}
            />
          </div>
        </Link>

        {/* Badges */}
        {product.badges.length > 0 && (
          <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-1.5">
            {product.badges.slice(0, 2).map((badge) => (
              <ProductBadge key={badge} badge={badge} />
            ))}
          </div>
        )}

        {/* Wishlist */}
        <button
          type="button"
          onClick={() => toggleWishlist(product.slug)}
          aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name}`}
          aria-pressed={saved}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center bg-ivory/85 backdrop-blur-sm transition-colors hover:bg-ivory"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill={saved ? "var(--color-madder)" : "none"}
            stroke={saved ? "var(--color-madder)" : "currentColor"}
            strokeWidth="1.3"
            aria-hidden="true"
          >
            <path d="M12 20.5S3.5 15 3.5 8.9A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.5 1.9c0 6.1-8.5 11.6-8.5 11.6Z" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Quick add — slides up on hover, and is always reachable by keyboard. */}
        {singleSize && (
          <div className="absolute inset-x-0 bottom-0 translate-y-full opacity-0 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-y-0 group-hover:opacity-100 focus-within:translate-y-0 focus-within:opacity-100">
            <button
              type="button"
              onClick={quickAdd}
              className="w-full bg-ink/92 py-3 text-[10px] uppercase tracking-[0.18em] text-ivory backdrop-blur-sm transition-colors hover:bg-madder"
            >
              {quickAdding ? "Added to bag" : "Quick add"}
            </button>
          </div>
        )}

        {product.stock <= 10 && product.stock > 0 && (
          <span className="pointer-events-none absolute bottom-3 left-3 bg-ivory/90 px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-madder backdrop-blur-sm">
            Only {product.stock} left
          </span>
        )}
      </div>

      <div className="pt-4">
        {/* Colourway swatches */}
        {product.colorways.length > 1 && (
          <div className="mb-2.5 flex items-center gap-1.5">
            {product.colorways.slice(0, 5).map((c, i) => (
              <button
                key={c.name}
                type="button"
                onClick={() => setColorIndex(i)}
                onMouseEnter={() => setColorIndex(i)}
                aria-label={`View in ${c.name}`}
                aria-pressed={i === colorIndex}
                className={`h-3 w-3 rounded-full border transition-all ${
                  i === colorIndex ? "border-ink scale-110" : "border-line"
                }`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
            {product.colorways.length > 5 && (
              <span className="text-[10px] text-ink-muted">+{product.colorways.length - 5}</span>
            )}
          </div>
        )}

        <h3 className="font-display text-lg leading-tight">
          <Link href={`/product/${product.slug}`} className="transition-colors hover:text-madder">
            {product.name}
          </Link>
        </h3>

        <p className="mt-1 line-clamp-1 text-xs text-ink-muted">{product.summary}</p>

        <div className="mt-2.5 flex items-center gap-2">
          <Stars rating={product.rating} />
          <span className="text-[11px] text-ink-muted tabular">({product.reviewCount})</span>
        </div>

        <div className="mt-2.5">
          <Price
            priceMinor={product.priceMinor}
            compareAtMinor={product.compareAtMinor}
            size="sm"
          />
        </div>
      </div>
    </article>
  );
}
