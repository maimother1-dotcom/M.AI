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
ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_TOTP_SECRET=... \
  node scripts/orders-check.mjs    # 27 order-storage checks
```

Sign-in is rate limited to five attempts per fifteen minutes, per IP, and every
suite that touches the login route shares that budget — `admin-check.mjs` spends
it deliberately, on failed logins. Restart the server before each authenticated
suite, or the later ones return 429s that look like failures. The limiter is
in-memory, so a restart clears it.

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

**Orders are recorded.** See "Orders" below. There is still no *customer* database — no
accounts, no login, no order history for the shopper — and `src/lib/orders.ts` remains the
seam where that plugs in.

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

---

## Orders

Every checkout writes an order **before the customer is asked to pay**, as
`pending`, and the processor moves it to `paid`, `failed` or `refunded`. They are
listed at **`/admin/orders`** with everything needed to pack a parcel.

Writing it first is the point. If orders were only recorded on success, an
abandoned payment would leave no trace, and a payment that succeeded at the
processor while the webhook was down would leave a charged customer with no order
at all. A `pending` row that never advances is a question you can answer; a
missing row is not. If the write fails, checkout is declined rather than taking
money for an order nothing would remember.

### Who marks an order paid

| Source | Role |
|---|---|
| `/api/webhooks/razorpay`, `/api/webhooks/stripe` | The authority. Fires whether or not the customer's browser ever comes back. |
| `/api/orders/confirm` | Backstop, after its existing signature and re-fetch checks pass. The only path in demo mode, which has no webhook. |

Either can arrive first — Razorpay's webhook regularly beats the browser — so
`recordPaymentOutcome()` is idempotent and refuses to walk an order backwards. A
`failed` event arriving after a capture is ignored rather than stranding a real
customer.

### Where they go

`src/lib/order-store.ts` picks a backend from the environment:

| Backend | When | Durable |
|---|---|---|
| **Postgres** | `DATABASE_URL` or `POSTGRES_URL` is set | Yes, anywhere — including serverless. Use this for real money. |
| **File** | Neither is set and `./data` is writable | Yes on one long-lived server (a VPS). No on serverless. |
| **Memory** | Neither is set and the filesystem is read-only | **No.** Production checkout refuses. |

The table is created on first use (`create table if not exists`), so deploying is
deploying. Point `DATABASE_URL` at your provider's **pooled** connection string —
Neon, Supabase and Vercel Postgres all give you one — because serverless opens a
connection per invocation.

**In production, checkout refuses outright when the store is not durable.** Not a
warning, a 503, with a log line naming the fix. Taking a payment for an order
that evaporates when the instance recycles is worse than not taking it. The
durability probe writes a real file rather than calling `access(W_OK)`, which
reports success for root on a directory nobody can write to.

### Encrypted at rest

An order is a person's full name, email, phone number and home address.
**AES-256-GCM**, with the key derived from `ORDER_SIGNING_SECRET` by HKDF under a
separate label — so the storage key and the token-signing key are
cryptographically distinct despite coming from one secret. Fresh random IV per
write; GCM's tag means edited ciphertext fails loudly rather than returning
altered orders.

On Postgres the row is split deliberately:

```
order_number  created_at  status  payment_mode  payment_id  total_minor  currency   ← columns, queryable
payload                                                                             ← encrypted blob
```

Status, dates, ids and totals stay as columns so the admin list sorts and totals
in SQL. Everything that identifies a human — name, email, phone, address, and the
line items that reveal what they bought — is in the blob. **Your database
provider stores something it cannot read.** `scripts/orders-check.mjs` connects
to Postgres directly and greps the row for all of it.

On the file backend the whole file is one envelope, at mode `0600`.

Two consequences worth knowing before you rely on it:

- **Losing `ORDER_SIGNING_SECRET` makes every stored order unreadable.** There is
  no recovery. Back it up somewhere that is not the server.
- **Changing it has the same effect.** The store says so plainly rather than
  silently starting empty, which would look like your orders had vanished.

`isOrderStoreConfigured()` is deliberately stricter than
`isOrderSigningConfigured()`: the latter falls back to a per-process random secret
outside production, which is fine for a short-lived receipt token and useless for
storage, because orders written under it become unreadable at the next restart.

`/admin` names the active backend and warns when it is not durable.

Note the catalogue overrides still carry the old caveat — they are file-only, so
admin *price edits* remain non-durable on serverless even once orders are in
Postgres. Orders were the part that could cost a customer money, so they went
first.

### Still to do here

Stock is not decremented on payment, no confirmation email is sent, and there is
no retention policy — personal data currently accumulates indefinitely, which is
worth a decision before you have real customers in there.

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
4. Back up `ORDER_SIGNING_SECRET` somewhere other than the server. Every stored order is
   encrypted with a key derived from it, and losing it makes them permanently unreadable.
5. Set `DATABASE_URL` to a **pooled** Postgres connection string. On serverless the app will
   refuse to take orders without one, on purpose.
6. Fill in `COMPLIANCE` in `src/data/compliance.ts`, and record your supplier's CDSCO licence
   in `COSMETIC_LICENCE` before selling anything in the Beauty category.
7. Replace the sample reviews, and confirm each `compareAtMinor` against a real comparable.
8. Decide a retention policy for order data. Nothing currently expires.
