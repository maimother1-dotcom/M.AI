"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { products } from "@/data/products";
import { categories } from "@/data/categories";
import { ProductCard } from "@/components/product/ProductCard";
import { Motif } from "@/components/brand/Motif";
import type { Product } from "@/lib/types";

/**
 * Client-side search.
 *
 * The whole catalog is 74 items and already in the bundle, so a server round
 * trip per keystroke would be slower and no more capable. Past a few hundred
 * SKUs this should move to a real index.
 */

/** Weighted scoring, so a name match outranks a mention in the care notes. */
function score(product: Product, terms: string[]): number {
  const haystacks: [string, number][] = [
    [product.name.toLowerCase(), 10],
    [product.subcategory.toLowerCase(), 6],
    [product.category.toLowerCase(), 5],
    [product.summary.toLowerCase(), 4],
    [product.materials.join(" ").toLowerCase(), 3],
    [product.colorways.map((c) => c.name).join(" ").toLowerCase(), 3],
    [product.story.toLowerCase(), 1],
  ];

  let total = 0;
  for (const term of terms) {
    let matchedThisTerm = false;
    for (const [text, weight] of haystacks) {
      if (text.includes(term)) {
        total += weight;
        matchedThisTerm = true;
        // A term matching the start of the name is a much stronger signal.
        if (weight === 10 && text.startsWith(term)) total += 8;
      }
    }
    // Every term must appear somewhere, or this is not a match at all.
    if (!matchedThisTerm) return 0;
  }
  return total;
}

const SUGGESTIONS = ["silk", "cashmere", "leather tote", "vermeil", "lipstick", "boots"];

export function SearchClient() {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 1);

    if (terms.length === 0) return [];

    return products
      .map((p) => ({ product: p, score: score(p, terms) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.product);
  }, [query]);

  const searching = query.trim().length > 1;

  return (
    <>
      <div className="mx-auto max-w-2xl">
        <label htmlFor="search" className="sr-only">
          Search the collection
        </label>
        <div className="relative">
          <input
            id="search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by piece, material or colour"
            autoFocus
            className="w-full border-b border-ink/25 bg-transparent py-5 pr-10 text-center font-display text-2xl outline-none transition-colors placeholder:text-ink-muted/60 focus:border-ink sm:text-3xl"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-0 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {!searching && (
          <div className="mt-8 text-center">
            <p className="eyebrow mb-4">Try</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setQuery(s)}
                  className="border border-line px-4 py-2 text-xs transition-colors hover:border-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {searching && (
        <div className="mt-16">
          {results.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Motif className="h-14 w-14 text-gold/50" />
              <p className="mt-6 font-display text-2xl">
                Nothing matches &ldquo;{query.trim()}&rdquo;
              </p>
              <p className="mt-2 max-w-sm text-sm text-ink-muted">
                We carry {products.length} pieces in total, so the collection is small on
                purpose. Try browsing a category instead.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-2">
                {categories.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/shop/${c.slug}`}
                    className="border border-line px-4 py-2 text-xs transition-colors hover:border-ink"
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <>
              <p className="mb-10 text-center text-xs text-ink-muted tabular">
                {results.length} {results.length === 1 ? "result" : "results"}
              </p>
              <div className="grid grid-cols-2 gap-x-5 gap-y-12 lg:grid-cols-4">
                {results.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
