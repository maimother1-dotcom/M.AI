/**
 * Splitting a price into its taxable value and its GST.
 *
 * **Catalogue prices are tax-inclusive.** The figure on a product page is the
 * figure the customer pays, and it is declared as "MRP … inclusive of all taxes"
 * under the Legal Metrology rules. GST is therefore something already inside
 * that number, not something added to it at checkout.
 *
 * That is not a stylistic choice. Rule 18(2) of the Packaged Commodities Rules
 * makes selling above the declared MRP an offence, so a site that prints an
 * MRP and then adds tax on top of it at checkout is breaking the law on every
 * sale. It is also simply what an Indian shopper expects: the price on the shelf
 * is the price at the till.
 *
 * This file is the one place the split is computed, so `priceCart()` and the tax
 * invoice can never disagree about how much tax was in a given rupee.
 */

/**
 * Back the tax out of a gross, tax-inclusive amount.
 *
 *     taxable = gross × 10000 / (10000 + rate_bps)
 *
 * Rounded once, with the tax taking the remainder — so taxable + tax is exactly
 * the gross, always, with no drifting paisa to explain on an invoice.
 */
export function splitInclusive(
  grossMinor: number,
  rateBps: number,
): { taxableMinor: number; taxMinor: number } {
  const taxableMinor = Math.round((grossMinor * 10000) / (10000 + rateBps));
  return { taxableMinor, taxMinor: grossMinor - taxableMinor };
}

/**
 * Apportion an order-level discount across lines.
 *
 * A promo code discounts the order, but tax is charged per line at that line's
 * rate — so the discount has to be spread before the split can happen. Spread by
 * value, with the last line absorbing the rounding residue so the parts sum to
 * the whole rather than drifting.
 */
export function apportionDiscount(
  lineTotals: number[],
  discountMinor: number,
): number[] {
  const subtotal = lineTotals.reduce((sum, value) => sum + value, 0);
  if (subtotal === 0 || discountMinor === 0) return lineTotals.map(() => 0);

  const shares = lineTotals.map((value) => Math.round((discountMinor * value) / subtotal));
  const allocated = shares.slice(0, -1).reduce((sum, value) => sum + value, 0);
  shares[shares.length - 1] = discountMinor - allocated;
  return shares;
}
