/**
 * Money handling.
 *
 * Every price in this codebase is an integer in the currency's minor unit
 * (paise for INR, cents for USD). Floats are never used for money — 0.1 + 0.2
 * is not 0.3, and that difference becomes a real accounting problem the moment
 * it hits a payment processor.
 */

export const CURRENCIES = {
  INR: {
    code: "INR",
    symbol: "₹",
    locale: "en-IN",
    /** Stripe's smallest unit for this currency. */
    minorPerMajor: 100,
    /** Free-shipping threshold, in minor units. */
    freeShippingAbove: 500000, // ₹5,000
    standardShipping: 24900, // ₹249
    expressShipping: 59900, // ₹599
  },
  USD: {
    code: "USD",
    symbol: "$",
    locale: "en-US",
    minorPerMajor: 100,
    freeShippingAbove: 15000, // $150
    standardShipping: 900, // $9
    expressShipping: 2400, // $24
  },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

/** The currency all catalog prices are authored in. */
export const BASE_CURRENCY: CurrencyCode = "INR";

/**
 * Display-only conversion rates from the base currency.
 *
 * These are deliberately static. A storefront that silently re-quotes prices
 * from a live FX feed between "add to cart" and "pay" creates disputes. When
 * you want live rates, fetch them on the server, cache them for the day, and
 * pin the rate onto the order at checkout — do not convert in the browser.
 */
const RATE_FROM_BASE: Record<CurrencyCode, number> = {
  INR: 1,
  USD: 1 / 88,
};

export function convert(
  amountMinor: number,
  to: CurrencyCode,
  from: CurrencyCode = BASE_CURRENCY,
): number {
  if (to === from) return amountMinor;
  const inBase = amountMinor / RATE_FROM_BASE[from];
  return Math.round(inBase * RATE_FROM_BASE[to]);
}

/**
 * Format a minor-unit amount for display.
 *
 * Prices are shown without decimals when they are whole, because "₹4,200" reads
 * as considered and "₹4,200.00" reads as a spreadsheet.
 */
export function formatMoney(
  amountMinor: number,
  currency: CurrencyCode = BASE_CURRENCY,
  options: { showDecimals?: boolean } = {},
): string {
  const config = CURRENCIES[currency];
  const major = amountMinor / config.minorPerMajor;
  const isWhole = amountMinor % config.minorPerMajor === 0;
  const showDecimals = options.showDecimals ?? !isWhole;

  return new Intl.NumberFormat(config.locale, {
    style: "currency",
    currency: config.code,
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(major);
}

/** Convert then format, in one call. */
export function displayPrice(
  amountMinorBase: number,
  currency: CurrencyCode = BASE_CURRENCY,
): string {
  return formatMoney(convert(amountMinorBase, currency), currency);
}

/** Whole-number saving percentage, e.g. 68 for "68% less". */
export function savingPercent(priceMinor: number, compareAtMinor: number): number {
  if (compareAtMinor <= priceMinor) return 0;
  return Math.round(((compareAtMinor - priceMinor) / compareAtMinor) * 100);
}
