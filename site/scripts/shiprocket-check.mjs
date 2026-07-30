import crypto from "node:crypto";

/**
 * Fulfilment, without a Shiprocket account.
 *
 * What can be tested without one is exactly the part that matters most: whether
 * the endpoints that face the internet can be made to do something they should
 * not. A courier webhook that accepts an unauthenticated request is a stranger
 * marking your parcels delivered; a fulfilment path that ships an unpaid order
 * is free merchandise.
 *
 * The Shiprocket API calls themselves are not exercised here — that needs live
 * credentials — so what they do on success is asserted in the code's structure
 * (record the shipment id BEFORE assigning an AWB, so a retry cannot create two
 * shipments) rather than here.
 *
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_TOTP_SECRET=... \
 *     node scripts/shiprocket-check.mjs
 */

const BASE = process.env.BASE ?? "http://localhost:3100";
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const SECRET = process.env.ADMIN_TOTP_SECRET;
const WEBHOOK_TOKEN = process.env.SHIPROCKET_WEBHOOK_TOKEN;

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

async function call(p, opts = {}) {
  const r = await fetch(BASE + p, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    redirect: "manual",
  });
  let data = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data, headers: r.headers };
}

console.log("\nFulfilment\n");

/* ---- 1. The courier webhook cannot be driven by a stranger ---- */
console.log("1. The Shiprocket webhook rejects anything unauthenticated");

const statusBody = { order_id: "LI-FAKE-0001", shipment_id: 999999, current_status: "Delivered" };

const noToken = await call("/api/webhooks/shiprocket", { method: "POST", body: statusBody });
check("a request with no token is refused",
  noToken.status === 401 || noToken.status === 503, `HTTP ${noToken.status}`);

const wrongToken = await call("/api/webhooks/shiprocket", {
  method: "POST", headers: { "x-api-key": "not-the-token" }, body: statusBody,
});
check("a wrong token is refused",
  wrongToken.status === 401 || wrongToken.status === 503, `HTTP ${wrongToken.status}`);

if (WEBHOOK_TOKEN) {
  // A near-miss: right length, wrong content. Catches a comparison that only
  // checks length, and confirms the timing-safe path does not throw on it.
  const nearMiss = WEBHOOK_TOKEN.slice(0, -1) + (WEBHOOK_TOKEN.endsWith("z") ? "y" : "z");
  const near = await call("/api/webhooks/shiprocket", {
    method: "POST", headers: { "x-api-key": nearMiss }, body: statusBody,
  });
  check("a token of the right length but wrong content is refused", near.status === 401, `HTTP ${near.status}`);

  const short = await call("/api/webhooks/shiprocket", {
    method: "POST", headers: { "x-api-key": WEBHOOK_TOKEN.slice(0, 4) }, body: statusBody,
  });
  check("a truncated token is refused, without throwing", short.status === 401, `HTTP ${short.status}`);

  // Correct token, order that does not exist. Must acknowledge rather than
  // retry forever, and must not invent an order.
  const unknown = await call("/api/webhooks/shiprocket", {
    method: "POST", headers: { "x-api-key": WEBHOOK_TOKEN }, body: statusBody,
  });
  check("a valid token for an unknown order is acknowledged, not retried",
    unknown.status === 200, `HTTP ${unknown.status}`);
  check("it did not invent an order", unknown.data?.ignored === "unknown order",
    JSON.stringify(unknown.data));
} else {
  console.log("  … SHIPROCKET_WEBHOOK_TOKEN not set, skipping the authenticated cases");
}

/* ---- 2. The manual push is admin-only ---- */
console.log("\n2. The manual courier push is admin-only");
const anonPush = await call("/api/admin/fulfil", {
  method: "POST", body: { orderNumber: "LI-FAKE-0001" },
});
check("an unauthenticated push is refused",
  anonPush.status === 401 || anonPush.status === 404, `HTTP ${anonPush.status}`);

const forgedPush = await call("/api/admin/fulfil", {
  method: "POST",
  headers: { cookie: "lindienne_admin=forged.session.value" },
  body: { orderNumber: "LI-FAKE-0001" },
});
check("a forged session is refused",
  forgedPush.status === 401 || forgedPush.status === 404, `HTTP ${forgedPush.status}`);

