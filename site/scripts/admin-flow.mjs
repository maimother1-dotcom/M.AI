import crypto from "node:crypto";

/**
 * Authenticated admin flow.
 *
 * Signs in with a real TOTP code, then proves the thing that matters most:
 * an admin price edit reaches BOTH the checkout total and the prerendered
 * product page. A change that moves one without the other would show a customer
 * one price and charge them another.
 *
 * Needs the same credentials the server is running with:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_TOTP_SECRET=... \
 *   BASE=http://localhost:3100 node scripts/admin-flow.mjs
 */

const BASE = process.env.BASE ?? "http://localhost:3100";
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const SECRET = process.env.ADMIN_TOTP_SECRET;

if (!EMAIL || !PASSWORD || !SECRET) {
  console.error("Set ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_TOTP_SECRET to match the running server.");
  process.exit(1);
}
const creds = { secret: SECRET };

let passed = 0, failed = 0;
const check = (n, c, d="") => { c ? (passed++, console.log(`  ✓ ${n}`)) : (failed++, console.log(`  ✗ ${n}${d?` — ${d}`:""}`)); };

/* Generate a valid TOTP for the current step. */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function totp(secret) {
  let bits = "";
  for (const ch of secret) bits += B32.indexOf(ch).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i+8), 2));
  const key = Buffer.from(bytes);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(Date.now()/1000/30)));
  const d = crypto.createHmac("sha1", key).update(buf).digest();
  const o = d[d.length-1] & 0x0f;
  const bin = ((d[o]&0x7f)<<24)|((d[o+1]&0xff)<<16)|((d[o+2]&0xff)<<8)|(d[o+3]&0xff);
  return String(bin % 1000000).padStart(6, "0");
}

async function call(path, opts = {}) {
  const r = await fetch(BASE + path, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    redirect: "manual",
  });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data, headers: r.headers };
}

console.log("\nAuthenticated admin flow\n");

/* ---- Sign in with a real code ---- */
console.log("1. Sign in");
const login = await call("/api/admin/login", {
  method: "POST",
  body: { email: EMAIL, password: PASSWORD, code: totp(creds.secret) },
});
check("valid email + password + TOTP signs in", login.status === 200, `HTTP ${login.status}`);

const setCookie = login.headers.get("set-cookie") ?? "";
const session = /lindienne_admin=([^;]+)/.exec(setCookie)?.[1];
check("a session cookie was issued", Boolean(session));
check("the cookie is HttpOnly", /HttpOnly/i.test(setCookie), setCookie.slice(0,120));
check("the cookie is SameSite=Strict", /SameSite=Strict/i.test(setCookie));

const authed = { Cookie: `lindienne_admin=${session}` };

/* ---- Read ---- */
console.log("\n2. Read the catalogue");
const list = await call("/api/admin/products", { headers: authed });
check("the catalogue loads", list.status === 200, `HTTP ${list.status}`);
check("all 74 products are returned", list.data?.products?.length === 74, `${list.data?.products?.length}`);
check("the store reports its durability", typeof list.data?.store?.durable === "boolean",
  JSON.stringify(list.data?.store));

const original = list.data.products.find(p => p.id === "cl-001");
console.log(`     baseline price for cl-001: ${original.priceMinor} paise`);

/* ---- Validation ---- */
console.log("\n3. Edit validation");
for (const [label, body, expect] of [
  ["a javascript: image URL", { id:"cl-001", image:"javascript:alert(1)" }, 400],
  ["a data: image URL", { id:"cl-001", image:"data:text/html,<script>" }, 400],
  ["a plain http:// image URL", { id:"cl-001", image:"http://insecure.test/x.jpg" }, 400],
  ["a comparison price below the sale price", { id:"cl-001", priceMinor:500000, compareAtMinor:100000 }, 400],
  ["a negative price", { id:"cl-001", priceMinor:-100 }, 400],
  ["a zero-ish price below the floor", { id:"cl-001", priceMinor:1 }, 400],
  ["an unknown product", { id:"zz-999", priceMinor:100000 }, 404],
  ["a field outside the editable set", { id:"cl-001", slug:"hijacked" }, 400],
  ["a category change", { id:"cl-001", category:"beauty" }, 400],
]) {
  const r = await call("/api/admin/products", { method:"PATCH", headers: authed, body });
  check(`${label} is rejected`, r.status === expect, `HTTP ${r.status}`);
}

/* ---- The real test: does an edit reach the money? ---- */
console.log("\n4. An edit reaches the pricing authority");
const NEW_PRICE = 123400; // ₹1,234
const edit = await call("/api/admin/products", {
  method: "PATCH", headers: authed,
  body: { id: "cl-001", priceMinor: NEW_PRICE, stock: 5 },
});
check("the edit is accepted", edit.status === 200, `HTTP ${edit.status} ${JSON.stringify(edit.data)}`);
check("the returned product carries the new price", edit.data?.product?.priceMinor === NEW_PRICE,
  `${edit.data?.product?.priceMinor}`);

const quote = await call("/api/checkout/quote", {
  method: "POST",
  body: { lines: [{ sku:"cl-001", quantity:1, size:"M", colorway:"Ivory" }], shippingMethod:"standard" },
});
check("the CHECKOUT QUOTE uses the new price", quote.data?.totals?.subtotalMinor === NEW_PRICE,
  `quote subtotal ${quote.data?.totals?.subtotalMinor}, expected ${NEW_PRICE}`);

const pdp = await fetch(`${BASE}/product/chandni-silk-slip-dress`).then(r => r.text());
check("the PRODUCT PAGE shows the new price", pdp.includes("1,234"), "₹1,234 not found in HTML");

/* ---- Stock is enforced from the override too ---- */
console.log("\n5. Stock from the override is enforced");
const overStock = await call("/api/checkout/quote", {
  method: "POST",
  body: { lines: [{ sku:"cl-001", quantity:6, size:"M", colorway:"Ivory" }], shippingMethod:"standard" },
});
check("ordering more than the edited stock is refused", overStock.status === 409, `HTTP ${overStock.status}`);

/* ---- Revert ---- */
console.log("\n6. Revert");
const revert = await call("/api/admin/products?id=cl-001", { method:"DELETE", headers: authed });
check("revert succeeds", revert.status === 200, `HTTP ${revert.status}`);
check("the price returns to the committed catalogue",
  revert.data?.product?.priceMinor === original.priceMinor,
  `${revert.data?.product?.priceMinor} vs ${original.priceMinor}`);

const quoteAfter = await call("/api/checkout/quote", {
  method: "POST",
  body: { lines: [{ sku:"cl-001", quantity:1, size:"M", colorway:"Ivory" }], shippingMethod:"standard" },
});
check("checkout returns to the committed price",
  quoteAfter.data?.totals?.subtotalMinor === original.priceMinor,
  `${quoteAfter.data?.totals?.subtotalMinor}`);

/* ---- Logout ---- */
console.log("\n7. Sign out");
const logout = await fetch(`${BASE}/api/admin/logout`, { method:"POST", headers: authed });
const cleared = logout.headers.get("set-cookie") ?? "";
check("logout expires the cookie", /Max-Age=0/i.test(cleared), cleared.slice(0,100));

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exitCode = failed > 0 ? 1 : 0;
