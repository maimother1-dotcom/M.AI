import { getCatalogProduct } from "@/lib/admin/store";
import { BASE_CURRENCY, CURRENCIES } from "@/lib/currency";
import {
  MAX_LINES_PER_CART,
  MAX_QUANTITY_PER_LINE,
  FREE_SHIPPING_THRESHOLD,
  amountToFreeShipping,
} from "@/lib/limits";
import type {
  CartLine,
  CategorySlug,
  OrderTotals,
  PricedCart,
  PricedLine,
  ShippingMethod,
} from "@/lib/types";

/**
 * THE PRICING AUTHORITY.
 *
 * Everything the customer pays is computed here, on the server, from the
 * catalog. The browser sends `{sku, quantity, size, colorway}` and nothing else
 * that costs money. If a request arrives carrying a price, a discount, a total,
 * or a tax figure, it is ignored — not validated against, ignored.
 *
 * The rule this enforces: a client-side check is a convenience for honest users.
 * It is never the thing standing between an attacker and free merchandise.
 */

// Re-exported so server-side callers have one import site. Defined in
// lib/limits.ts because Client Components need them too and must not import
// this module (it reaches the server-only override store).
export { MAX_QUANTITY_PER_LINE, MAX_LINES_PER_CART, FREE_SHIPPING_THRESHOLD, amountToFreeShipping };

/**
 * GST by category, in basis points. India charges different rates by HSN class,
 * and quoting one flat rate would make every invoice wrong.
 */
const TAX_BPS: Record<CategorySlug, number> = {
  clothing: 1200,
  bags: 1800,
  shoes: 1800,
  jewellery: 300,
  beauty: 1800,
  accessories: 1800,
};

/* -------------------------------------------------------------------------
   Promotions
   ------------------------------------------------------------------------- */

interface Promo {
  code: string;
  /** Percentage off the subtotal, in basis points. 1000 = 10%. */
  percentBps: number;
  description: string;
  minSubtotalMinor: number;
  /** Absent means no expiry. */
  expiresAt?: string;
}

/**
 * Promo definitions live on the server only. The client can send a code string;
 * it can never send a discount amount.
 */
const PROMOS: Promo[] = [
  {
    code: "MAISON10",
    percentBps: 1000,
    description: "10% off your first order",
    minSubtotalMinor: 0,
  },
  {
    code: "INDIENNE15",
    percentBps: 1500,
    description: "15% off orders over ₹10,000",
    minSubtotalMinor: 1000000,
  },
  {
    code: "PARIS1686",
    percentBps: 2000,
    description: "20% off orders over ₹25,000",
    minSubtotalMinor: 2500000,
  },
];

export function findPromo(code: string | null | undefined): Promo | null {
  if (!code) return null;
  const normalised = code.trim().toUpperCase();
  const promo = PROMOS.find((p) => p.code === normalised);
  if (!promo) return null;
  if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) return null;
  return promo;
}

export function listPromos() {
  return PROMOS.map(({ code, description, minSubtotalMinor }) => ({
    code,
    description,
    minSubtotalMinor,
  }));
}

/* -------------------------------------------------------------------------
   Errors
   ------------------------------------------------------------------------- */

export class CartError extends Error {
  constructor(
    message: string,
    readonly code:
      | "UNKNOWN_SKU"
      | "EMPTY_CART"
      | "TOO_MANY_LINES"
      | "INVALID_QUANTITY"
      | "INVALID_VARIANT"
      | "OUT_OF_STOCK",
    readonly sku?: string,
  ) {
    super(message);
    this.name = "CartError";
  }
}

/* -------------------------------------------------------------------------
   The pricing pass
   ------------------------------------------------------------------------- */

export interface PriceCartInput {
  lines: CartLine[];
  shippingMethod: ShippingMethod;
  promoCode?: string | null;
}

