import { chromium } from "@playwright/test";
const OUT = "/tmp/claude-0/-home-user-M-AI/0d351d90-188f-5a63-87a5-82f67e2e8e08/scratchpad/demo";
import fs from "node:fs"; fs.mkdirSync(OUT, { recursive: true });
const B = "http://localhost:3100";
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// Viewport-sized captures so the files stay small enough to send.
const shots = [
  ["01-home",        "/",                                  1440, 900],
  ["02-shop",        "/shop",                              1440, 1100],
  ["03-product",     "/product/pondichery-structured-tote",1440, 1000],
  ["04-jewellery",   "/shop/jewellery",                    1440, 1100],
  ["05-about",       "/about",                             1440, 900],
  ["06-editorial",   "/editorial",                         1440, 900],
];
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
for (const [name, path, w, h] of shots) {
  await p.setViewportSize({ width: w, height: h });
  await p.goto(B + path, { waitUntil: "networkidle" });
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${OUT}/${name}.png` });
}

// Mobile
const m = await b.newContext({ viewport: { width: 390, height: 844 } });
const mp = await m.newPage();
for (const [name, path] of [["07-mobile-home","/"],["08-mobile-shop","/shop"]]) {
  await mp.goto(B + path, { waitUntil: "networkidle" });
  await mp.waitForTimeout(900);
  await mp.screenshot({ path: `${OUT}/${name}.png` });
}

// Checkout + payment, seeded with a real cart
await p.setViewportSize({ width: 1440, height: 1000 });
await p.goto(`${B}/product/manjistha-satin-lipstick`, { waitUntil: "networkidle" });
await p.getByRole("button", { name: /add to bag/i }).click();
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/09-cart-drawer.png` });
await p.goto(`${B}/checkout`, { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
for (const [s,v] of [["#email","bijoy@example.com"],["#name","Bijoy Halder"],["#phone","+91 90000 00000"],["#line1","12 Park Street"],["#city","Kolkata"],["#state","West Bengal"],["#postalCode","700016"]]) await p.fill(s,v);
await p.screenshot({ path: `${OUT}/10-checkout.png` });
await p.getByRole("button", { name: /continue to payment/i }).click();
await p.waitForURL("**/checkout/payment", { timeout: 15000 });
await p.waitForTimeout(1200);
await p.screenshot({ path: `${OUT}/11-payment.png` });

await b.close();
const files = fs.readdirSync(OUT);
for (const f of files) console.log(f, (fs.statSync(`${OUT}/${f}`).size/1024).toFixed(0)+"KB");
