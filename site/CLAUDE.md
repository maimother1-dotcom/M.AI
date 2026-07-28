# CLAUDE.md — site/ (L'INDIENNE)

Read this before changing anything in `site/`. Full detail in `site/README.md`.

## The one rule

**The server decides what things cost.** The browser sends `{sku, quantity, size, colorway}`
and nothing else that costs money. All pricing goes through `priceCart()` in
`src/lib/pricing.ts` — there is exactly one place money is calculated, and both the quote and
session endpoints call it.

Never add a price, total, discount or tax field to a request schema. The `.strict()` Zod
schemas in `src/lib/validation.ts` reject those on purpose.

## Invariants that break silently if violated

1. **Strict-CSP routes must be dynamic.** Any page route under `/checkout` or `/api` (see
   `STRICT_PREFIXES` in `src/proxy.ts`) must set `export const dynamic = "force-dynamic"`.
   A prerendered page under a nonce policy has no nonce on its scripts, so every script is
   blocked — in a browser, not in curl. Verify with `scripts/checkout-walk.mjs`.
2. **Money is integer minor units.** Paise, never floats. `src/lib/currency.ts` handles
   display.
3. **Receipts are verified, never rendered from a query param.** `/api/orders/confirm`
   checks the HMAC and, in Stripe mode, re-fetches the PaymentIntent from Stripe.
4. **Fulfilment belongs in the webhook,** not the success page. The customer's browser may
   never reach the success page.

## Before reporting any change done

```bash
cd site
npm run lint && npm run typecheck && npm run build
npm run start -- -p 3100 &
node scripts/security-check.mjs      # must be 26/26
node scripts/checkout-walk.mjs       # must pass
MOBILE=1 node scripts/checkout-walk.mjs
```

Mobile is not optional: screenshot at 390×844 before claiming responsive.

## Positioning

Never describe a product as a copy, dupe, or as inspired by a named brand. Never name a
competitor. `compareAtMinor` is typical boutique retail for a comparable construction, not
anyone's price tag. Jewellery is demi-fine only — no solid gold, no diamonds, and cubic
zirconia is called cubic zirconia.

## Conventions

- Comments explain *why*, especially where a decision looks odd (see `src/proxy.ts`).
- Product art is generated from the product id. Set `image` on a product to use a real photo.
- No em dashes in customer-facing copy is **not** a rule here — this is site copy, not
  outreach. The rule applies to external communications.