export function priceCart({
  lines,
  shippingMethod,
  promoCode,
}: PriceCartInput): PricedCart {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new CartError("Your bag is empty.", "EMPTY_CART");
  }
  if (lines.length > MAX_LINES_PER_CART) {
    throw new CartError("Too many items in one order.", "TOO_MANY_LINES");
  }

  const pricedLines: PricedLine[] = [];
  let subtotalMinor = 0;
  let compareAtSubtotalMinor = 0;
  let taxMinor = 0;

  for (const line of lines) {
    // 1. The SKU must exist in OUR catalog. A fabricated SKU cannot be priced.
    const product = getCatalogProduct(line.sku);
    if (!product) {
      throw new CartError(`We no longer carry one of these items.`, "UNKNOWN_SKU", line.sku);
    }

    // 2. Quantity is clamped, not trusted. Non-integers and negatives are rejected
    //    outright rather than coerced, because a negative quantity in a total is
    //    a refund the attacker wrote themselves.
    const qty = line.quantity;
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QUANTITY_PER_LINE) {
      throw new CartError(
        `Quantity must be between 1 and ${MAX_QUANTITY_PER_LINE}.`,
        "INVALID_QUANTITY",
        line.sku,
      );
    }

    // 3. The variant must be one this product actually comes in. Otherwise the
    //    warehouse gets an order for a size that does not exist.
    if (!product.sizes.includes(line.size)) {
      throw new CartError(`That size is not available.`, "INVALID_VARIANT", line.sku);
    }
    if (!product.colorways.some((c) => c.name === line.colorway)) {
      throw new CartError(`That colour is not available.`, "INVALID_VARIANT", line.sku);
    }

    // 4. Stock check.
    if (product.stock < qty) {
      throw new CartError(
        product.stock === 0
          ? `${product.name} has just sold out.`
          : `Only ${product.stock} of ${product.name} left.`,
        "OUT_OF_STOCK",
        line.sku,
      );
    }

    // 5. Price comes from the catalog. Full stop. Whatever the request said is
    //    not consulted, because there is nothing here to consult it against.
    const unitPriceMinor = product.priceMinor;
    const unitCompareAtMinor = product.compareAtMinor;
    const lineTotalMinor = unitPriceMinor * qty;
    const lineCompareAtMinor = unitCompareAtMinor * qty;

    subtotalMinor += lineTotalMinor;
    compareAtSubtotalMinor += lineCompareAtMinor;

    pricedLines.push({
      sku: line.sku,
      productId: product.id,
      productSlug: product.slug,
      name: product.name,
      quantity: qty,
      size: line.size,
      colorway: line.colorway,
      unitPriceMinor,
      unitCompareAtMinor,
      lineTotalMinor,
      lineCompareAtMinor,
      image: product.image,
    });
  }

  // 6. Discount, from the server's own promo table.
  const promo = findPromo(promoCode);
  const promoApplies = promo !== null && subtotalMinor >= promo.minSubtotalMinor;
  const discountMinor = promoApplies
    ? Math.round((subtotalMinor * promo.percentBps) / 10000)
    : 0;

  const discountedSubtotal = subtotalMinor - discountMinor;

  // 7. Tax, per line, on the discounted value — apportioned so the sum of the
  //    parts equals the whole rather than drifting by a paisa.
  for (const line of pricedLines) {
    const product = getCatalogProduct(line.sku);
    if (!product) continue;
    const share = subtotalMinor === 0 ? 0 : line.lineTotalMinor / subtotalMinor;
    const taxableValue = discountedSubtotal * share;
    taxMinor += Math.round((taxableValue * TAX_BPS[product.category]) / 10000);
  }

  // 8. Shipping. Free over the threshold on standard; express always charges.
  const currencyConfig = CURRENCIES[BASE_CURRENCY];
  let shippingMinor: number;
  if (shippingMethod === "express") {
    shippingMinor = currencyConfig.expressShipping;
  } else {
    shippingMinor =
      discountedSubtotal >= currencyConfig.freeShippingAbove
        ? 0
        : currencyConfig.standardShipping;
  }

  const totalMinor = discountedSubtotal + taxMinor + shippingMinor;

  const totals: OrderTotals = {
    subtotalMinor,
    compareAtSubtotalMinor,
    savingMinor: compareAtSubtotalMinor - subtotalMinor,
    discountMinor,
    shippingMinor,
    taxMinor,
    totalMinor,
  };

  return {
    lines: pricedLines,
    totals,
    currency: BASE_CURRENCY,
    appliedPromo: promoApplies && promo ? promo.code : null,
  };
}

