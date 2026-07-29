import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Order storage, end to end against a running production build.
 *
 * What this is actually testing:
 *
 *   1. A checkout writes an order BEFORE the customer pays, as `pending`. If it
 *      only wrote on success, an abandoned or failed payment would leave no
 *      trace and a successful payment during a webhook outage would leave a
 *      charged customer with no order at all.
 *   2. Confirming a demo order moves it to `paid` — once. A replayed
 *      confirmation must not look like a second sale.
 *   3. The orders API is admin-only. It returns names, emails, phone numbers and
 *      home addresses, so an unauthenticated GET must not reach it.
 *   4. The file on disk is encrypted. Orders are personal data; a plaintext JSON
 *      file of customer addresses on a VPS is a breach waiting for one
 *      misconfigured directory listing.
 *
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_TOTP_SECRET=... \
 *     ORDER_SIGNING_SECRET=... node scripts/orders-check.mjs
 */

const BASE = process.env.BASE ?? "http://localhost:3100";
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const SECRET = process.env.ADMIN_TOTP_SECRET;
const ORDERS_PATH = path.join(process.cwd(), "data", "orders.enc.json");

if (!EMAIL || !PASSWORD || !SECRET) {
  console.error("Set ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_TOTP_SECRET to match the running server.");
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

console.log("\nOrder storage\n");

/* ---- 1. The admin surface is closed before we start ---- */
console.log("1. The orders API is not public");
const anon = await call("/api/admin/orders");
check("an unauthenticated GET is refused", anon.status === 401 || anon.status === 404, `HTTP ${anon.status}`);
check("no order data leaks in the refusal", !anon.data?.orders, JSON.stringify(anon.data)?.slice(0, 80));

const forged = await call("/api/admin/orders", { headers: { cookie: "lindienne_admin=forged.session.value" } });
check("a forged session cookie is refused", forged.status === 401 || forged.status === 404, `HTTP ${forged.status}`);

/* ---- 2. Sign in ---- */
console.log("\n2. Sign in");
const login = await call("/api/admin/login", {
  method: "POST",
  body: { email: EMAIL, password: PASSWORD, code: totp(SECRET) },
});
check("admin sign-in succeeds", login.status === 200, `HTTP ${login.status}`);
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
const authed = { cookie };

const before = await call("/api/admin/orders", { headers: authed });
check("the orders list is readable when signed in", before.status === 200, `HTTP ${before.status}`);
const countBefore = before.data?.orders?.length ?? 0;

/* ---- 3. A checkout records the order before payment ---- */
console.log("\n3. A checkout records the order as pending");
const session = await call("/api/checkout/session", {
  method: "POST",
  body: {
    lines: [{ sku: "cl-001", quantity: 1, size: "M", colorway: "Ivory" }],
    shippingMethod: "standard",
    email: "orders-check@example.com",
    name: "Order Check",
    phone: "+919876543210",
    shippingAddress: {
      line1: "12 Park Street",
      city: "Kolkata",
      state: "West Bengal",
      postalCode: "700016",
      country: "IN",
    },
  },
});
check("checkout session is created", session.status === 200, `HTTP ${session.status} ${JSON.stringify(session.data)?.slice(0, 120)}`);
const orderNumber = session.data?.orderNumber;
const orderToken = session.data?.orderToken;
const total = session.data?.totals?.totalMinor;

const afterCreate = await call("/api/admin/orders", { headers: authed });
const created = afterCreate.data?.orders?.find((o) => o.orderNumber === orderNumber);
check("the order appears in the list", Boolean(created), `looking for ${orderNumber}`);
check("it is recorded as pending, before any payment", created?.status === "pending", created?.status);
check("its total matches the server's own figure", created?.totals?.totalMinor === total, `${created?.totals?.totalMinor} vs ${total}`);
check("the customer's address was captured", created?.shippingAddress?.postalCode === "700016", created?.shippingAddress?.postalCode);
check("the list grew by exactly one", (afterCreate.data?.orders?.length ?? 0) === countBefore + 1);

/* ---- 4. Confirmation moves it to paid, idempotently ---- */
console.log("\n4. Confirmation marks it paid, once");
const confirm = await call("/api/orders/confirm", { method: "POST", body: { orderToken } });
check("the receipt confirms", confirm.status === 200, `HTTP ${confirm.status}`);

const afterPaid = await call("/api/admin/orders", { headers: authed });
const paidOrder = afterPaid.data?.orders?.find((o) => o.orderNumber === orderNumber);
check("the order is now paid", paidOrder?.status === "paid", paidOrder?.status);
check("paidAt was stamped", Boolean(paidOrder?.paidAt), paidOrder?.paidAt);

// Replaying the confirmation must not create a second sale or a second order.
await call("/api/orders/confirm", { method: "POST", body: { orderToken } });
const afterReplay = await call("/api/admin/orders", { headers: authed });
check("a replayed confirmation does not duplicate the order",
  afterReplay.data?.orders?.filter((o) => o.orderNumber === orderNumber).length === 1);
check("a replayed confirmation leaves it paid",
  afterReplay.data?.orders?.find((o) => o.orderNumber === orderNumber)?.status === "paid");

/* ---- 5. A forged order token writes nothing ---- */
console.log("\n5. A forged token cannot invent an order");
const tampered = orderToken.slice(0, -3) + (orderToken.slice(-3) === "AAA" ? "BBB" : "AAA");
const forgedConfirm = await call("/api/orders/confirm", { method: "POST", body: { orderToken: tampered } });
check("a tampered order token is rejected", forgedConfirm.status === 400, `HTTP ${forgedConfirm.status}`);
const afterForge = await call("/api/admin/orders", { headers: authed });
check("no order was created by the forgery",
  (afterForge.data?.orders?.length ?? 0) === countBefore + 1,
  `${afterForge.data?.orders?.length} orders, expected ${countBefore + 1}`);

/* ---- 6. Encrypted at rest ---- */
console.log("\n6. Orders are encrypted at rest");
const backend = before.data?.store?.mode ?? "unknown";
console.log(`  (backend: ${backend})`);

// A second order, so the IV check below has two ciphertexts to compare. A
// repeated (key, IV) pair in GCM is catastrophic, so it is worth asserting
// rather than trusting that randomBytes was called.
await call("/api/checkout/session", {
  method: "POST",
  body: {
    lines: [{ sku: "cl-002", quantity: 1, size: "M", colorway: "Ivory" }],
    shippingMethod: "standard",
    email: "iv-check@example.com",
    name: "IV Check",
    phone: "+919876500000",
    shippingAddress: { line1: "1 Test Road", city: "Kolkata", state: "West Bengal", postalCode: "700017", country: "IN" },
  },
});

if (backend === "postgres") {
  // Read the row straight out of Postgres, the way a leaked backup or a
  // compromised database host would see it. None of the customer must be there.
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL ?? process.env.POSTGRES_URL });
  await client.connect();
  const { rows } = await client.query("select * from orders where order_number = $1", [orderNumber]);
  const row = rows[0];
  check("the order row exists in Postgres", Boolean(row));

  const raw = JSON.stringify(row ?? {});
  check("the customer's name is not readable in the database", !raw.includes("Order Check"));
  check("the customer's email is not readable in the database", !raw.includes("orders-check@example.com"));
  check("the customer's address is not readable in the database", !raw.includes("Park Street"));
  check("the customer's phone is not readable in the database", !raw.includes("9876543210"));
  check("what they bought is not readable in the database", !raw.includes("Chandni"));

  // The queryable columns must still be there, or the admin list would have to
  // decrypt every row to sort and total.
  check("status stays queryable in a column", row?.status === "paid", row?.status);
  check("the total stays queryable in a column", Number(row?.total_minor) === total, `${row?.total_minor}`);

  let envelope = null;
  try { envelope = JSON.parse(row?.payload ?? "null"); } catch {}
  check("the payload is a versioned AES-GCM envelope",
    envelope?.v === 1 && typeof envelope.iv === "string" && typeof envelope.tag === "string",
    Object.keys(envelope ?? {}).join(","));

  const second = await client.query(
    "select payload from orders where order_number <> $1 order by created_at desc limit 1",
    [orderNumber],
  );
  check("each row uses a fresh IV",
    Boolean(second.rows[0]) && JSON.parse(second.rows[0].payload).iv !== envelope?.iv);

  await client.end();
} else if (!fs.existsSync(ORDERS_PATH)) {
  check("the order file exists on disk", false, `${ORDERS_PATH} not found — run this from site/`);
} else {
  const raw = fs.readFileSync(ORDERS_PATH, "utf8");
  check("the customer's name is not readable on disk", !raw.includes("Order Check"));
  check("the customer's email is not readable on disk", !raw.includes("orders-check@example.com"));
  check("the customer's address is not readable on disk", !raw.includes("Park Street"));
  check("the customer's phone is not readable on disk", !raw.includes("9876543210"));
  check("the order number is not readable on disk", !raw.includes(orderNumber));

  let envelope = null;
  try { envelope = JSON.parse(raw); } catch {}
  check("it is a versioned AES-GCM envelope",
    envelope?.v === 1 && typeof envelope.iv === "string" && typeof envelope.tag === "string",
    Object.keys(envelope ?? {}).join(","));

  const mode = (fs.statSync(ORDERS_PATH).mode & 0o777).toString(8);
  check("the file is not world-readable", mode === "600", `mode ${mode}`);

  // One more order, so there are two writes of the same file to compare.
  const extra = await call("/api/checkout/session", {
    method: "POST",
    body: {
      lines: [{ sku: "cl-001", quantity: 1, size: "M", colorway: "Ivory" }],
      shippingMethod: "standard",
      email: "iv-check-2@example.com",
      name: "IV Check Two",
      phone: "+919876500001",
      shippingAddress: { line1: "2 Test Road", city: "Kolkata", state: "West Bengal", postalCode: "700018", country: "IN" },
    },
  });
  check("the extra order was accepted", extra.status === 200, `HTTP ${extra.status}`);
  const nextIv = JSON.parse(fs.readFileSync(ORDERS_PATH, "utf8")).iv;
  check("each write uses a fresh IV", nextIv !== envelope?.iv, `${envelope?.iv} vs ${nextIv}`);
}

/* ---- 7. Sign out closes the list again ---- */
console.log("\n7. Sign out");
await fetch(`${BASE}/api/admin/logout`, { method: "POST", headers: authed });
const afterLogout = await call("/api/admin/orders");
check("the orders list is closed after signing out",
  afterLogout.status === 401 || afterLogout.status === 404, `HTTP ${afterLogout.status}`);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exitCode = failed > 0 ? 1 : 0;
