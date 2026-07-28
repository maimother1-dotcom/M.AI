import { BASE_CURRENCY, CURRENCIES } from "@/lib/currency";

/**
 * Client-safe commerce constants.
 *
 * These live apart from `src/lib/pricing.ts` for one concrete reason: pricing
 * now reads the catalog through the admin override store, which is marked
 * `server-only`. Anything a Client Component imports must not drag that in, or
 * the build fails.
 *
 * The rule of thumb: values the browser may KNOW live here; logic that DECIDES
 * what someone pays lives in pricing.ts and never leaves the server.
 */

/** Nobody legitimately buys 400 of one lipstick. Caps abuse and stock errors alike. */
export const MAX_QUANTITY_PER_LINE = 10;
export const MAX_LINES_PER_CART = 40;

export const FREE_SHIPPING_THRESHOLD = CURRENCIES[BASE_CURRENCY].freeShippingAbove;

/** How much more to spend to earn free standard shipping. Zero once earned. */
export function amountToFreeShipping(subtotalMinor: number): number {
  return Math.max(0, FREE_SHIPPING_THRESHOLD - subtotalMinor);
}