/* ---- 3. An unpaid order cannot be shipped ---- */
if (EMAIL && PASSWORD && SECRET) {
  console.log("\n3. An unpaid order cannot be shipped");

  const login = await call("/api/admin/login", {
    method: "POST", body: { email: EMAIL, password: PASSWORD, code: totp(SECRET) },
  });
  check("admin sign-in succeeds", login.status === 200, `HTTP ${login.status}`);
  const authed = { cookie: (login.headers.get("set-cookie") ?? "").split(";")[0] };

  // A real, freshly created order — which is `pending`, never paid.
  const session = await call("/api/checkout/session", {
    method: "POST",
    body: {
      lines: [{ sku: "cl-001", quantity: 1, size: "M", colorway: "Ivory" }],
      shippingMethod: "standard",
      email: "unpaid@example.com",
      name: "Unpaid Order",
      phone: "+919876543211",
      shippingAddress: {
        line1: "9 Test Lane", city: "Kolkata", state: "West Bengal",
        postalCode: "700016", country: "IN",
      },
    },
  });
  check("a pending order was created", session.status === 200, `HTTP ${session.status}`);

  const push = await call("/api/admin/fulfil", {
    method: "POST", headers: authed, body: { orderNumber: session.data?.orderNumber },
  });
  // 503 when Shiprocket is not configured, 409 when it is and the order is
  // unpaid. Either way it must not report success.
  check("shipping an unpaid order does not succeed",
    push.status !== 200 || push.data?.ok === false,
    `HTTP ${push.status} ${JSON.stringify(push.data)?.slice(0, 100)}`);

  if (push.status === 409) {
    check("and it says why", /not been paid/i.test(push.data?.message ?? ""), push.data?.message);
  }

  const orders = await call("/api/admin/orders", { headers: authed });
  const order = orders.data?.orders?.find((o) => o.orderNumber === session.data?.orderNumber);
  check("the order carries no AWB", !order?.awbCode, order?.awbCode);
  check("the order is still pending", order?.status === "pending", order?.status);

  /* ---- 4. A courier update reaches a real order ---- */
  if (WEBHOOK_TOKEN) {
    console.log("\n4. A courier update reaches a real order");

    // A paid order, so there is something legitimately in transit.
    const paidSession = await call("/api/checkout/session", {
      method: "POST",
      body: {
        lines: [{ sku: "cl-001", quantity: 1, size: "M", colorway: "Ivory" }],
        shippingMethod: "standard",
        email: "shipped@example.com",
        name: "Shipped Order",
        phone: "+919876543212",
        shippingAddress: {
          line1: "11 Courier Road", city: "Kolkata", state: "West Bengal",
          postalCode: "700019", country: "IN",
        },
      },
    });
    await call("/api/orders/confirm", { method: "POST", body: { orderToken: paidSession.data?.orderToken } });
    const shipped = paidSession.data?.orderNumber;

    const hook = (body) => call("/api/webhooks/shiprocket", {
      method: "POST", headers: { "x-api-key": WEBHOOK_TOKEN }, body,
    });

    const transit = await hook({ order_id: shipped, awb: "TESTAWB123", courier_name: "Test Courier", current_status: "In Transit" });
    check("an in-transit update is accepted", transit.status === 200, `HTTP ${transit.status}`);

    let after = await call("/api/admin/orders", { headers: authed });
    let row = after.data?.orders?.find((o) => o.orderNumber === shipped);
    check("the order moved to in-transit", row?.fulfilmentStatus === "in-transit", row?.fulfilmentStatus);
    check("the AWB was recorded", row?.awbCode === "TESTAWB123", row?.awbCode);
    check("a tracking URL was derived", (row?.trackingUrl ?? "").includes("TESTAWB123"), row?.trackingUrl);
    check("the courier's own wording is kept verbatim", row?.courierStatus === "In Transit", row?.courierStatus);

    // An unrecognised status must not guess. Losing track of a parcel beats
    // claiming it was delivered when it was not.
    const odd = await hook({ order_id: shipped, current_status: "Reached Sorting Hub" });
    check("an unmapped status is accepted", odd.status === 200, `HTTP ${odd.status}`);
    after = await call("/api/admin/orders", { headers: authed });
    row = after.data?.orders?.find((o) => o.orderNumber === shipped);
    check("an unmapped status does not change our status", row?.fulfilmentStatus === "in-transit", row?.fulfilmentStatus);
    check("but it is still recorded verbatim", row?.courierStatus === "Reached Sorting Hub", row?.courierStatus);

    // "Out for delivery" contains "deliver" and must NOT be read as delivered.
    const ofd = await hook({ order_id: shipped, current_status: "Out For Delivery" });
    check("out-for-delivery is accepted", ofd.status === 200, `HTTP ${ofd.status}`);
    after = await call("/api/admin/orders", { headers: authed });
    row = after.data?.orders?.find((o) => o.orderNumber === shipped);
    check("out-for-delivery is NOT treated as delivered", row?.fulfilmentStatus === "in-transit", row?.fulfilmentStatus);

    const delivered = await hook({ order_id: shipped, current_status: "Delivered" });
    check("a delivered update is accepted", delivered.status === 200, `HTTP ${delivered.status}`);
    after = await call("/api/admin/orders", { headers: authed });
    row = after.data?.orders?.find((o) => o.orderNumber === shipped);
    check("the order is now delivered", row?.fulfilmentStatus === "delivered", row?.fulfilmentStatus);
    check("the AWB survived the later updates", row?.awbCode === "TESTAWB123", row?.awbCode);
    check("payment status was never touched by the courier", row?.status === "paid", row?.status);
  }

  await fetch(`${BASE}/api/admin/logout`, { method: "POST", headers: authed });
} else {
  console.log("\n  … admin credentials not set, skipping the unpaid-order case");
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exitCode = failed > 0 ? 1 : 0;
