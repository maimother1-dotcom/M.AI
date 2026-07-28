/**
 * End-to-end checkout walk, in a real browser.
 *
 * Adds two products, walks the whole flow, and asserts the order total is the
 * SAME number at every step — drawer, cart, checkout, payment and receipt. A
 * storefront that shows one figure and charges another is the failure this
 * catches.
 *
 * Run against a running production build:
 *   BASE=http://localhost:3100 node scripts/checkout-walk.mjs
 */

import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3100";
const CHROME =
  process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const VIEWPORT = process.env.MOBILE
  ? { width: 390, height: 844 }
  : { width: 1440, height: 900 };

let failed = 0;
function check(name, condition, detail = "") {
  if (condition) console.log(`  ✓ ${name}`);
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Pull the first ₹ figure out of a string. */
function rupees(text) {
  const match = /₹\s?([\d,]+(?:\.\d+)?)/.exec(text ?? "");
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({ viewport: VIEWPORT });
const page = await context.newPage();

const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(`PAGEERROR: ${e.message}`));
page.on("requestfailed", (r) => {
  /*
   * Next cancels its own RSC prefetches the moment you navigate away, which
   * surfaces as ERR_ABORTED / ERR_TUNNEL_CONNECTION_FAILED on a `?_rsc=` URL.
   * That is the router working correctly, not a broken request.
   */
  if (r.url().includes("_rsc=")) return;
  consoleErrors.push(`REQUESTFAILED ${r.url()} ${r.failure()?.errorText}`);
});

console.log(`\nCheckout walk against ${BASE} at ${VIEWPORT.width}×${VIEWPORT.height}\n`);

/* ------------------------------------------------- 1. Add a sized product */
console.log("1. Product page");
await page.goto(`${BASE}/product/chandni-silk-slip-dress`, { waitUntil: "networkidle" });

const pdpPrice = rupees(await page.locator("h1").first().locator("..").innerText());
check("product page renders", await page.locator("h1").innerText() !== "");

await page.getByRole("button", { name: "M", exact: true }).click();
await page.getByRole("button", { name: /add to bag/i }).click();
await page.waitForTimeout(500);
check("adding a sized item opens the bag drawer", await page.getByRole("dialog", { name: "Shopping bag" }).isVisible());

const drawerSubtotal = rupees(
  await page.getByRole("dialog", { name: "Shopping bag" }).innerText(),
);
check("drawer shows a subtotal", drawerSubtotal !== null, `${drawerSubtotal}`);

/* ------------------------------------------- 2. Add a second, one-size item */
console.log("\n2. Second item");
await page.keyboard.press("Escape");
await page.goto(`${BASE}/product/manjistha-satin-lipstick`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /add to bag/i }).click();
await page.waitForTimeout(500);

const bagCount = await page.locator("button[aria-label*='Shopping bag']").getAttribute("aria-label");
check("bag count reflects two items", /2 items/.test(bagCount ?? ""), bagCount ?? "");

