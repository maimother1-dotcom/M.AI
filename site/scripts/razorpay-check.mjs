/**
 * Razorpay signature verification checks.
 *
 * Razorpay's browser callback is the one place where a payment result arrives
 * from an untrusted source. If the signature check is wrong, anyone can POST
 * "I paid" and get merchandise. These tests exercise that logic directly against
 * the same HMAC scheme Razorpay uses, so they run without a Razorpay account.
 *
 *   node scripts/razorpay-check.mjs
 */

import crypto from "node:crypto";

let passed = 0;
let failed = 0;
const check = (name, condition, detail = "") => {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const KEY_SECRET = "test_secret_do_not_use_in_production";

/** Mirror of verifyPaymentSignature() in src/lib/razorpay.ts. */
function verifyPaymentSignature({ orderId, paymentId, signature }, secret = KEY_SECRET) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length) return false;
  return crypto.timingSafeEqual(given, want);
}

function verifyWebhookSignature(rawBody, signature, secret = KEY_SECRET) {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length) return false;
  return crypto.timingSafeEqual(given, want);
}

const sign = (orderId, paymentId, secret = KEY_SECRET) =>
  crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");

console.log("\nRazorpay signature verification\n");

/* ------------------------------------------------------ 1. The happy path */
console.log("1. Genuine payment");
{
  const orderId = "order_ABC123";
  const paymentId = "pay_XYZ789";
  const signature = sign(orderId, paymentId);
  check(
    "a signature produced with our key secret verifies",
    verifyPaymentSignature({ orderId, paymentId, signature }),
  );
}

/* -------------------------------------------------------- 2. Forgery */
console.log("\n2. Forgery");
{
  const orderId = "order_ABC123";
  const paymentId = "pay_XYZ789";

  check(
    "an invented signature is rejected",
    !verifyPaymentSignature({ orderId, paymentId, signature: "a".repeat(64) }),
  );
  check(
    "an empty signature is rejected",
    !verifyPaymentSignature({ orderId, paymentId, signature: "" }),
  );
  check(
    "a signature made with the WRONG secret is rejected",
    !verifyPaymentSignature({
      orderId,
      paymentId,
      signature: sign(orderId, paymentId, "attacker-guessed-secret"),
    }),
  );
  check(
    "a signature for a DIFFERENT order is rejected",
    !verifyPaymentSignature({
      orderId,
      paymentId,
      signature: sign("order_SOMETHING_ELSE", paymentId),
    }),
  );
  check(
    "a signature for a DIFFERENT payment is rejected",
    !verifyPaymentSignature({
      orderId,
      paymentId,
      signature: sign(orderId, "pay_SOMETHING_ELSE"),
    }),
  );
  // The classic mistake: concatenating without the separator, so that
  // ("ab","c") and ("a","bc") collide.
  const a = sign("order_ab", "pay_c");
  const b = sign("order_a", "bpay_c");
  check("the order|payment separator prevents a concatenation collision", a !== b);
}

/* ------------------------------------------------ 3. Bit-level tampering */
console.log("\n3. Tampering");
{
  const orderId = "order_ABC123";
  const paymentId = "pay_XYZ789";
  const good = sign(orderId, paymentId);

  const flipped = good.slice(0, -1) + (good.at(-1) === "a" ? "b" : "a");
  check("flipping one character of the signature is rejected",
    !verifyPaymentSignature({ orderId, paymentId, signature: flipped }));

  check("a truncated signature is rejected",
    !verifyPaymentSignature({ orderId, paymentId, signature: good.slice(0, 32) }));

  check("a padded signature is rejected",
    !verifyPaymentSignature({ orderId, paymentId, signature: good + "00" }));
}

/* --------------------------------------------------------- 4. Webhooks */
console.log("\n4. Webhook signatures");
{
  const body = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: "pay_1", amount: 689000, notes: { orderNumber: "LI-AAAA-BBBB" } } } },
  });

  const good = crypto.createHmac("sha256", KEY_SECRET).update(body).digest("hex");
  check("a correctly signed webhook verifies", verifyWebhookSignature(body, good));
  check("an unsigned webhook is rejected", !verifyWebhookSignature(body, ""));
  check("a webhook signed with the wrong secret is rejected",
    !verifyWebhookSignature(body, crypto.createHmac("sha256", "wrong").update(body).digest("hex")));

  // The most important one: the signature covers the exact bytes. Re-serialising
  // JSON changes them, which is why the route must use the raw body.
  const reserialised = JSON.stringify(JSON.parse(body).payload);
  check("a modified body no longer matches its signature",
    !verifyWebhookSignature(reserialised, good));

  const tampered = body.replace('"amount":689000', '"amount":100');
  check("changing the amount in the body invalidates the signature",
    !verifyWebhookSignature(tampered, good));
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exitCode = failed > 0 ? 1 : 0;
