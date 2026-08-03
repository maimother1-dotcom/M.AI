import crypto from "node:crypto";

/**
 * Returns and refunds.
 *
 * This is the only endpoint on the site that moves money OUT, so the tests are
 * about the ways that could go wrong:
 *
 *   - The amount must never be influenced by a request. There is no field for
 *     it; this checks that adding one is rejected rather than honoured.
 *   - A refund must happen at most once, however many times the button is
 *     pressed or the request is repeated.
 *   - Stock goes back when the parcel does, not when the money does, and never
 *     twice.
 *   - A partial return refunds a proportionate share of a promo discount, not
 *     the list price.
 *
 *   DATABASE_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_TOTP_SECRET=... \
 *     node scripts/returns-check.mjs
 */

const BASE = process.env.BASE ?? "http://localhost:3100";
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const SECRET = process.env.ADMIN_TOTP_SECRET;
const DB = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!EMAIL || !PASSWORD || !SECRET || !DB) {
  console.error("Set DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_TOTP_SECRET.");
  process.exit(1);
}

let passed = 0, failed = 0;
const check = (n, c, d = "") => {
  c ? (passed++, console.log(`  ✓ ${n}`)) : (failed++, console.log(`  ✗ ${n}${d ? ` — ${d}` : ""}`));
};

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function totp(secret) {
  let bits = "";
  for (const ch of secret) bits += B32.indexOf(ch).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const d = crypto.createHmac("sha1", Buffer.from(bytes)).update(buf).digest();
  const o = d[d.length - 1] & 0x0f;
  const bin = ((d[o] & 0x7f) << 24) | ((d[o + 1] & 0xff) << 16) | ((d[o + 2] & 0xff) << 8) | (d[o + 3] & 0xff);
  return String(bin % 1000000).padStart(6, "0");
}

