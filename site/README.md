# L'INDIENNE

A luxury women's marketplace — clothing, bags, shoes, demi-fine jewellery, beauty and
accessories, positioned as genuine quality at a fraction of boutique pricing.

Named for the painted Indian cottons that swept Paris in the 1680s and were banned in
France in 1686 for outselling French silk.

> **Paris fell for India first.**

---

## Run it

```bash
cd site
npm install
cp .env.example .env.local     # fill in ORDER_SIGNING_SECRET, at minimum
npm run dev                    # http://localhost:3000
```

It works end to end with no payment keys at all. Checkout runs in **demo mode**: the payment
page validates cards locally, no money moves, and nothing is sent to any third party.

```bash
npm run build && npm run start   # production build
npm run typecheck                # tsc --noEmit
npm run lint                     # eslint
```

---

## Verifying it

Two suites, both run against a **running production build** rather than mocks.

```bash
npm run build && npm run start -- -p 3100

node scripts/security-check.mjs    # 26 adversarial checks
node scripts/checkout-walk.mjs     # full purchase in a real browser
MOBILE=1 node scripts/checkout-walk.mjs

node scripts/razorpay-check.mjs    # 15 signature-verification checks (no account needed)
node scripts/admin-check.mjs       # admin surface, unauthenticated
ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_TOTP_SECRET=... \
  node scripts/admin-flow.mjs      # 27 authenticated admin checks
```

`security-check.mjs` tries to break the pricing authority: injecting prices, negative and
absurd quantities, fabricated SKUs, non-existent variants, invented promo codes, unsigned
Stripe webhooks, and forged order tokens. `checkout-walk.mjs` drives Chromium through the
whole purchase and asserts the total is the same number in the drawer, the cart, checkout,
the payment page and the receipt.

Both must pass before shipping a change to anything under `src/lib/` or `src/app/api/`.

---

## Payments — Razorpay, Stripe, or demo

`getPaymentProvider()` in `src/lib/payments.ts` picks one, and everything else
follows. Razorpay wins when both are configured.

| Provider | When it is used | Covers |
|---|---|---|
| **Razorpay** | `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` set | UPI, cards, netbanking, wallets, EMI |
| **Stripe** | Stripe keys set, no Razorpay | Cards and Stripe's own methods |
| **Demo** | Nothing set | Local card validation, no money moves |

### Why Razorpay for India

Stripe India is **invite-only** and **does not support UPI**. For a rupee-priced
store selling to Indian customers, that rules it out — UPI is how most people
pay. Razorpay is RBI-licensed, settles INR domestically, and covers every method
Indian customers expect from one integration.

Razorpay is implemented against its REST API directly, with no SDK: it is three
endpoints and an HMAC scheme, and a dependency there would put supply-chain risk
on the payment path for very little gain.

### How a Razorpay payment is trusted

1. We create the Order **server-side**, for the amount `priceCart()` computed.
   Razorpay never sees a figure the browser chose.
2. The customer pays inside Razorpay's own window. Card and UPI details never
   enter our DOM.
3. Razorpay returns a payment id, order id and signature to the browser. **None
   of it is believed.** `/api/orders/confirm` verifies the HMAC against our key
   secret, checks the order id is the one we issued, re-fetches the payment from
   Razorpay, and requires `status === "captured"` with a matching amount.
4. The webhook verifies its own signature over the **raw** body, separately.

Step 3 is the point: a signature proves Razorpay processed *this* payment for
*this* order, and a browser cannot forge one. `scripts/razorpay-check.mjs`
covers 15 cases including wrong-secret, wrong-order, wrong-payment, truncated
and bit-flipped signatures, and a concatenation-collision check on the
`order|payment` separator.

Fulfilment belongs in the webhook, not the confirmation page — a customer's
browser may never reach the confirmation page.

---

## How the money works

**One rule: the server decides what things cost.**

The browser stores and sends `{sku, quantity, size, colorway}` — never a price, a total, a
tax figure or a discount. `priceCart()` in `src/lib/pricing.ts` looks every SKU up in the
catalog and recomputes from scratch. A request that carries a price is rejected outright by
`.strict()` Zod schemas rather than silently ignored, so probing produces a 400 instead of a
quiet no-op.

| Concern | Where it is enforced |
|---|---|
| Price, tax, shipping, discount | `src/lib/pricing.ts` — the only place money is calculated |
| Request shape | `src/lib/validation.ts` — Zod, `.strict()`, on every POST |
| Payment intent amount | `src/app/api/checkout/session/route.ts` — from the server's total |
| Webhook authenticity | `src/app/api/webhooks/stripe/route.ts` — signature over the raw body |
| Receipt authenticity | `src/app/api/orders/confirm/route.ts` — HMAC + a live Stripe status check |
| Abuse | `src/lib/rate-limit.ts` — token bucket on every POST |

