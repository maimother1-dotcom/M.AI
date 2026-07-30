import crypto from "node:crypto";

/**
 * Inventory, and the race it exists to lose gracefully.
 *
 * The headline test fires N simultaneous checkouts at a product with 1 in stock
 * and asserts exactly one succeeds. That is not a stress test — it is the entire
 * reason the ledger exists. Reading stock and then deciding is a race both
 * buyers win; the check has to live inside the write.
 *
 * Needs Postgres. Without DATABASE_URL there is no ledger, nothing is reserved,
 * and the suite says so rather than passing vacuously.
 *
 *   DATABASE_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_TOTP_SECRET=... \
 *     node scripts/stock-check.mjs
 */

const BASE = process.env.BASE ?? "http://localhost:3100";
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const SECRET = process.env.ADMIN_TOTP_SECRET;
const DB = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!EMAIL || !PASSWORD || !SECRET) {
  console.error("Set ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_TOTP_SECRET to match the running server.");
  process.exit(1);
}
if (!DB) {
  console.error("Set DATABASE_URL. Without a ledger there is nothing here to test.");
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

/**
 * Each call comes from its own address by default.
 *
 * A race is twelve different customers, not one person hammering the endpoint,
 * and the checkout rate limiter is per-IP — so sharing one address would have
 * the limiter, rather than the ledger, decide who loses. That would test the
 * wrong thing and hide whether the ledger works at all.
 */
let caller = 0;
async function call(p, opts = {}) {
  const ip = opts.ip ?? `10.0.${Math.floor(caller / 250)}.${(caller++ % 250) + 1}`;
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

const SKU = "cl-001";
const buy = (qty = 1, tag = "race") => call("/api/checkout/session", {
  method: "POST",
  body: {
    lines: [{ sku: SKU, quantity: qty, size: "M", colorway: "Ivory" }],
    shippingMethod: "standard",
    email: `${tag}@example.com`,
    name: "Race Buyer",
    phone: "+919876500999",
    shippingAddress: { line1: "1 Race Road", city: "Kolkata", state: "West Bengal", postalCode: "700016", country: "IN" },
  },
});

const ledger = async () => {
  const { rows } = await db.query("select on_hand, reserved from stock where sku = $1", [SKU]);
  return rows[0] ?? { on_hand: null, reserved: null };
};

console.log("\nInventory\n");

/* ---- 1. The ledger seeds itself ---- */
console.log("1. The ledger seeds from the catalogue");
await buy(1, "seed");
const seeded = await ledger();
check("the SKU exists in the ledger", seeded.on_hand !== null, JSON.stringify(seeded));
check("a checkout holds a piece", Number(seeded.reserved) >= 1, `reserved ${seeded.reserved}`);

/* ---- 2. The race ---- */
console.log("\n2. Twelve people want the last piece");
await db.query("update stock set on_hand = 1, reserved = 0 where sku = $1", [SKU]);

const RACERS = 12;
const results = await Promise.all(
  Array.from({ length: RACERS }, (_, i) => buy(1, `racer-${i}`)),
);

const won = results.filter((r) => r.status === 200);
const lost = results.filter((r) => r.status === 409);

check("exactly one checkout succeeded", won.length === 1, `${won.length} succeeded of ${RACERS}`);
check("every other one was refused", lost.length === RACERS - 1, `${lost.length} refused`);
check("the refusals say it is out of stock",
  lost.every((r) => r.data?.error === "OUT_OF_STOCK"),
  [...new Set(lost.map((r) => r.data?.error))].join(","));
check("no request failed for any other reason",
  won.length + lost.length === RACERS,
  results.map((r) => r.status).join(","));

const afterRace = await ledger();
check("exactly one piece is held", Number(afterRace.reserved) === 1, `reserved ${afterRace.reserved}`);
check("nothing has left the shelf yet", Number(afterRace.on_hand) === 1, `on_hand ${afterRace.on_hand}`);
check("availability is now zero", Number(afterRace.on_hand) - Number(afterRace.reserved) === 0);

/* ---- 3. Paying converts the hold into a sale ---- */
console.log("\n3. Paying settles the hold");
const winner = won[0];
await call("/api/orders/confirm", { method: "POST", body: { orderToken: winner.data.orderToken } });

const afterPaid = await ledger();
check("the piece left the shelf", Number(afterPaid.on_hand) === 0, `on_hand ${afterPaid.on_hand}`);
check("the hold was cleared", Number(afterPaid.reserved) === 0, `reserved ${afterPaid.reserved}`);

// A retried webhook must not decrement twice, or the shelf count drifts below
// what is physically in the stockroom.
await call("/api/orders/confirm", { method: "POST", body: { orderToken: winner.data.orderToken } });
await call("/api/orders/confirm", { method: "POST", body: { orderToken: winner.data.orderToken } });
const afterReplay = await ledger();
check("a replayed confirmation does not decrement again",
  Number(afterReplay.on_hand) === 0 && Number(afterReplay.reserved) === 0,
  `on_hand ${afterReplay.on_hand}, reserved ${afterReplay.reserved}`);

/* ---- 4. Sold out means sold out ---- */
console.log("\n4. Sold out");
const soldOut = await buy(1, "too-late");
check("a further checkout is refused", soldOut.status === 409, `HTTP ${soldOut.status}`);
check("and it says so", soldOut.data?.error === "OUT_OF_STOCK", soldOut.data?.error);

const pdp = await fetch(`${BASE}/product/chandni-silk-slip-dress`, { cache: "no-store" }).then((r) => r.text());
check("the product page shows it as sold out", pdp.includes("Sold out"),
  "expected the buy button to read Sold out");
check("its structured data says OutOfStock", pdp.includes("OutOfStock"));

/* ---- 5. Duplicate lines cannot each take the full stock ---- */
console.log("\n5. Two lines of the same SKU are counted together");
await db.query("update stock set on_hand = 1, reserved = 0 where sku = $1", [SKU]);
const twoLines = await call("/api/checkout/session", {
  method: "POST",
  body: {
    lines: [
      { sku: SKU, quantity: 1, size: "M", colorway: "Ivory" },
      { sku: SKU, quantity: 1, size: "L", colorway: "Ivory" },
    ],
    shippingMethod: "standard",
    email: "two-lines@example.com",
    name: "Two Lines",
    phone: "+919876500998",
    shippingAddress: { line1: "2 Race Road", city: "Kolkata", state: "West Bengal", postalCode: "700016", country: "IN" },
  },
});
check("two lines totalling more than stock are refused", twoLines.status === 409, `HTTP ${twoLines.status}`);
const afterTwo = await ledger();
check("and neither line was left holding anything", Number(afterTwo.reserved) === 0,
  `reserved ${afterTwo.reserved}`);

/* ---- 6. Abandoned holds are swept ---- */
console.log("\n6. Abandoned holds are released");
await db.query("update stock set on_hand = 5, reserved = 0 where sku = $1", [SKU]);
const abandoned = await buy(2, "abandoned");
check("the checkout held two pieces", abandoned.status === 200, `HTTP ${abandoned.status}`);
check("the ledger shows the hold", Number((await ledger()).reserved) === 2);

// Age it past the reservation window rather than waiting an hour.
await db.query(
  "update orders set created_at = now() - interval '10 days' where order_number = $1",
  [abandoned.data.orderNumber],
);

// The sweep runs from the retention endpoint, which a cron drives.
const loginRes = await fetch(`${BASE}/api/admin/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD, code: totp(SECRET) }),
});
const cookie = (loginRes.headers.get("set-cookie") ?? "").split(";")[0];

const sweep = await call("/api/admin/retention", { method: "POST", headers: { cookie } });
check("the sweep runs", sweep.status === 200, `HTTP ${sweep.status}`);
check("it released the abandoned hold", sweep.data?.releasedHolds >= 1, `${sweep.data?.releasedHolds}`);

const afterSweep = await ledger();
check("the pieces are back on the shelf", Number(afterSweep.reserved) === 0, `reserved ${afterSweep.reserved}`);
check("without changing what is physically there", Number(afterSweep.on_hand) === 5,
  `on_hand ${afterSweep.on_hand}`);

// Sweeping twice must not release the same hold again.
const sweepAgain = await call("/api/admin/retention", { method: "POST", headers: { cookie } });
check("a second sweep releases nothing", sweepAgain.data?.releasedHolds === 0,
  `${sweepAgain.data?.releasedHolds}`);
check("and reserved stays at zero", Number((await ledger()).reserved) === 0);

/* ---- 7. An admin stock edit reaches the ledger ---- */
console.log("\n7. An admin stock edit reaches the ledger");
const edit = await call("/api/admin/products", {
  method: "PATCH", headers: { cookie }, body: { id: SKU, stock: 42 },
});
check("the edit is accepted", edit.status === 200, `HTTP ${edit.status}`);
check("the ledger followed it", Number((await ledger()).on_hand) === 42,
  `on_hand ${(await ledger()).on_hand}`);

const canBuy = await buy(1, "after-edit");
check("and checkout works again", canBuy.status === 200, `HTTP ${canBuy.status}`);

await db.end();
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exitCode = failed > 0 ? 1 : 0;
