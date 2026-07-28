import "server-only";
import fs from "node:fs";
import path from "node:path";
import { products as baseProducts } from "@/data/products";
import type { Badge, Product } from "@/lib/types";

/**
 * Catalog overrides.
 *
 * The catalog itself lives in `src/data/products.ts` and is version-controlled.
 * The admin does not rewrite that file — it records a small patch per product in
 * an overrides store, and reads merge the patch over the base.
 *
 * Why an overlay rather than a database table for products:
 *   - the source of truth stays in git, reviewable and revertable
 *   - a bad edit is a one-line delete, not a migration
 *   - the store is small enough to hold in memory, so reads stay synchronous
 *     and `priceCart()` does not have to become async
 *
 * WHERE IT PERSISTS, STATED PLAINLY. The default writes JSON to disk, which is
 * correct on a VPS or any single long-lived server. On Vercel and other
 * serverless platforms the filesystem is ephemeral AND per-instance: an edit
 * would survive until the instance recycles and would not be visible to other
 * instances. `describeStore()` reports which mode is active, and the admin UI
 * shows it, so nobody discovers this by losing a price change.
 *
 * To make it durable on serverless, implement the three functions marked
 * ADAPTER SEAM below against Postgres, Vercel KV or Upstash. Nothing else in
 * the codebase needs to change.
 */

/** The fields the admin is allowed to change. */
export interface ProductOverride {
  name?: string;
  summary?: string;
  priceMinor?: number;
  compareAtMinor?: number;
  stock?: number;
  badges?: Badge[];
  image?: string | null;
}

export type OverrideMap = Record<string, ProductOverride>;

const DATA_DIR = path.join(process.cwd(), "data");
const OVERRIDES_PATH = path.join(DATA_DIR, "catalog-overrides.json");

type StoreMode = "file" | "memory";

let mode: StoreMode | null = null;
let cache: OverrideMap | null = null;

/** Probe once whether the filesystem is actually writable here. */
function resolveMode(): StoreMode {
  if (mode) return mode;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.accessSync(DATA_DIR, fs.constants.W_OK);
    mode = "file";
  } catch {
    mode = "memory";
  }
  return mode;
}

/* ---------------------------------------------------- ADAPTER SEAM (read) */
function readAll(): OverrideMap {
  if (cache) return cache;

  if (resolveMode() === "file") {
    try {
      const raw = fs.readFileSync(OVERRIDES_PATH, "utf8");
      cache = JSON.parse(raw) as OverrideMap;
    } catch {
      // Missing or corrupt file: start clean rather than crashing the storefront.
      cache = {};
    }
  } else {
    cache = {};
  }
  return cache;
}

/* --------------------------------------------------- ADAPTER SEAM (write) */
function writeAll(next: OverrideMap): void {
  cache = next;
  if (resolveMode() !== "file") return;
  // Write to a temp file and rename, so a crash mid-write cannot leave a
  // truncated JSON file that takes the catalog down on next boot.
  const tmp = `${OVERRIDES_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  fs.renameSync(tmp, OVERRIDES_PATH);
}

/* -------------------------------------------------- ADAPTER SEAM (describe) */
export function describeStore(): { mode: StoreMode; durable: boolean; note: string } {
  const current = resolveMode();
  return {
    mode: current,
    durable: current === "file",
    note:
      current === "file"
        ? `Edits are written to data/catalog-overrides.json. Durable on a single server; commit the file to version it.`
        : `This filesystem is read-only, so edits live in memory only and are lost when the instance recycles. Wire a database into the adapter seam in src/lib/admin/store.ts before relying on this.`,
  };
}

/* -------------------------------------------------------------------------
   Reads
   ------------------------------------------------------------------------- */

function applyOverride(product: Product, override: ProductOverride | undefined): Product {
  if (!override) return product;
  return {
    ...product,
    ...(override.name !== undefined && { name: override.name }),
    ...(override.summary !== undefined && { summary: override.summary }),
    ...(override.priceMinor !== undefined && { priceMinor: override.priceMinor }),
    ...(override.compareAtMinor !== undefined && { compareAtMinor: override.compareAtMinor }),
    ...(override.stock !== undefined && { stock: override.stock }),
    ...(override.badges !== undefined && { badges: override.badges }),
    // null explicitly clears a photo and returns the product to generated art.
    ...(override.image !== undefined && { image: override.image ?? undefined }),
  };
}

let merged: Product[] | null = null;

/** The catalog as customers should see it. Server-side only. */
export function getCatalog(): Product[] {
  if (merged) return merged;
  const overrides = readAll();
  merged = baseProducts.map((p) => applyOverride(p, overrides[p.id]));
  return merged;
}

export function getCatalogProduct(id: string): Product | undefined {
  return getCatalog().find((p) => p.id === id);
}

export function getOverrides(): OverrideMap {
  return { ...readAll() };
}

/* -------------------------------------------------------------------------
   Writes
   ------------------------------------------------------------------------- */

export function saveOverride(productId: string, patch: ProductOverride): Product {
  if (!baseProducts.some((p) => p.id === productId)) {
    throw new Error(`Unknown product: ${productId}`);
  }

  const all = { ...readAll() };
  const next = { ...(all[productId] ?? {}), ...patch };

  // Drop keys that match the base value, so the overrides file only ever
  // records genuine differences and stays readable.
  const base = baseProducts.find((p) => p.id === productId)!;
  for (const key of Object.keys(next) as (keyof ProductOverride)[]) {
    const value = next[key];
    if (key === "badges") {
      if (JSON.stringify(value) === JSON.stringify(base.badges)) delete next[key];
    } else if (key === "image") {
      if ((value ?? undefined) === base.image) delete next[key];
    } else if (value === base[key as keyof Product]) {
      delete next[key];
    }
  }

  if (Object.keys(next).length === 0) delete all[productId];
  else all[productId] = next;

  writeAll(all);
  merged = null; // force a re-merge on next read
  return getCatalogProduct(productId)!;
}

export function clearOverride(productId: string): Product | undefined {
  const all = { ...readAll() };
  delete all[productId];
  writeAll(all);
  merged = null;
  return getCatalogProduct(productId);
}

/** Drop every override. Used by the tests, and by "reset all" in the UI. */
export function clearAllOverrides(): void {
  writeAll({});
  merged = null;
}

/* -------------------------------------------------------------------------
   Catalog helpers, override-aware.

   These mirror the ones in `src/data/products.ts`, but read the merged catalog.
   Server Components must use THESE — importing straight from the data module
   renders committed prices while checkout charges the edited one, which is the
   single worst bug this feature could ship.
   ------------------------------------------------------------------------- */

export function getCatalogBySlug(slug: string): Product | undefined {
  return getCatalog().find((p) => p.slug === slug);
}

export function getCatalogByCategory(category: string): Product[] {
  return getCatalog().filter((p) => p.category === category);
}

export function getCatalogBadged(badge: string, limit = 8): Product[] {
  return getCatalog()
    .filter((p) => p.badges.includes(badge as never))
    .slice(0, limit);
}

export function getCatalogRelated(product: Product, limit = 4): Product[] {
  const all = getCatalog();
  const sameSub = all.filter(
    (p) => p.id !== product.id && p.category === product.category && p.subcategory === product.subcategory,
  );
  const sameCat = all.filter(
    (p) => p.id !== product.id && p.category === product.category && p.subcategory !== product.subcategory,
  );
  return [...sameSub, ...sameCat].slice(0, limit);
}
