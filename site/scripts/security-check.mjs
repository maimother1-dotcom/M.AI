/**
 * Adversarial checks against the live server.
 *
 * These are not unit tests of happy paths — they are the specific attacks an
 * e-commerce site has to survive, run against a real running build:
 *
 *   1. Can the client dictate a price?
 *   2. Can the client dictate a quantity, or a negative one?
 *   3. Can a fabricated SKU be bought?
 *   4. Can a variant that does not exist be ordered?
 *   5. Can a discount amount be injected?
 *   6. Can an unsigned Stripe webhook mark an order paid?
 *   7. Can a tampered order token produce a receipt?
 *   8. Does rate limiting actually engage?
 *
 * Run: BASE=http://localhost:3100 node scripts/security-check.mjs
 */

const BASE = process.env.BASE ?? "http://localhost:3100";

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function post(path, body, headers = {}) {
  const response = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    /* non-JSON response */
  }
  return { status: response.status, data };
}

/** A legitimate line: the Chandni Silk Slip Dress, ₹6,890. */
const GOOD_LINE = { sku: "cl-001", quantity: 1, size: "M", colorway: "Ivory" };
const CATALOG_PRICE = 689000;

const CUSTOMER = {
  email: "test@example.com",
  name: "Test Buyer",
  phone: "+91 90000 00000",
  shippingAddress: {
    line1: "12 Park Street",
    city: "Kolkata",
    state: "West Bengal",
    postalCode: "700016",
    country: "India",
  },
};

console.log(`\nAdversarial checks against ${BASE}\n`);

/* ------------------------------------------------------------------ 0. Baseline */
console.log("Baseline");
{
  const { status, data } = await post("/api/checkout/quote", {
    lines: [GOOD_LINE],
    shippingMethod: "standard",
  });
  check("a legitimate cart prices successfully", status === 200, `HTTP ${status}`);
  check(
    "subtotal equals the catalog price",
    data?.totals?.subtotalMinor === CATALOG_PRICE,
    `got ${data?.totals?.subtotalMinor}, expected ${CATALOG_PRICE}`,
  );
}

/* --------------------------------------------------- 1. Price injection */
console.log("\n1. Price injection");
{
  const { status, data } = await post("/api/checkout/quote", {
    lines: [{ ...GOOD_LINE, price: 1, priceMinor: 1, unitPriceMinor: 1 }],
    shippingMethod: "standard",
  });
  // .strict() should reject the extra keys outright.
  check(
    "a line carrying a price is rejected, not silently ignored",
    status === 400,
    `HTTP ${status}`,
  );
  check(
    "no total was produced from the injected price",
    data?.totals === undefined,
    `leaked totals: ${JSON.stringify(data?.totals)}`,
  );
}
{
  const { status, data } = await post("/api/checkout/quote", {
    lines: [GOOD_LINE],
    shippingMethod: "standard",
    totals: { totalMinor: 100 },
    subtotalMinor: 100,
  });
  check("a body carrying its own totals is rejected", status === 400, `HTTP ${status}`);
  check("server did not adopt the supplied total", data?.totals?.totalMinor !== 100);
}

/* ------------------------------------------------------ 2. Quantity abuse */
console.log("\n2. Quantity abuse");
for (const [label, quantity] of [
  ["negative quantity", -5],
  ["zero quantity", 0],
  ["absurd quantity", 999999],
  ["fractional quantity", 1.5],
]) {
  const { status, data } = await post("/api/checkout/quote", {
    lines: [{ ...GOOD_LINE, quantity }],
    shippingMethod: "standard",
  });
  check(
    `${label} is rejected`,
    status >= 400,
    `HTTP ${status}, total ${data?.totals?.totalMinor}`,
  );
  if (data?.totals?.totalMinor !== undefined) {
    check(`${label} produced no negative total`, data.totals.totalMinor > 0);
  }
}

/* -------------------------------------------------------- 3. Unknown SKU */
console.log("\n3. Fabricated SKU");
{
  const { status } = await post("/api/checkout/quote", {
    lines: [{ ...GOOD_LINE, sku: "zz-999" }],
    shippingMethod: "standard",
  });
  check("a SKU that is not in the catalog cannot be bought", status >= 400, `HTTP ${status}`);
}
{
  const { status } = await post("/api/checkout/quote", {
    lines: [{ ...GOOD_LINE, sku: "'; DROP TABLE products;--" }],
    shippingMethod: "standard",
  });
  check("a SQL-shaped SKU is rejected by the schema", status === 400, `HTTP ${status}`);
}

/* ---------------------------------------------------- 4. Invalid variant */
console.log("\n4. Invalid variant");
{
  const { status } = await post("/api/checkout/quote", {
    lines: [{ ...GOOD_LINE, size: "XXXXL" }],
    shippingMethod: "standard",
  });
  check("a size the product does not come in is rejected", status >= 400, `HTTP ${status}`);
}
{
  const { status } = await post("/api/checkout/quote", {
    lines: [{ ...GOOD_LINE, colorway: "Solid Gold" }],
    shippingMethod: "standard",
  });
  check("a colourway that does not exist is rejected", status >= 400, `HTTP ${status}`);
}