**Card data never touches this server.** In Stripe mode the fields are served by Stripe
inside their own frame and go directly to them. We receive a confirmation and nothing else.

**There is no database.** Stripe is the order record in Stripe mode; an HMAC-signed token
carries it in demo mode. `src/lib/orders.ts` is the single seam where Postgres or Supabase
plugs in — replace `signOrder`/`verifyOrder` with inserts and selects and nothing else
changes. Add one when you want order history and accounts.

### Content-Security-Policy

`src/proxy.ts` serves two policies, and the split is deliberate:

- **Strict** (nonce + `strict-dynamic`) on `/checkout/**` and `/api/**` — the routes where
  card details are entered. The realistic e-commerce attack is a skimmer injected into the
  payment page; this is the control that stops it.
- **Standard** on catalog and editorial pages, so the prerendered ones keep working.

A nonce only reaches Next's script tags on **dynamically rendered** routes — a prerendered
page has no nonce and a nonce policy would block every script on it. Every page route under
a strict prefix therefore sets `export const dynamic = "force-dynamic"`. If you add one,
keep that invariant or the page will break in a browser (and not in curl).

---

## Product imagery

Every product renders generated editorial art — a duotone ground, its **subcategory**
silhouette, the house motif tiled behind it, and a grain pass — derived deterministically
from the product id. No network request, nothing to break, identical on server and client.

To use a real photograph, set `image` on the product in `src/data/products.ts`. That is the
whole change; `<ProductImage>` renders `next/image` instead. For a remote host, whitelist it
in `next.config.ts` under `images.remotePatterns`.

---

## Admin panel

Optional, and off by default: with no credentials configured, `/admin` and every
`/api/admin/*` route return **404**, not 401 — an unconfigured admin should not
advertise that there is anything to attack.

```bash
npm run admin:setup -- you@example.com   # prints four env vars, commits nothing
```

Sign-in needs **email + password + a TOTP code**. Two-factor is not optional:
this surface can change what every product costs, so a stolen password alone
must not reach it. Passwords are stored as a scrypt hash, codes are verified
against RFC 6238 with a ±1 step window, sessions are HMAC-signed in an
HttpOnly / SameSite=Strict cookie, and sign-in is rate limited to five attempts
per fifteen minutes.

### How edits persist

The committed catalogue in `src/data/products.ts` stays the source of truth. The
admin records a small patch per product in an **overrides store**, and reads
merge the patch over the base. So a bad edit is a one-line delete, not a
migration, and "Revert to committed" always works.

**The home, shop and product pages render per request** (`export const dynamic =
"force-dynamic"`), because they read this store and the store changes at runtime.
That is not a performance oversight, it is the fix for a real bug: prerendered
HTML kept showing the committed price while `/api/checkout/quote` returned the
edited one, so a customer could be charged more than the page said. Two things
caused it, and both are fixed —

- `revalidatePath` does not reliably invalidate a route that was baked at build
  time, so the page never re-rendered;
- `next start` renders pages in worker processes separate from the one serving
  `/api/admin/*`, and the override cache in `src/lib/admin/store.ts` never
  re-read the file, so each worker served its first read forever. It now
  re-reads whenever the file's mtime or size changes.

`scripts/admin-flow.mjs` asserts the page and the checkout agree after an edit
**and** after a revert. The revert assertion is the one that was missing, and its
absence is how this shipped.

**Where it persists depends on the host, and the UI says which:**

| Host | Behaviour |
|---|---|
| Local, VPS, any single long-lived server | Durable. Writes `data/catalog-overrides.json`. |
| Vercel and other serverless | **Not durable.** Filesystem is ephemeral and per-instance. The admin shows a red banner saying so. |

On serverless, the workflow is: edit → **Export edits** → commit the JSON. To
make it live-durable instead, implement the three functions marked
`ADAPTER SEAM` in `src/lib/admin/store.ts` against Postgres or Vercel KV.
Nothing else changes.

### Known limitation

Server-rendered pages (home, shop, category, product) reflect edits immediately,
per the section above. Four client-rendered surfaces — search, wishlist, the cart drawer and the cart
page — read the catalogue bundled at build time, so they show committed prices
until the next deploy. **Money is never affected**: checkout always re-prices
from the override-aware catalogue on the server. Exporting and committing your
edits resolves the display drift.

