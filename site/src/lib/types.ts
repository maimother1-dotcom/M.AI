export type CategorySlug =
  | "clothing"
  | "bags"
  | "shoes"
  | "jewellery"
  | "beauty"
  | "accessories";

export interface Category {
  slug: CategorySlug;
  name: string;
  /** Shown under the name in the mega-menu and on the category hero. */
  tagline: string;
  /** Long-form copy for the category page. */
  intro: string;
  subcategories: { slug: string; name: string }[];
  /** Drives the generated art palette for this category's tile. */
  artSeed: number;
}

export interface Colorway {
  name: string;
  /** Hex used for the swatch dot and to tint the generated product art. */
  hex: string;
}

export type Badge = "new" | "bestseller" | "last-few" | "editors-pick";

export interface Product {
  id: string;
  slug: string;
  name: string;
  category: CategorySlug;
  subcategory: string;

  /** Our price, in minor units of the base currency. */
  priceMinor: number;
  /**
   * What a comparable piece costs in a boutique, in minor units.
   *
   * This is the number the whole proposition rests on, so it is never a
   * competitor's price and never a named brand — it is the typical retail for
   * this construction, material and finish. Keep it honest.
   */
  compareAtMinor: number;

  colorways: Colorway[];
  sizes: string[];
  materials: string[];

  /** One-line hook, used on cards. */
  summary: string;
  /** Editorial paragraph, used on the product page. */
  story: string;
  details: string[];
  care: string[];

  badges: Badge[];
  rating: number;
  reviewCount: number;

  /**
   * Optional real photograph. When absent, `<ProductImage>` renders generated
   * editorial art derived from `id`. Drop a path in here (or a remote URL, once
   * its host is whitelisted in next.config.ts) and the photo takes over.
   */
  image?: string;

  /** Units on hand. Drives the "last few" treatment and caps checkout quantity. */
  stock: number;

  /**
   * Net quantity, for the Legal Metrology declaration.
   *
   * Only measured goods need this — beauty products carry a volume or weight.
   * Garments, footwear and accessories fall back to a count ("1 piece",
   * "1 pair") via `defaultNetQuantity()`, which is the correct declaration for
   * them under the rules.
   */
  netQuantity?: string;

  /**
   * Month and year of packing as "MM/YYYY", for the Legal Metrology
   * declaration. Falls back to `COMPLIANCE.defaultPackedOn` when unset, which is
   * the right shape for a catalogue packed in runs rather than continuously.
   */
  packedOn?: string;
}

export interface EditorialStory {
  slug: string;
  title: string;
  dek: string;
  category: string;
  readMinutes: number;
  publishedAt: string;
  /** Paragraphs. A string starting with "## " renders as a subheading. */
  body: string[];
  /** Product slugs to merchandise alongside the story. */
  featuredProducts: string[];
  artSeed: number;
}

export interface Review {
  id: string;
  productSlug: string;
  author: string;
  location: string;
  rating: number;
  title: string;
  body: string;
  date: string;
  verified: boolean;
}

/* -------------------------------------------------------------------------
   Cart and orders
   ------------------------------------------------------------------------- */

/**
 * What the browser stores and sends.
 *
 * Note what is absent: price. The client has no say in what anything costs.
 * The server re-derives every amount from the catalog at checkout time.
 */
export interface CartLine {
  sku: string;
  quantity: number;
  size: string;
  colorway: string;
}

/** A cart line after the server has priced it. */
export interface PricedLine extends CartLine {
  productSlug: string;
  name: string;
  unitPriceMinor: number;
  unitCompareAtMinor: number;
  lineTotalMinor: number;
  lineCompareAtMinor: number;
  image?: string;
  productId: string;
}

export type ShippingMethod = "standard" | "express";

export interface OrderTotals {
  subtotalMinor: number;
  compareAtSubtotalMinor: number;
  savingMinor: number;
  discountMinor: number;
  shippingMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export interface PricedCart {
  lines: PricedLine[];
  totals: OrderTotals;
  currency: string;
  appliedPromo: string | null;
}
