"use client";

import { useCart } from "@/components/cart/CartProvider";
import { getProduct } from "@/data/products";
import { ProductCard } from "@/components/product/ProductCard";
import { Motif } from "@/components/brand/Motif";
import { ButtonLink } from "@/components/ui";

export function WishlistClient() {
  const { wishlist, hydrated } = useCart();

  if (!hydrated) {
    return (
      <div className="grid grid-cols-2 gap-x-5 gap-y-12 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton aspect-[3/4] w-full" />
        ))}
      </div>
    );
  }

  // A slug can go stale if a product is retired between visits — drop it rather
  // than rendering a hole.
  const saved = wishlist.map(getProduct).filter((p) => p !== undefined);

  if (saved.length === 0) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <Motif className="h-16 w-16 text-gold/50" />
        <h2 className="mt-8 font-display text-3xl">Nothing saved yet</h2>
        <p className="mt-4 max-w-md text-pretty text-sm leading-relaxed text-ink-soft">
          Tap the heart on any piece to keep it here. Your wishlist lives in this browser
          only — we do not store it on our servers or attach it to your email.
        </p>
        <ButtonLink href="/shop" className="mt-9">
          Shop everything
        </ButtonLink>
      </div>
    );
  }

  return (
    <>
      <p className="mb-10 text-center text-xs text-ink-muted tabular">
        {saved.length} saved {saved.length === 1 ? "piece" : "pieces"}
      </p>
      <div className="grid grid-cols-2 gap-x-5 gap-y-12 lg:grid-cols-4">
        {saved.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </>
  );
}
