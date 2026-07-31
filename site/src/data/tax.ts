import type { CategorySlug } from "@/lib/types";

/**
 * GST, and what a tax invoice has to say.
 *
 * Rule 46 of the CGST Rules lists what a tax invoice must carry. The ones that
 * shape this file:
 *
 *   - the supplier's name, address and **GSTIN**
 *   - a **consecutive serial number** unique within a financial year
 *   - the recipient's name and address, and the **place of supply**
 *   - the **HSN code** for each item
 *   - taxable value, and the tax split out by rate
 *
 * The split depends on where the goods go. Same state as the supplier is an
 * intra-state supply and the tax divides into CGST and SGST, half each.
 * Different state is inter-state and the whole amount is IGST. Getting this
 * wrong is not cosmetic: the customer cannot claim credit against the wrong
 * head, and your returns will not reconcile.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * BEFORE YOU SELL: fill in GSTIN and SELLER_STATE. Until you do,
 * `isGstRegistered()` is false and the document renders as a plain **bill of
 * supply** rather than a tax invoice — which is the correct document for an
 * unregistered seller, and issuing a "tax invoice" without a GSTIN would be
 * a false statement.
 * ─────────────────────────────────────────────────────────────────────────
 */

export interface TaxIdentity {
  gstin: string;
  /** The state you are registered in. Determines CGST+SGST versus IGST. */
  sellerState: string;
  legalName: string;
  tradeName: string;
  address: string;
  /** Prefix for invoice serials, e.g. LI/2026-27/000001. */
  invoicePrefix: string;
}

/** TODO: replace with your registration details before selling. */
export const TAX: TaxIdentity = {
  gstin: "[15-character GSTIN]",
  sellerState: "West Bengal",
  legalName: "[Registered legal name]",
  tradeName: "L'INDIENNE",
  address: "[Registered address, city, state, PIN]",
  invoicePrefix: "LI",
};

/** A GSTIN is 15 characters: 2 state code, 10 PAN, 1 entity, 1 'Z', 1 checksum. */
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

export function isGstRegistered(): boolean {
  return GSTIN_SHAPE.test(TAX.gstin);
}

/**
 * HSN codes, by category.
 *
 * Four digits is what a small supplier must quote (six above ₹5 crore turnover),
 * and these are the headings the categories fall under. They drive the rate, so
 * they must agree with `TAX_BPS` in `pricing.ts` — a mismatch between the rate
 * you charge and the code you print is the kind of thing a scrutiny notice is
 * made of.
 */
export const HSN: Record<CategorySlug, { code: string; description: string }> = {
  // Women's garments, knitted or not. 5% under ₹1000, 12% above — the catalogue
  // sits above, and TAX_BPS charges 12%.
  clothing: { code: "6204", description: "Women's suits, dresses and garments" },
  // Handbags, whether or not with shoulder strap.
  bags: { code: "4202", description: "Handbags and travel goods" },
  shoes: { code: "6404", description: "Footwear with textile or leather uppers" },
  // Imitation jewellery. 3% — the rate for imitation jewellery under 7117.
  jewellery: { code: "7117", description: "Imitation jewellery" },
  beauty: { code: "3304", description: "Beauty and skin care preparations" },
  accessories: { code: "6214", description: "Scarves, shawls and accessories" },
};

/** SAC for the delivery charge, which is a service rather than goods. */
export const SHIPPING_SAC = { code: "9968", description: "Courier delivery services", bps: 1800 };

/**
 * Whether this sale is intra-state.
 *
 * Compared loosely on purpose: customers type "West Bengal", "west bengal" and
 * "WB", and a whitespace difference must not silently reclassify the tax.
 */
export function isIntraState(customerState: string): boolean {
  const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return normalise(customerState) === normalise(TAX.sellerState);
}

/**
 * The Indian financial year for a date, as "2026-27".
 *
 * Invoice serials must be unique within a financial year, and India's runs
 * April to March — so an invoice dated 31 March and one dated 1 April belong to
 * different series.
 */
export function financialYear(date: Date): string {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}
