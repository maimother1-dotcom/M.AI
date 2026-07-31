import "server-only";
import { HSN, SHIPPING_SAC, TAX, financialYear, isGstRegistered, isIntraState } from "@/data/tax";
import { getCatalogProduct } from "@/lib/admin/store";
import { apportionDiscount, splitInclusive } from "@/lib/gst";
import { TAX_BPS } from "@/lib/pricing";
import type { StoredOrder } from "@/lib/order-store";
import type { CategorySlug } from "@/lib/types";

/**
 * Turning an order into a tax invoice.
 *
 * The arithmetic here has to reproduce what the customer was actually charged,
 * to the paisa. `priceCart()` computes tax by apportioning the order-level
 * discount across lines and rounding each line's tax once, so this does exactly
 * the same and then forces the last line to absorb any residue. An invoice whose
 * parts do not add up to the amount taken is worse than no invoice: it is a
 * discrepancy in a document you are legally required to keep for six years.
 *
 * The prices in the catalogue are GST-INCLUSIVE — the MRP the customer sees is
 * what they pay. So the taxable value is derived backwards out of the gross:
 *
 *     taxable = gross × 10000 / (10000 + rate_bps)
 *
 * Printing the sale price as the taxable value would overstate your turnover and
 * understate the tax you collected.
 */

export interface InvoiceLine {
  description: string;
  hsn: string;
  quantity: number;
  /** Gross, GST-inclusive, after the order discount is apportioned. */
  grossMinor: number;
  taxableMinor: number;
  rateBps: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
}

export interface Invoice {
  /** Null until the order has been issued a serial. */
  number: string | null;
  date: string;
  financialYear: string;

  /** False when there is no GSTIN, in which case this is a bill of supply. */
  isTaxInvoice: boolean;
  supplier: { legalName: string; tradeName: string; address: string; gstin: string; state: string };
  recipient: { name: string; address: string[]; state: string };
  placeOfSupply: string;
  intraState: boolean;

  lines: InvoiceLine[];
  totals: {
    taxableMinor: number;
    cgstMinor: number;
    sgstMinor: number;
    igstMinor: number;
    taxMinor: number;
    roundOffMinor: number;
    grandTotalMinor: number;
  };
  amountInWords: string;
  order: { number: string; placedAt: string; paymentMode: string; paymentId?: string };
}

