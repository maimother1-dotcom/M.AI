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
   never reach the success page. `/api/orders/confirm` is a backstop and must stay
   idempotent — both paths call `recordPaymentOutcome()`, and either can arrive first.
5. **Orders are written before payment, not after.** `/api/checkout/session` records a
   `pending` order and declines the checkout if it cannot. Never move that write to the
   success path: a payment that succeeds while the webhook is down would leave a charged
   customer with no order at all.
6. **The order store is encrypted and stays that way.** It holds names, phones and home
   addresses. On Postgres, only `order_number`, dates, status, payment ids, total and
   currency are columns; everything identifying a person lives in the encrypted `payload`.
   Never promote a personal field to a column for easier querying, never add a plaintext
   dump or a debug log of an order, and never add an unauthenticated read path —
   `scripts/orders-check.mjs` greps both the file and the Postgres row for customer details.
7. **Production checkout refuses when the store is not durable.** `isOrderStoreDurable()`
   gates it, and the probe writes a real file rather than trusting `access(W_OK)`, which
   lies for root. Do not soften this into a warning: it is what stops a serverless deploy
   charging someone for an order that dies with the instance.
8. **Any page that reads the admin override store must be `force-dynamic`.** That is `/`,
   `/shop`, `/shop/[category]` and `/product/[slug]` today. The store changes at runtime;
   prerendered HTML does not, `revalidatePath` will not save you, and `next start` renders in
   worker processes that each cache their own copy. The failure mode is the page showing one
   price while checkout charges another — it has happened once already. `scripts/admin-flow.mjs`
   asserts page and checkout agree after both an edit and a revert.
9. **The MRP on a product page is `product.priceMinor`,** the same field `priceCart()` prices
   from. Never render the declaration from a separate source, or the declared MRP and the
   charged amount can drift apart — which is a Legal Metrology offence as well as a bug.

## Payments

`getPaymentProvider()` in `src/lib/payments.ts` is the single decision point:
Razorpay if its keys are set, else Stripe, else demo. Razorpay is preferred
because Stripe India is invite-only and has no UPI.

Never trust the payment result the browser returns. Razorpay's callback must be
verified server-side (HMAC over `order_id|payment_id`) AND the payment re-fetched
from Razorpay before a receipt renders. Webhooks verify over the RAW body — do
not `await request.json()` before verifying, it destroys the signed bytes.

## Before reporting any change done

```bash
cd site
npm run lint && npm run typecheck && npm run build
npm run start -- -p 3100 &
node scripts/security-check.mjs      # must be 26/26
node scripts/razorpay-check.mjs      # must be 15/15
node scripts/checkout-walk.mjs       # must pass
MOBILE=1 node scripts/checkout-walk.mjs
node scripts/admin-check.mjs         # 11/11 with admin configured, 4/4 without
ADMIN_EMAIL=… ADMIN_PASSWORD=… ADMIN_TOTP_SECRET=… node scripts/admin-flow.mjs     # 27/27
ADMIN_EMAIL=… ADMIN_PASSWORD=… ADMIN_TOTP_SECRET=… node scripts/orders-check.mjs   # 28/28 file, 29/29 Postgres
```

Sign-in allows five attempts per fifteen minutes and the bucket is per-IP, so every suite
that touches `/api/admin/login` — including `admin-check.mjs`, which deliberately fails
logins — shares it. **Restart the server before each authenticated suite** or the later ones
return 429s that read as failures. The limiter is in-memory, so a restart clears it.

The order store has two backends and both must pass. Run the suite once with no
`DATABASE_URL` (file backend) and once with one pointed at a scratch database — the Postgres
path is the one that runs in production, so testing only the file path tests the wrong thing.

`data/catalog-overrides.json` is gitignored but **is read at build time**. A stale one left
over from a previous run will bake the wrong prices into the build and make admin tests pass
against the wrong baseline. `echo '{}' > data/catalog-overrides.json` before a clean run.

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
