/**
 * Adversarial checks against the admin surface.
 *
 * The admin can change what every product costs, so it is the highest-value
 * target on the site. These are the attacks it has to survive:
 *
 *   1. Can the catalogue be read or edited without signing in?
 *   2. Does a correct password alone get in, without the TOTP code?
 *   3. Is the login brute-forceable?
 *   4. Does the session cookie resist tampering?
 *   5. Can an edit smuggle in a javascript: image URL?
 *   6. Can pricing be set to something nonsensical?
 *
 * Run with the admin CONFIGURED (see npm run admin:setup):
 *   BASE=http://localhost:3100 node scripts/admin-check.mjs
 *
 * With the admin switched off, it asserts the surface returns 404 instead.
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

async function call(path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    /* html or empty */
  }
  return { status: response.status, data };
}

console.log(`\nAdmin surface checks against ${BASE}\n`);

/* ------------------------------------------------- Is the admin configured? */
const probe = await call("/api/admin/products");
const adminEnabled = probe.status !== 404;

console.log(adminEnabled ? "Admin is CONFIGURED\n" : "Admin is NOT configured\n");

if (!adminEnabled) {
  console.log("Switched-off behaviour");
  check("the products API 404s rather than 401s", probe.status === 404, `HTTP ${probe.status}`);

  const login = await call("/api/admin/login", {
    method: "POST",
    body: { email: "a@b.com", password: "x", code: "000000" },
  });
  check("the login API 404s", login.status === 404, `HTTP ${login.status}`);

  const exp = await call("/api/admin/export");
  check("the export API 404s", exp.status === 404, `HTTP ${exp.status}`);

  const page = await fetch(`${BASE}/admin`, { redirect: "manual" });
  check("the /admin page 404s", page.status === 404, `HTTP ${page.status}`);

  console.log(
    "\nA 404 rather than a 401 is deliberate: an unconfigured admin should not\n" +
      "advertise that there is anything here to attack.",
  );
} else {
  /* ------------------------------------------------------ 1. Unauthenticated */
  console.log("1. Unauthenticated access");
  check("reading the catalogue requires a session", probe.status === 401, `HTTP ${probe.status}`);

  const patch = await call("/api/admin/products", {
    method: "PATCH",
    body: { id: "cl-001", priceMinor: 100 },
  });
  check("editing a price requires a session", patch.status === 401, `HTTP ${patch.status}`);

  const del = await call("/api/admin/products?id=cl-001", { method: "DELETE" });
  check("reverting requires a session", del.status === 401, `HTTP ${del.status}`);

  const exp = await call("/api/admin/export");
  check("exporting requires a session", exp.status === 401, `HTTP ${exp.status}`);

  /* --------------------------------------------------- 2. Password without 2FA */
  console.log("\n2. Second factor");
  const noCode = await call("/api/admin/login", {
    method: "POST",
    body: { email: process.env.ADMIN_EMAIL ?? "admin@example.com", password: "whatever" },
  });
  check("a login without a code is rejected", noCode.status >= 400, `HTTP ${noCode.status}`);

  const wrongCode = await call("/api/admin/login", {
    method: "POST",
    body: {
      email: process.env.ADMIN_EMAIL ?? "admin@example.com",
      password: process.env.ADMIN_PASSWORD ?? "wrong-password",
      code: "000000",
    },
  });
  check(
    "a correct password with a wrong code does not sign in",
    wrongCode.status === 401,
    `HTTP ${wrongCode.status}`,
  );
  check(
    "the error does not reveal which factor failed",
    wrongCode.data?.message === "Sign-in failed.",
    `message: ${wrongCode.data?.message}`,
  );

  /* -------------------------------------------------------- 3. Brute force */
  console.log("\n3. Brute force");
  let limited = false;
  for (let i = 0; i < 12; i++) {
    const attempt = await call("/api/admin/login", {
      method: "POST",
      body: { email: "attacker@example.com", password: "guess", code: "123456" },
    });
    if (attempt.status === 429) {
      limited = true;
      break;
    }
  }
  check("repeated sign-in attempts get rate limited", limited, "no 429 within 12 attempts");

  /* ------------------------------------------------------- 4. Session forgery */
  console.log("\n4. Session forgery");
  for (const [label, cookie] of [
    ["a garbage cookie", "lindienne_admin=not-a-session"],
    ["a cookie with no signature", "lindienne_admin=eyJzdWIiOiJhIn0"],
    [
      "a forged payload with an invented signature",
      `lindienne_admin=${Buffer.from(JSON.stringify({ sub: "admin@example.com", exp: Date.now() + 999999 })).toString("base64url")}.aGFjaw`,
    ],
  ]) {
    const attempt = await call("/api/admin/products", { headers: { Cookie: cookie } });
    check(`${label} is rejected`, attempt.status === 401, `HTTP ${attempt.status}`);
  }

  console.log(
    "\nNote: checks 5 and 6 (image URL and pricing validation) need a real\n" +
      "session. Sign in through the UI, then re-run with ADMIN_COOKIE set to\n" +
      "test them end to end.",
  );

  const cookie = process.env.ADMIN_COOKIE;
  if (cookie) {
    const authed = { Cookie: `lindienne_admin=${cookie}` };

    console.log("\n5. Image URL injection");
    for (const bad of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "http://insecure.example.com/x.jpg"]) {
      const attempt = await call("/api/admin/products", {
        method: "PATCH",
        headers: authed,
        body: { id: "cl-001", image: bad },
      });
      check(`${bad.slice(0, 24)}… is rejected`, attempt.status === 400, `HTTP ${attempt.status}`);
    }

    console.log("\n6. Pricing validation");
    const inverted = await call("/api/admin/products", {
      method: "PATCH",
      headers: authed,
      body: { id: "cl-001", priceMinor: 500000, compareAtMinor: 100000 },
    });
    check(
      "a comparison price below the sale price is rejected",
      inverted.status === 400,
      `HTTP ${inverted.status}`,
    );

    const negative = await call("/api/admin/products", {
      method: "PATCH",
      headers: authed,
      body: { id: "cl-001", priceMinor: -100 },
    });
    check("a negative price is rejected", negative.status === 400, `HTTP ${negative.status}`);

    const unknown = await call("/api/admin/products", {
      method: "PATCH",
      headers: authed,
      body: { id: "zz-999", priceMinor: 100000 },
    });
    check("editing an unknown product is rejected", unknown.status >= 400, `HTTP ${unknown.status}`);

    const extra = await call("/api/admin/products", {
      method: "PATCH",
      headers: authed,
      body: { id: "cl-001", slug: "hijacked", category: "clothing" },
    });
    check(
      "fields outside the editable set are rejected",
      extra.status === 400,
      `HTTP ${extra.status}`,
    );
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exitCode = failed > 0 ? 1 : 0;