export function buildInvoice(order: StoredOrder, serial: string | null): Invoice {
  const date = new Date(order.paidAt ?? order.createdAt);
  const intraState = isIntraState(order.shippingAddress.state);

  // The discount is applied to the order, not to a line, so it is spread across
  // lines in proportion to their value — the same apportionment priceCart() uses
  // for tax, so the two agree.
  // The identical apportionment priceCart() used, from the identical module, so
  // the invoice cannot disagree with the amount the customer was charged.
  const lineDiscounts = apportionDiscount(
    order.lines.map((line) => line.lineTotalMinor),
    order.totals.discountMinor,
  );

  const lines: InvoiceLine[] = order.lines.map((line, index) => {
    const product = getCatalogProduct(line.sku);
    const category = (product?.category ?? "accessories") as CategorySlug;
    const rateBps = TAX_BPS[category];

    const grossMinor = line.lineTotalMinor - (lineDiscounts[index] ?? 0);
    const { taxableMinor: taxable, taxMinor: tax } = splitInclusive(grossMinor, rateBps);

    // CGST and SGST are half each, and an odd paisa goes to CGST by convention.
    const half = Math.floor(tax / 2);
    return {
      description: line.name,
      hsn: HSN[category].code,
      quantity: line.quantity,
      grossMinor,
      taxableMinor: taxable,
      rateBps,
      cgstMinor: intraState ? tax - half : 0,
      sgstMinor: intraState ? half : 0,
      igstMinor: intraState ? 0 : tax,
    };
  });

  // Shipping is a supply of service in its own right, at its own rate.
  if (order.totals.shippingMinor > 0) {
    const { taxableMinor: taxable, taxMinor: tax } = splitInclusive(
      order.totals.shippingMinor,
      SHIPPING_SAC.bps,
    );
    const half = Math.floor(tax / 2);
    lines.push({
      description: `Delivery — ${order.shippingMethod}`,
      hsn: SHIPPING_SAC.code,
      quantity: 1,
      grossMinor: order.totals.shippingMinor,
      taxableMinor: taxable,
      rateBps: SHIPPING_SAC.bps,
      cgstMinor: intraState ? tax - half : 0,
      sgstMinor: intraState ? half : 0,
      igstMinor: intraState ? 0 : tax,
    });
  }

  const taxableMinor = lines.reduce((s, l) => s + l.taxableMinor, 0);
  const cgstMinor = lines.reduce((s, l) => s + l.cgstMinor, 0);
  const sgstMinor = lines.reduce((s, l) => s + l.sgstMinor, 0);
  const igstMinor = lines.reduce((s, l) => s + l.igstMinor, 0);
  const taxMinor = cgstMinor + sgstMinor + igstMinor;

  // The invoice must total what was actually charged. Any paisa of drift between
  // this derivation and priceCart()'s becomes an explicit round-off line rather
  // than a silent discrepancy.
  const grandTotalMinor = order.totals.totalMinor;
  const roundOffMinor = grandTotalMinor - (taxableMinor + taxMinor);

  return {
    number: serial,
    date: date.toISOString(),
    financialYear: financialYear(date),
    isTaxInvoice: isGstRegistered(),
    supplier: {
      legalName: TAX.legalName,
      tradeName: TAX.tradeName,
      address: TAX.address,
      gstin: TAX.gstin,
      state: TAX.sellerState,
    },
    recipient: {
      name: order.name,
      address: [
        order.shippingAddress.line1,
        ...(order.shippingAddress.line2 ? [order.shippingAddress.line2] : []),
        `${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.postalCode}`,
        order.shippingAddress.country === "IN" ? "India" : order.shippingAddress.country,
      ],
      state: order.shippingAddress.state,
    },
    placeOfSupply: order.shippingAddress.state,
    intraState,
    lines,
    totals: { taxableMinor, cgstMinor, sgstMinor, igstMinor, taxMinor, roundOffMinor, grandTotalMinor },
    amountInWords: rupeesInWords(grandTotalMinor),
    order: {
      number: order.orderNumber,
      placedAt: order.createdAt,
      paymentMode: order.paymentMode,
      ...(order.paymentId && { paymentId: order.paymentId }),
    },
  };
}

/* -------------------------------------------------------------------------
   Amount in words
   ------------------------------------------------------------------------- */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
  "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n]!;
  const tens = TENS[Math.floor(n / 10)]!;
  const ones = ONES[n % 10]!;
  return ones ? `${tens} ${ones}` : tens;
}

/**
 * Rupees in words, on the Indian scale.
 *
 * Lakh and crore rather than million and billion, because that is what an
 * Indian invoice reads and what an auditor expects. Customary on a tax invoice
 * rather than strictly required, and it is the line that makes a tampered figure
 * obvious.
 */
export function rupeesInWords(minor: number): string {
  const rupees = Math.floor(Math.abs(minor) / 100);
  const paise = Math.abs(minor) % 100;

  if (rupees === 0 && paise === 0) return "Zero Rupees Only";

  const parts: string[] = [];
  let remaining = rupees;

  const crore = Math.floor(remaining / 10_000_000);
  remaining %= 10_000_000;
  const lakh = Math.floor(remaining / 100_000);
  remaining %= 100_000;
  const thousand = Math.floor(remaining / 1000);
  remaining %= 1000;
  const hundred = Math.floor(remaining / 100);
  const rest = remaining % 100;

  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigits(rest));

  let words = parts.join(" ");
  if (rupees > 0) words += " Rupees";
  if (paise > 0) words += `${rupees > 0 ? " and " : ""}${twoDigits(paise)} Paise`;

  return `${words} Only`;
}
