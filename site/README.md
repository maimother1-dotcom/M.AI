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
page validates cards locally, no money moves, and nothing is sent to any third party. Add
Stripe keys and the same page becomes Stripe's Payment Element with no code change.

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

node scripts/admin-check.mjs       # admin surface, unauthenticated
ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_TOTP_SECRET=... \
  node scripts/admin-flow.mjs      # authenticated admin flow
```

`security-check.mjs` tries to break the pricing authority: injecting prices, negative and
absurd quantities, fabricated SKUs, non-existent variants, invented promo codes, unsigned
Stripe webhooks, and forged order tokens. `checkout-walk.mjs` drives Chromium through the
whole purchase and asserts the total is the same number in the drawer, the cart, checkout,
the payment page and the receipt.

Both must pass before shipping a change to anything under `src/lib/` or `src/app/api/`.

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
- **Standard** on catalog and editorial pages, so they stay statically prerendered.

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

Every write calls `revalidatePath`, so a price change reaches the prerendered
product and shop pages as well as the checkout total. That pairing is the point:
showing one price and charging another is the worst thing this feature could do,
and `scripts/admin-flow.mjs` asserts both move together.

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

Server-rendered pages (home, shop, category, product) reflect edits immediately.
Four client-rendered surfaces — search, wishlist, the cart drawer and the cart
page — read the catalogue bundled at build time, so they show committed prices
until the next deploy. **Money is never affected**: checkout always re-prices
from the override-aware catalogue on the server. Exporting and committing your
edits resolves the display drift.

Orders are deliberately not in the admin. There is no order storage yet (see
"No database" above), so an order list would be a lie. Add a database first.

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
2. Add the three Stripe keys and register the webhook endpoint at `/api/webhooks/stripe`.
3. Move rate limiting to Upstash or Vercel KV. The in-memory bucket in `src/lib/rate-limit.ts`
   is per-instance, so on an autoscaled platform the effective limit is `limit × instances`.
4. Add a database if you want order history, and wire fulfilment into the webhook handler
   rather than the success page — the customer's browser may never reach the success page.
5. If you add an admin surface, it needs two-factor authentication before it ships. There is
   no login anywhere in this codebase today, by design.
6. Replace the sample reviews, and confirm each `compareAtMinor` against a real comparable.