let caller = 0;
async function call(p, opts = {}) {
  const ip = opts.ip ?? `10.7.${Math.floor(caller / 250)}.${(caller++ % 250) + 1}`;
  const r = await fetch(BASE + p, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip, ...(opts.headers ?? {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    redirect: "manual",
  });
  let data = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

const { Client } = await import("pg");
const db = new Client({ connectionString: DB });
await db.connect();

const stockOf = async (sku) => {
  const { rows } = await db.query("select on_hand, reserved from stock where sku = $1", [sku]);
  return rows[0] ?? { on_hand: null, reserved: null };
};

console.log("\nReturns and refunds\n");

/* ---- 1. The endpoint is admin-only ---- */
console.log("1. Only an admin can move money");
const anonPost = await call("/api/admin/returns", {
  method: "POST", body: { orderNumber: "LI-AAAA-AAAA", reason: "size", lines: [{ sku: "cl-001", quantity: 1 }] },
});
check("an unauthenticated return is refused", anonPost.status === 401 || anonPost.status === 404, `HTTP ${anonPost.status}`);

const anonPatch = await call("/api/admin/returns", { method: "PATCH", body: { rma: "RMA-AAA-AAA", action: "refund" } });
check("an unauthenticated refund is refused", anonPatch.status === 401 || anonPatch.status === 404, `HTTP ${anonPatch.status}`);

const forged = await call("/api/admin/returns", {
  method: "PATCH", headers: { cookie: "lindienne_admin=forged.session" }, body: { rma: "RMA-AAA-AAA", action: "refund" },
});
check("a forged session is refused", forged.status === 401 || forged.status === 404, `HTTP ${forged.status}`);

/* ---- 2. A paid order to return against ---- */
console.log("\n2. A paid order");
const login = await fetch(`${BASE}/api/admin/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-forwarded-for": "10.7.200.1" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD, code: totp(SECRET) }),
});
check("admin sign-in succeeds", login.status === 200, `HTTP ${login.status}`);
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
const authed = { cookie };

// The stock ledger is created on first use, so warm it before setting a
// baseline — otherwise this reads as "relation does not exist" rather than as
// the test's own ordering mistake.
await call("/api/checkout/quote", {
  method: "POST",
  body: { lines: [{ sku: "cl-001", quantity: 1, size: "M", colorway: "Ivory" }], shippingMethod: "standard" },
});
await call("/api/checkout/session", {
  method: "POST",
  body: {
    lines: [{ sku: "cl-001", quantity: 1, size: "M", colorway: "Ivory" }],
    shippingMethod: "standard",
    email: "warm@example.com", name: "Warm Up", phone: "+919876500001",
    shippingAddress: { line1: "0 Warm Road", city: "Kolkata", state: "West Bengal", postalCode: "700016", country: "IN" },
  },
});
await db.query("update stock set on_hand = 20, reserved = 0 where sku in ('cl-001','bt-001')");

const session = await call("/api/checkout/session", {
  method: "POST",
  body: {
    lines: [
      { sku: "cl-001", quantity: 2, size: "M", colorway: "Ivory" },
      { sku: "bt-001", quantity: 1, size: "One size", colorway: "Madder" },
    ],
    shippingMethod: "standard",
    promoCode: "MAISON10",
    email: "returns-check@example.com",
    name: "Returns Check",
    phone: "+919876500555",
    shippingAddress: { line1: "5 Return Road", city: "Kolkata", state: "West Bengal", postalCode: "700016", country: "IN" },
  },
});
check("checkout succeeded", session.status === 200, `HTTP ${session.status}`);
const orderNumber = session.data?.orderNumber;
const orderTotal = session.data?.totals?.totalMinor;

await call("/api/orders/confirm", { method: "POST", body: { orderToken: session.data?.orderToken } });
const soldStock = await stockOf("cl-001");
check("the sale took stock off the shelf", Number(soldStock.on_hand) === 18, `on_hand ${soldStock.on_hand}`);

/* ---- 3. The amount cannot be supplied ---- */
console.log("\n3. The refund amount is never in the request");
const withAmount = await call("/api/admin/returns", {
  method: "POST",
  headers: authed,
  body: {
    orderNumber, reason: "size",
    lines: [{ sku: "cl-001", quantity: 1 }],
    refundableMinor: 99_999_00,
  },
});
check("a body carrying an amount is rejected outright", withAmount.status === 400, `HTTP ${withAmount.status}`);

/* ---- 4. Raising a partial return ---- */
console.log("\n4. A partial return is priced from what was paid");
const raised = await call("/api/admin/returns", {
  method: "POST", headers: authed,
  body: { orderNumber, reason: "size", lines: [{ sku: "cl-001", quantity: 1 }] },
});
check("the return is raised", raised.status === 200, `HTTP ${raised.status} ${JSON.stringify(raised.data)?.slice(0,120)}`);
const rma = raised.data?.return?.rma;
const refundable = raised.data?.return?.refundableMinor;
check("it has an RMA", /^RMA-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(rma ?? ""), rma);

// One of two dresses at ₹6,890 each, less its share of a 10% order discount.
// The share of the discount attaching to the dress line is 10% of it, so the
// unit refund is 6890 × 0.9 = ₹6,201.
check("the refund is the discounted unit price, not list", refundable === 620100, `${refundable}`);
check("it is less than the order total", refundable < orderTotal, `${refundable} vs ${orderTotal}`);

/* ---- 5. Nothing moves before the parcel arrives ---- */
console.log("\n5. Nothing moves before the parcel arrives");
const earlyRefund = await call("/api/admin/returns", {
  method: "PATCH", headers: authed, body: { rma, action: "refund" },
});
check("refunding before receipt is refused", earlyRefund.status === 409, `HTTP ${earlyRefund.status}`);
check("and it says why", /received/i.test(earlyRefund.data?.message ?? ""), earlyRefund.data?.message);
check("stock has not moved", Number((await stockOf("cl-001")).on_hand) === 18);

/* ---- 6. Receiving restocks, once ---- */
console.log("\n6. Receiving puts it back on the shelf");
const received = await call("/api/admin/returns", { method: "PATCH", headers: authed, body: { rma, action: "receive" } });
check("the parcel is received", received.status === 200, `HTTP ${received.status}`);
check("the piece is back on the shelf", Number((await stockOf("cl-001")).on_hand) === 19,
  `on_hand ${(await stockOf("cl-001")).on_hand}`);

const receivedAgain = await call("/api/admin/returns", { method: "PATCH", headers: authed, body: { rma, action: "receive" } });
check("receiving twice is refused", receivedAgain.status === 409, `HTTP ${receivedAgain.status}`);
check("and did not invent stock", Number((await stockOf("cl-001")).on_hand) === 19,
  `on_hand ${(await stockOf("cl-001")).on_hand}`);

/* ---- 7. The refund happens once ---- */
console.log("\n7. The refund happens exactly once");
const refunded = await call("/api/admin/returns", { method: "PATCH", headers: authed, body: { rma, action: "refund" } });
check("the refund goes through", refunded.status === 200, `HTTP ${refunded.status}`);
check("for the amount the server computed", refunded.data?.amountMinor === refundable,
  `${refunded.data?.amountMinor} vs ${refundable}`);

// Two more attempts, and three simultaneous ones. None may add a rupee.
await call("/api/admin/returns", { method: "PATCH", headers: authed, body: { rma, action: "refund" } });
await Promise.all(
  Array.from({ length: 3 }, () =>
    call("/api/admin/returns", { method: "PATCH", headers: authed, body: { rma, action: "refund" } })),
);

const { rows: after } = await db.query("select status, refunded_minor, restocked from returns where rma = $1", [rma]);
check("the record shows exactly one refund", Number(after[0]?.refunded_minor) === refundable,
  `refunded_minor ${after[0]?.refunded_minor}`);
check("its status is refunded", after[0]?.status === "refunded", after[0]?.status);
check("stock was not raised again by the refund", Number((await stockOf("cl-001")).on_hand) === 19,
  `on_hand ${(await stockOf("cl-001")).on_hand}`);

/* ---- 8. A partial refund leaves the order paid ---- */
console.log("\n8. A partial refund does not close the order");
const { rows: orderRow } = await db.query("select status from orders where order_number = $1", [orderNumber]);
check("the order is still paid, for what the customer kept", orderRow[0]?.status === "paid", orderRow[0]?.status);

/* ---- 9. The customer can see it ---- */
console.log("\n9. The customer sees the return on their order");
const lookup = await call("/api/orders/lookup", {
  method: "POST", body: { orderNumber, email: "returns-check@example.com" },
});
check("the lookup succeeds", lookup.status === 200, `HTTP ${lookup.status}`);
const shown = lookup.data?.returns?.find((r) => r.rma === rma);
check("the return is listed", Boolean(shown), JSON.stringify(lookup.data?.returns));
check("with the refunded amount", shown?.refundedMinor === refundable, `${shown?.refundedMinor}`);
check("and no internal reason code leaks", !("reason" in (shown ?? {})), Object.keys(shown ?? {}).join(","));

/* ---- 10. Returning everything refunds shipping too ---- */
console.log("\n10. A full return includes the delivery charge");
const express = await call("/api/checkout/session", {
  method: "POST",
  body: {
    lines: [{ sku: "bt-001", quantity: 1, size: "One size", colorway: "Madder" }],
    shippingMethod: "express",
    email: "full-return@example.com",
    name: "Full Return",
    phone: "+919876500554",
    shippingAddress: { line1: "6 Return Road", city: "Kolkata", state: "West Bengal", postalCode: "700016", country: "IN" },
  },
});
await call("/api/orders/confirm", { method: "POST", body: { orderToken: express.data?.orderToken } });

const fullReturn = await call("/api/admin/returns", {
  method: "POST", headers: authed,
  body: { orderNumber: express.data?.orderNumber, reason: "changed-mind", lines: [{ sku: "bt-001", quantity: 1 }] },
});
check("the full return is raised", fullReturn.status === 200, `HTTP ${fullReturn.status}`);
check("it refunds the whole order including express delivery",
  fullReturn.data?.return?.refundableMinor === express.data?.totals?.totalMinor,
  `${fullReturn.data?.return?.refundableMinor} vs ${express.data?.totals?.totalMinor}`);

const fullRma = fullReturn.data?.return?.rma;
await call("/api/admin/returns", { method: "PATCH", headers: authed, body: { rma: fullRma, action: "receive" } });
await call("/api/admin/returns", { method: "PATCH", headers: authed, body: { rma: fullRma, action: "refund" } });
const { rows: fullOrder } = await db.query("select status from orders where order_number = $1", [express.data?.orderNumber]);
check("a full refund marks the order refunded", fullOrder[0]?.status === "refunded", fullOrder[0]?.status);

/* ---- 11. You cannot return more than was bought ---- */
console.log("\n11. You cannot return more than was bought");
const overReturn = await call("/api/admin/returns", {
  method: "POST", headers: authed,
  body: { orderNumber, reason: "size", lines: [{ sku: "cl-001", quantity: 99 }] },
});
check("an over-quantity return is capped, not honoured",
  overReturn.status !== 200 || overReturn.data?.return?.refundableMinor <= orderTotal,
  `HTTP ${overReturn.status} ${overReturn.data?.return?.refundableMinor}`);

await db.end();
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exitCode = failed > 0 ? 1 : 0;