Orders are deliberately not in the admin. There is no order storage yet (see
"No database" above), so an order list would be a lie. Add a database first.

---

## Selling in India — the statutory declarations

Every pre-packaged commodity sold in India must carry six declarations under the
Legal Metrology (Packaged Commodities) Rules 2011, and since the 2017 amendment
an **e-commerce listing must show them on the product page before purchase**, not
only on the parcel. This is actively enforced against online sellers.

They live in `src/data/compliance.ts` and render in the **Product information**
panel on every product page:

| Declaration | Where it comes from |
|---|---|
| Common or generic name | `genericNameFor(subcategory)` — "Women's dress", not the piece's name |
| Net quantity | `product.netQuantity`, or `defaultNetQuantity(category)` — "1 piece", "1 pair" |
| Retail sale price | `product.priceMinor`, rendered as "MRP ₹… (inclusive of all taxes)" |
| Country of origin | `COMPLIANCE.countryOfOrigin` — separately required by the Consumer Protection (E-Commerce) Rules 2020 |
| Month and year of packing | `product.packedOn`, or `COMPLIANCE.defaultPackedOn` |
| Manufacturer / packer | `COMPLIANCE.manufacturerName` + address |
| Consumer care | `COMPLIANCE` name, address, phone, email |

The MRP is also printed **unopened**, directly under the price, because a
declaration behind a click is a weaker reading of the rule than it needs to be.
It is read from the same `priceMinor` the server prices the cart from, so the
declared MRP and the charged amount cannot diverge.

**Two things are deliberately blank and will print as `[brackets]` until you fill
them in.** `/admin` shows a red "Before you sell" banner listing them:

1. **Your business details** in `COMPLIANCE`. Shipping the placeholders is itself
   a violation.
2. **`COSMETIC_LICENCE`** — manufacturing or importing cosmetics for sale in
   India needs a CDSCO licence under the Drugs and Cosmetics Rules. A reseller
   does not hold it, but must be able to produce the manufacturer's. Until you
   have your supplier's number on file, `beautyCleared()` is false and you should
   not take orders in the Beauty category.

---

## Positioning guardrails

These are encoded in the copy and in the data model, not just in intent:

- **Nothing is presented as a copy of another brand.** No named house appears anywhere, and
  no piece is described as inspired by, in the style of, or a dupe for anything.
- **`compareAtMinor` is the typical boutique retail** for a comparable construction and
  material — not a competitor's price, and not a price we previously charged.
- **Jewellery is demi-fine only.** 18k vermeil over recycled sterling, freshwater pearl,
  cubic zirconia, fired enamel. No solid gold, no diamonds. Cubic zirconia is called cubic
  zirconia.
- **Sample reviews are disclosed as sample reviews** on the FAQ page. Replace
  `src/data/reviews.ts` wholesale when you have real ones.

---

## Layout

```
src/
  app/                     routes (App Router)
    api/                   checkout, quote, webhook, order confirm, forms
    checkout/              details → payment → success
    shop/  product/  editorial/  help/  legal/
  components/
    brand/                 the house motif and wordmark
    cart/                  provider, drawer, cart page
    checkout/              form, summary, payment, receipt
    home/                  landing page sections
    product/               card, buy box, generated art, silhouettes
    shop/                  faceted grid, search, wishlist
  data/                    products, categories, editorial, reviews
  lib/                     pricing, currency, orders, stripe, validation, rate-limit
  proxy.ts                 per-request CSP
scripts/                   security-check.mjs, checkout-walk.mjs
```

---

## Before taking real money

1. Set `ORDER_SIGNING_SECRET` to at least 32 random characters. The app refuses to start in
   production without it.
2. Add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`, and register
   the webhook endpoint at `/api/webhooks/razorpay` in the Razorpay dashboard
   (Settings → Webhooks; subscribe to `payment.captured` and `payment.failed`).
   Stripe is supported too — `/api/webhooks/stripe` — but is the wrong choice for
   an Indian storefront.
3. Move rate limiting to Upstash or Vercel KV. The in-memory bucket in `src/lib/rate-limit.ts`
   is per-instance, so on an autoscaled platform the effective limit is `limit × instances`.
4. Add a database if you want order history, and wire fulfilment into the webhook handler
   rather than the success page — the customer's browser may never reach the success page.
5. If you add an admin surface, it needs two-factor authentication before it ships. There is
   no login anywhere in this codebase today, by design.
6. Replace the sample reviews, and confirm each `compareAtMinor` against a real comparable.