/* --------------------------------------------------- 5. Discount injection */
console.log("\n5. Discount injection");
{
  const { status, data } = await post("/api/checkout/quote", {
    lines: [GOOD_LINE],
    shippingMethod: "standard",
    promoCode: "TOTALLYFAKE100",
  });
  check("an invented promo code does not apply", status === 200 && data?.appliedPromo === null,
    `HTTP ${status}, applied: ${data?.appliedPromo}`);
  check(
    "no discount was granted for the invented code",
    data?.totals?.discountMinor === 0,
    `discount ${data?.totals?.discountMinor}`,
  );
}
{
  // A real code, but below its minimum spend.
  const { status, data } = await post("/api/checkout/quote", {
    lines: [GOOD_LINE],
    shippingMethod: "standard",
    promoCode: "PARIS1686",
  });
  check(
    "a real code below its minimum spend does not apply",
    status === 200 && data?.appliedPromo === null,
    `applied: ${data?.appliedPromo}`,
  );
}
{
  const { status, data } = await post("/api/checkout/quote", {
    lines: [GOOD_LINE],
    shippingMethod: "standard",
    promoCode: "MAISON10",
  });
  const expected = Math.round(CATALOG_PRICE * 0.1);
  check(
    "a valid code applies exactly the server's percentage",
    status === 200 && data?.totals?.discountMinor === expected,
    `got ${data?.totals?.discountMinor}, expected ${expected}`,
  );
}

/* ---------------------------------------------------- 6. Webhook forgery */
console.log("\n6. Webhook forgery");
{
  const { status } = await post("/api/webhooks/stripe", {
    id: "evt_forged",
    type: "payment_intent.succeeded",
    data: { object: { amount: 100, metadata: { orderNumber: "LI-FAKE-0001" } } },
  });
  // 400 when configured (bad signature), 503 when Stripe is not configured.
  // Either way it must NOT be a 200.
  check(
    "an unsigned webhook is not accepted",
    status === 400 || status === 503,
    `HTTP ${status}`,
  );
}
{
  const { status } = await post(
    "/api/webhooks/stripe",
    { id: "evt_forged2", type: "payment_intent.succeeded", data: { object: {} } },
    { "stripe-signature": "t=1,v1=deadbeef" },
  );
  check("a webhook with a bogus signature is rejected", status !== 200, `HTTP ${status}`);
}

/* ------------------------------------------------- 7. Order token forgery */
console.log("\n7. Order token forgery");
{
  const { status } = await post("/api/orders/confirm", { orderToken: "totally.fake" });
  check("a garbage order token is rejected", status === 400, `HTTP ${status}`);
}
{
  // A well-formed but unsigned token: valid base64url payload, invented signature.
  const payload = Buffer.from(
    JSON.stringify({
      orderNumber: "LI-FAKE-0002",
      cart: { totals: { totalMinor: 1 }, lines: [] },
      paymentMode: "demo",
    }),
  ).toString("base64url");
  const forged = `${payload}.${Buffer.from("not-a-real-hmac").toString("base64url")}`;
  const { status, data } = await post("/api/orders/confirm", { orderToken: forged });
  check("a forged order token cannot produce a receipt", status === 400, `HTTP ${status}`);
  check("no order details leaked from the forged token", data?.orderNumber === undefined);
}
{
  // Take a genuine token and flip the total inside it.
  const session = await post("/api/checkout/session", {
    lines: [GOOD_LINE],
    shippingMethod: "standard",
    ...CUSTOMER,
  });

  if (session.status === 200 && session.data?.orderToken) {
    const [payload, signature] = session.data.orderToken.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const realTotal = decoded.cart.totals.totalMinor;
    decoded.cart.totals.totalMinor = 100;
    const tampered = `${Buffer.from(JSON.stringify(decoded)).toString("base64url")}.${signature}`;

    const confirmed = await post("/api/orders/confirm", { orderToken: tampered });
    check(
      "editing the total inside a real token invalidates it",
      confirmed.status === 400,
      `HTTP ${confirmed.status}`,
    );

    // And the untampered original still works, proving the check is not just
    // rejecting everything.
    const original = await post("/api/orders/confirm", {
      orderToken: session.data.orderToken,
    });
    check(
      "the untampered original token still verifies",
      original.status === 200 && original.data?.totals?.totalMinor === realTotal,
      `HTTP ${original.status}, total ${original.data?.totals?.totalMinor}`,
    );
  } else {
    check("could create a session to tamper with", false, `HTTP ${session.status}`);
  }
}

/* ------------------------------------------------------- 8. Rate limiting */
console.log("\n8. Rate limiting");
{
  const attempts = [];
  for (let i = 0; i < 25; i++) {
    attempts.push(
      post("/api/newsletter", { email: `flood${i}@example.com` }).then((r) => r.status),
    );
  }
  const statuses = await Promise.all(attempts);
  const limited = statuses.filter((s) => s === 429).length;
  check(`flooding the newsletter endpoint gets throttled`, limited > 0, `0 of 25 were 429`);
}

/* ------------------------------------------------------------------ Result */
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exitCode = failed > 0 ? 1 : 0;
