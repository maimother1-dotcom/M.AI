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
9. **Shipping is downstream of payment and never asserts it.** `fulfilOrder()` re-reads the
   order and checks `status === "paid"` itself rather than trusting its caller, records the
   shipment id BEFORE assigning an AWB so a retry cannot create two shipments, and never
   throws — a courier outage must not make a payment webhook look failed and get retried.
10. **Customer-facing emails are claimed before they are sent.** The payment webhook and
   `/api/orders/confirm` race on every order; `claimEmail()` is what stops a customer getting
   two receipts, which reads as two charges.
11. **Stock is reserved, not checked.** The gate is `update … where on_hand - reserved >= qty`,
   one statement, so a race has exactly one winner. Never replace it with a read-then-decide,
   and never settle a hold without `settleStock()` claiming the transition first — a retried
   webhook would otherwise decrement inventory once per delivery.
12. **Never hold a pool connection and then ask the pool for another.** `reserve()` runs in a
   transaction on a checked-out client; a second `pool.query()` inside it deadlocks the pool
   under exactly the burst the code exists to handle. That shipped once and showed up as 503s
   instead of "sold out".
13. **Prices are tax-INCLUSIVE.** `totalMinor = discounted subtotal + shipping`; tax is backed
   out, never added. Adding GST on top of a declared MRP is an offence under Rule 18(2) of the
   Packaged Commodities Rules, and it shipped once. `src/lib/gst.ts` owns the split and both
   `priceCart()` and `buildInvoice()` must import it rather than reimplementing it.
14. **An invoice serial is issued once and never reissued.** Two documents in circulation for
   one sale is worse than a gap in the series, which Rule 46 tolerates.
15. **`/api/orders/lookup` must not distinguish its failures.** Wrong order number, wrong email
   and both wrong return identical bodies. Any difference turns it into an enumeration oracle,
   and it is the only gate on a customer's address.
16. **A refund amount is never in a request.** `/api/admin/returns` has no field for one and
   `.strict()` rejects a body that adds one. The value comes from what the customer paid for
   the pieces coming back. This is the only endpoint that moves money out — treat any change
   to it as a change to the pricing authority.
17. **A refund is claimed before the processor is called, never after.** One statement,
   `where status = 'received' and refunded_minor = 0`. Failing after the claim leaves a
   visibly-wrong zero-amount record a human can fix; the other order refunds twice.
18. **Stock returns when the parcel does, not when the refund does,** and `restock()` is an
   increment. Reading `availableFor()` and writing it back as `on_hand` would erase every live
   reservation — that bug was caught in review, not in production.
19. **The MRP on a product page is `product.priceMinor`,** the same field `priceCart()` prices
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
ADMIN_EMAIL=… ADMIN_PASSWORD=… ADMIN_TOTP_SECRET=… node scripts/orders-check.mjs   # 39 file, 40 Postgres
ADMIN_EMAIL=… ADMIN_PASSWORD=… ADMIN_TOTP_SECRET=… node scripts/shiprocket-check.mjs # 27/27
DATABASE_URL=… ADMIN_EMAIL=… …  node scripts/stock-check.mjs                          # 29/29
node scripts/invoice-check.mjs                                                        # 35/35
DATABASE_URL=… ADMIN_EMAIL=… …  node scripts/returns-check.mjs                        # 32/32
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