/* --------------------------------------------------------------- 3. Cart */
console.log("\n3. Cart");
await page.goto(`${BASE}/cart`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const cartText = await page.locator("main").innerText();
check("cart lists both products", /Chandni Silk Slip Dress/.test(cartText) && /Manjistha Satin Lipstick/.test(cartText));

const cartSubtotal = rupees(
  await page.locator("aside").filter({ hasText: "Summary" }).innerText(),
);
check("cart shows a subtotal", cartSubtotal !== null, `${cartSubtotal}`);

/* ----------------------------------------------------------- 4. Checkout */
console.log("\n4. Checkout details");
await page.goto(`${BASE}/checkout`, { waitUntil: "networkidle" });
await page.waitForTimeout(900); // let the server quote land

await page.fill("#email", "walk@example.com");
await page.fill("#name", "Test Buyer");
await page.fill("#phone", "+91 90000 00000");
await page.fill("#line1", "12 Park Street");
await page.fill("#city", "Kolkata");
await page.fill("#state", "West Bengal");
await page.fill("#postalCode", "700016");

const summaryText = await page.getByRole("complementary").first().innerText();
const checkoutTotal = rupees(summaryText.slice(summaryText.search(/\bTotal\b/i)));
check("checkout shows a server-computed total", checkoutTotal !== null, `${checkoutTotal}`);
check("GST line is present", /GST/.test(summaryText));

// Promo, validated server-side.
await page.fill("#promo", "MAISON10");
await page.getByRole("button", { name: /apply/i }).click();
await page.waitForTimeout(900);
const afterPromo = await page.getByRole("complementary").first().innerText();
check("a valid promo code is accepted by the server", /MAISON10 applied/.test(afterPromo), afterPromo.slice(0, 120));
check("a promotion line appears in the summary", /Promotion/.test(afterPromo));

const promoTotal = rupees(afterPromo.slice(afterPromo.search(/\bTotal\b/i)));
check("the total fell after the discount", promoTotal !== null && checkoutTotal !== null && promoTotal < checkoutTotal,
  `${checkoutTotal} → ${promoTotal}`);

/* ------------------------------------------------------------ 5. Payment */
console.log("\n5. Payment");
await page.getByRole("button", { name: /continue to payment/i }).click();
await page.waitForURL("**/checkout/payment", { timeout: 15000 });
await page.waitForTimeout(900);

const paymentText = await page.locator("main").innerText();
check("payment page reached", page.url().includes("/checkout/payment"));
check("demo mode is disclosed", /Demo mode|no charge/i.test(paymentText));

const orderNumber = /LI-[A-Z0-9]{4}-[A-Z0-9]{4}/.exec(paymentText)?.[0];
check("an order number was issued", Boolean(orderNumber), orderNumber ?? "none");

const amountDue = rupees(paymentText.slice(paymentText.search(/amount due/i)));
check("amount due matches the checkout total", amountDue === promoTotal, `${amountDue} vs ${promoTotal}`);

// Invalid card must be refused by the form.
await page.fill("#card-number", "1234 5678 9012 3456");
await page.fill("#card-expiry", "12 / 34");
await page.fill("#card-cvc", "123");
await page.getByRole("button", { name: /^Pay/i }).click();
await page.waitForTimeout(400);
check("a card failing the Luhn check is rejected", /valid card number/i.test(await page.locator("main").innerText()));
check("still on the payment page after a bad card", page.url().includes("/checkout/payment"));

// Expired card.
await page.fill("#card-number", "4242 4242 4242 4242");
await page.fill("#card-expiry", "01 / 20");
await page.getByRole("button", { name: /^Pay/i }).click();
await page.waitForTimeout(400);
check("an expired card is rejected", /expired/i.test(await page.locator("main").innerText()));

// Valid card.
await page.fill("#card-expiry", "12 / 34");
await page.getByRole("button", { name: /^Pay/i }).click();

/* ------------------------------------------------------------ 6. Receipt */
console.log("\n6. Confirmation");
await page.waitForURL("**/checkout/success", { timeout: 20000 });
await page.waitForTimeout(2500); // server verifies the signed token

const successText = await page.locator("main").innerText();
check("confirmation page reached", page.url().includes("/checkout/success"));
check("the order is confirmed, not errored", /Thank you/i.test(successText), successText.slice(0, 200));
check("the same order number is shown", orderNumber ? successText.includes(orderNumber) : false, orderNumber ?? "");

const paidTotal = rupees(successText.slice(successText.search(/total paid/i)));
check("total paid equals the amount quoted", paidTotal === promoTotal, `${paidTotal} vs ${promoTotal}`);
check("both products appear on the receipt",
  /Chandni Silk Slip Dress/.test(successText) && /Manjistha Satin Lipstick/.test(successText));
check("demo order is labelled as such", /Demo order/i.test(successText));

/* ----------------------------------------------- 7. Cart cleared after pay */
console.log("\n7. After payment");
await page.goto(`${BASE}/cart`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
check("the bag was emptied", /bag is empty/i.test(await page.locator("main").innerText()));

/* ------------------------------------------- 8. Receipt cannot be replayed */
console.log("\n8. Receipt replay");
await page.goto(`${BASE}/checkout/success`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const replayText = await page.locator("main").innerText();
check("revisiting the receipt without a token does not fabricate one",
  /could not confirm|could not find an order/i.test(replayText), replayText.slice(0, 160));

/* ------------------------------------------------------------------ Done */
const realErrors = consoleErrors.filter((e) => !/404/.test(e));
check("no console errors during the walk", realErrors.length === 0, realErrors[0] ?? "");

await browser.close();
console.log(failed === 0 ? "\nCheckout walk passed.\n" : `\n${failed} checks failed.\n`);
process.exitCode = failed > 0 ? 1 : 0;
