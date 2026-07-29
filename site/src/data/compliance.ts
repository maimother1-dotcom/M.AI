import { displayPrice } from "@/lib/currency";
import type { CategorySlug, Product } from "@/lib/types";

/**
 * Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6 and Rule 26.
 *
 * Every pre-packaged commodity sold in India must carry six declarations, and
 * since the 2017 amendment an e-commerce listing must display them on the
 * product page BEFORE purchase, not only on the parcel. This is actively
 * enforced against online sellers.
 *
 * The mandatory six:
 *   1. Name and address of the manufacturer / packer / importer
 *   2. Common or generic name of the commodity
 *   3. Net quantity
 *   4. Retail sale price as "MRP ₹… inclusive of all taxes"
 *   5. Consumer care details — name, address, phone and email
 *   6. Month and year of manufacture / packing / import
 *
 * Country of origin is separately mandatory for e-commerce listings under the
 * Consumer Protection (E-Commerce) Rules, 2020.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * BEFORE YOU SELL: replace every placeholder below with your real registered
 * details. These are structurally correct but factually blank — shipping them
 * as-is would itself be a violation.
 * ─────────────────────────────────────────────────────────────────────────
 */

export interface ComplianceDetails {
  manufacturerName: string;
  manufacturerAddress: string;
  countryOfOrigin: string;
  consumerCareName: string;
  consumerCareAddress: string;
  consumerCarePhone: string;
  consumerCareEmail: string;
  /**
   * Month and year of packing, as "MM/YYYY", used for any product that does not
   * carry its own `packedOn`. Rule 6(1)(d) wants the real packing date, so this
   * is a floor for a small catalogue packed in runs — per-product wins.
   */
  defaultPackedOn: string;
}

/** TODO: replace with your registered business details before selling. */
export const COMPLIANCE: ComplianceDetails = {
  manufacturerName: "[Registered business name]",
  manufacturerAddress: "[Registered address, city, state, PIN]",
  countryOfOrigin: "India",
  consumerCareName: "[Consumer care officer name]",
  consumerCareAddress: "[Consumer care address, city, state, PIN]",
  consumerCarePhone: "[+91 XXXXX XXXXX]",
  consumerCareEmail: "care@lindienne.com",
  defaultPackedOn: "[MM/YYYY]",
};

/** True once the placeholders above have actually been filled in. */
export function isComplianceConfigured(): boolean {
  return !Object.values(COMPLIANCE).some((value) => value.includes("["));
}

/**
 * Generic name per subcategory.
 *
 * Rule 6(1)(b) wants the COMMON name of the commodity, not the marketing name.
 * "Chandni Silk Slip Dress" is a brand name; "Women's dress" is the generic.
 */
const GENERIC_NAME: Record<string, string> = {
  dresses: "Women's dress",
  outerwear: "Women's coat / jacket",
  knitwear: "Women's knitted garment",
  silk: "Women's blouse / shirt",
  occasion: "Women's formal garment",

  tote: "Handbag (tote)",
  shoulder: "Handbag (shoulder)",
  clutch: "Handbag (clutch)",
  mini: "Handbag (crossbody)",

  heel: "Women's footwear",
  flat: "Women's footwear",
  boot: "Women's footwear",
  sandal: "Women's footwear",

  earrings: "Imitation jewellery — earrings",
  necklaces: "Imitation jewellery — necklace",
  rings: "Imitation jewellery — ring",
  bracelets: "Imitation jewellery — bracelet",

  lip: "Cosmetic — lip preparation",
  complexion: "Cosmetic — skin preparation",
  eyes: "Cosmetic — eye preparation",
  skincare: "Cosmetic — skin care preparation",
  fragrance: "Cosmetic — perfume",

  scarves: "Scarf / stole",
  sunglasses: "Sunglasses",
  belts: "Belt",
  "small-leather": "Small leather goods",
};

export function genericNameFor(subcategory: string): string {
  return GENERIC_NAME[subcategory] ?? "Fashion accessory";
}

/**
 * Default net quantity by category.
 *
 * For garments, footwear and accessories the rules express net quantity as a
 * count, not a weight — "1 piece" or "1 pair" is the correct declaration. Only
 * beauty is measured, and those carry a per-product `netQuantity`.
 */
export function defaultNetQuantity(category: CategorySlug): string {
  switch (category) {
    case "shoes":
      return "1 pair";
    case "jewellery":
      return "1 set";
    default:
      return "1 piece";
  }
}

/**
 * Cosmetics carry an extra obligation.
 *
 * Manufacturing or importing cosmetics for sale in India requires a licence
 * under the Drugs and Cosmetics Rules, administered by CDSCO. A reseller does
 * not hold the licence, but must be able to show that the manufacturer does.
 *
 * Set this once you hold your supplier's licence number on file. Until then the
 * beauty category is not cleared for sale, and `beautyCleared()` says so.
 */
export const COSMETIC_LICENCE: { holderName: string; licenceNumber: string } | null = null;

export function beautyCleared(): boolean {
  return COSMETIC_LICENCE !== null;
}

/* -------------------------------------------------------------------------
   Rendering
   ------------------------------------------------------------------------- */

export interface Declaration {
  label: string;
  value: string;
}

/**
 * The declarations for one product, in the order the rules list them.
 *
 * Note that the MRP is read from `product.priceMinor` — the same field the
 * server prices the cart from. If an admin edit ever moved one without the
 * other, the declared MRP and the charged price would diverge, which is both a
 * Legal Metrology offence and the worst bug this site could have. Passing the
 * override-aware product through is what keeps them the same number.
 */
export function declarationsFor(product: Product): Declaration[] {
  const declarations: Declaration[] = [
    { label: "Generic name", value: genericNameFor(product.subcategory) },
    {
      label: "Net quantity",
      value: product.netQuantity ?? defaultNetQuantity(product.category),
    },
    {
      label: "Retail sale price",
      value: `MRP ${displayPrice(product.priceMinor)} (inclusive of all taxes)`,
    },
    { label: "Country of origin", value: COMPLIANCE.countryOfOrigin },
    {
      label: "Month and year of packing",
      value: product.packedOn ?? COMPLIANCE.defaultPackedOn,
    },
    {
      label: "Manufactured / packed by",
      value: `${COMPLIANCE.manufacturerName}, ${COMPLIANCE.manufacturerAddress}`,
    },
    {
      label: "Consumer care",
      value: [
        COMPLIANCE.consumerCareName,
        COMPLIANCE.consumerCareAddress,
        COMPLIANCE.consumerCarePhone,
        COMPLIANCE.consumerCareEmail,
      ].join(" · "),
    },
  ];

  if (COSMETIC_LICENCE && product.category === "beauty") {
    declarations.push({
      label: "Cosmetic licence",
      value: `${COSMETIC_LICENCE.licenceNumber} (${COSMETIC_LICENCE.holderName})`,
    });
  }

  return declarations;
}
