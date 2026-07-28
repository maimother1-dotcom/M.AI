"use client";

import { useMemo, useState } from "react";
import { ProductCard } from "@/components/product/ProductCard";
import { Motif } from "@/components/brand/Motif";
import { Button } from "@/components/ui";
import { savingPercent } from "@/lib/currency";
import type { Category, Product } from "@/lib/types";

type Sort = "featured" | "price-asc" | "price-desc" | "saving" | "rating" | "newest";

const SORTS: { value: Sort; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "saving", label: "Biggest saving" },
  { value: "rating", label: "Highest rated" },
];

const PRICE_BANDS = [
  { id: "under-2k", label: "Under ₹2,000", min: 0, max: 200000 },
  { id: "2k-5k", label: "₹2,000 – ₹5,000", min: 200000, max: 500000 },
  { id: "5k-10k", label: "₹5,000 – ₹10,000", min: 500000, max: 1000000 },
  { id: "over-10k", label: "Over ₹10,000", min: 1000000, max: Infinity },
];

export function ShopGrid({
  products,
  category,
  initialSub,
}: {
  products: Product[];
  /** Present on a category page; absent on /shop, where a category facet is shown instead. */
  category?: Category;
  initialSub?: string;
}) {
  const [sort, setSort] = useState<Sort>("featured");
  const [subs, setSubs] = useState<string[]>(initialSub ? [initialSub] : []);
  const [bands, setBands] = useState<string[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [colours, setColours] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Facet options are derived from the products actually on this page, so a
  // filter never offers a choice that returns nothing.
  const facets = useMemo(() => {
    const subMap = new Map<string, number>();
    const catMap = new Map<string, number>();
    const colourMap = new Map<string, { hex: string; count: number }>();

    for (const p of products) {
      subMap.set(p.subcategory, (subMap.get(p.subcategory) ?? 0) + 1);
      catMap.set(p.category, (catMap.get(p.category) ?? 0) + 1);
      for (const c of p.colorways) {
        const existing = colourMap.get(c.name);
        colourMap.set(c.name, { hex: c.hex, count: (existing?.count ?? 0) + 1 });
      }
    }

    return {
      subs: [...subMap.entries()].sort((a, b) => b[1] - a[1]),
      cats: [...catMap.entries()].sort((a, b) => b[1] - a[1]),
      colours: [...colourMap.entries()].sort((a, b) => b[1].count - a[1].count),
    };
  }, [products]);

  const filtered = useMemo(() => {
    let result = products;

    if (subs.length) result = result.filter((p) => subs.includes(p.subcategory));
    if (cats.length) result = result.filter((p) => cats.includes(p.category));
    if (colours.length) {
      result = result.filter((p) => p.colorways.some((c) => colours.includes(c.name)));
    }
    if (bands.length) {
      result = result.filter((p) =>
        bands.some((id) => {
          const band = PRICE_BANDS.find((b) => b.id === id);
          return band ? p.priceMinor >= band.min && p.priceMinor < band.max : false;
        }),
      );
    }

    const sorted = [...result];
    switch (sort) {
      case "price-asc":
        sorted.sort((a, b) => a.priceMinor - b.priceMinor);
        break;
      case "price-desc":
        sorted.sort((a, b) => b.priceMinor - a.priceMinor);
        break;
      case "saving":
        sorted.sort(
          (a, b) =>
            savingPercent(b.priceMinor, b.compareAtMinor) -
            savingPercent(a.priceMinor, a.compareAtMinor),
        );
        break;
      case "rating":
        sorted.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
        break;
      case "newest":
        sorted.sort(
          (a, b) => Number(b.badges.includes("new")) - Number(a.badges.includes("new")),
        );
        break;
      default:
        // Featured: badged pieces first, then by review volume.
        sorted.sort(
          (a, b) => b.badges.length - a.badges.length || b.reviewCount - a.reviewCount,
        );
    }
    return sorted;
  }, [products, subs, cats, colours, bands, sort]);

  const activeCount = subs.length + bands.length + cats.length + colours.length;

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function clearAll() {
    setSubs([]);
    setBands([]);
    setCats([]);
    setColours([]);
  }

  const filterPanel = (
    <div className="space-y-9">
      {!category && facets.cats.length > 1 && (
        <FacetGroup title="Category">
          {facets.cats.map(([slug, count]) => (
            <CheckRow
              key={slug}
              label={slug}
              count={count}
              checked={cats.includes(slug)}
              onChange={() => toggle(cats, setCats, slug)}
              capitalise
            />
          ))}
        </FacetGroup>
      )}

      {facets.subs.length > 1 && (
        <FacetGroup title={category ? "Type" : "Style"}>
          {facets.subs.map(([slug, count]) => {
            const label =
              category?.subcategories.find((s) => s.slug === slug)?.name ?? slug;
            return (
              <CheckRow
                key={slug}
                label={label}
                count={count}
                checked={subs.includes(slug)}
                onChange={() => toggle(subs, setSubs, slug)}
                capitalise
              />
            );
          })}
        </FacetGroup>
      )}

      <FacetGroup title="Price">
        {PRICE_BANDS.map((band) => {
          const count = products.filter(
            (p) => p.priceMinor >= band.min && p.priceMinor < band.max,
          ).length;
          if (count === 0) return null;
          return (
            <CheckRow
              key={band.id}
              label={band.label}
              count={count}
              checked={bands.includes(band.id)}
              onChange={() => toggle(bands, setBands, band.id)}
            />
          );
        })}
      </FacetGroup>

      <FacetGroup title="Colour">
        <div className="flex flex-wrap gap-2 pt-1">
          {facets.colours.map(([name, { hex }]) => {
            const active = colours.includes(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggle(colours, setColours, name)}
                aria-pressed={active}
                title={name}
                className={`flex items-center gap-2 border px-2.5 py-1.5 text-[11px] transition-colors ${
                  active ? "border-ink bg-ink text-ivory" : "border-line hover:border-ink/40"
                }`}
              >
                <span
                  className="h-3 w-3 rounded-full border border-black/10"
                  style={{ backgroundColor: hex }}
                />
                {name}
              </button>
            );
          })}
        </div>
      </FacetGroup>

      {activeCount > 0 && (
        <button
          type="button"
          onClick={clearAll}
          className="text-[11px] uppercase tracking-[0.16em] text-madder"
        >
          Clear all filters
        </button>
      )}
    </div>
  );

  return (
    <div className="grid gap-10 lg:grid-cols-[240px_1fr] lg:gap-12">
      {/* Desktop filter rail */}
      <aside className="hidden lg:block">
        <div className="sticky top-[calc(var(--nav-height)+2rem)]">
          <h2 className="eyebrow mb-7">Refine</h2>
          {filterPanel}
        </div>
      </aside>

      <div>
        {/* Toolbar */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
          <p className="text-xs text-ink-muted tabular">
            {filtered.length} {filtered.length === 1 ? "piece" : "pieces"}
            {activeCount > 0 && ` · ${activeCount} ${activeCount === 1 ? "filter" : "filters"}`}
          </p>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              className="lg:hidden"
              onClick={() => setFiltersOpen(true)}
            >
              Filter{activeCount > 0 ? ` (${activeCount})` : ""}
            </Button>

            <label className="flex items-center gap-2">
              <span className="eyebrow hidden sm:inline">Sort</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="cursor-pointer border border-line bg-transparent px-3 py-2 text-[11px] uppercase tracking-[0.12em] outline-none transition-colors hover:border-ink/40 focus:border-ink"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-24 text-center">
            <Motif className="h-14 w-14 text-gold/50" />
            <p className="mt-6 font-display text-2xl">Nothing matches that combination</p>
            <p className="mt-2 max-w-sm text-sm text-ink-muted">
              Try loosening one of the filters. We would rather show you nothing than show you
              something that is not what you asked for.
            </p>
            <Button variant="secondary" size="sm" className="mt-7" onClick={clearAll}>
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-5 gap-y-12 lg:grid-cols-3">
            {filtered.map((product, i) => (
              <ProductCard
                key={product.id}
                product={product}
                priority={i < 3}
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 28vw"
              />
            ))}
          </div>
        )}
      </div>

      {/* Mobile filter sheet */}
      <div className={`fixed inset-0 z-50 lg:hidden ${filtersOpen ? "" : "pointer-events-none"}`}>
        <div
          className={`absolute inset-0 bg-ink/40 transition-opacity duration-400 ${
            filtersOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setFiltersOpen(false)}
        />
        <div
          className={`absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto bg-ivory transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            filtersOpen ? "translate-y-0" : "translate-y-full"
          }`}
        >
          <div className="sticky top-0 flex items-center justify-between border-b border-line bg-ivory px-5 py-4">
            <h2 className="font-display text-2xl">Refine</h2>
            <button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="px-5 py-7">{filterPanel}</div>
          <div className="sticky bottom-0 border-t border-line bg-ivory px-5 py-4">
            <Button className="w-full" onClick={() => setFiltersOpen(false)}>
              Show {filtered.length} {filtered.length === 1 ? "piece" : "pieces"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FacetGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-4 text-[11px] uppercase tracking-[0.16em] text-ink">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function CheckRow({
  label,
  count,
  checked,
  onChange,
  capitalise = false,
}: {
  label: string;
  count: number;
  checked: boolean;
  onChange: () => void;
  capitalise?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm text-ink-soft transition-colors hover:text-ink">
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      <span
        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center border transition-colors ${
          checked ? "border-ink bg-ink" : "border-line"
        }`}
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="var(--color-ivory)" strokeWidth="2">
            <path d="m2 6 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className={`flex-1 ${capitalise ? "capitalize" : ""}`}>{label}</span>
      <span className="text-[11px] text-ink-muted tabular">{count}</span>
    </label>
  );
}
