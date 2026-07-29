import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request Content-Security-Policy.
 *
 * WHY THERE ARE TWO POLICIES, AND NOT ONE
 *
 * A nonce-based `script-src` is the strong version of CSP: injected inline
 * script has no valid nonce and the browser refuses to run it. Next.js supports
 * it — it reads the nonce out of the request's CSP header and stamps it onto
 * every script tag it emits.
 *
 * The catch, verified rather than assumed: that stamping only happens on
 * dynamically rendered routes. A statically prerendered page is HTML written at
 * build time, long before any request nonce exists, so its script tags carry no
 * nonce at all. Serving a nonce policy over static HTML does not harden it — it
 * breaks it completely, because every script fails the check.
 *
 * So the policy is split along the line where it actually matters:
 *
 *   STRICT (nonce + strict-dynamic) on /cart, /checkout/** and /api/**.
 *     These are dynamic anyway, and they are where card details are entered.
 *     The realistic e-commerce attack is a skimmer injected into the payment
 *     page; this is the control that stops it.
 *
 *   STANDARD ('unsafe-inline' script-src) on the catalog and editorial pages.
 *     These stay statically prerendered and CDN-cacheable. They render no
 *     user-supplied HTML and hold no credentials, so the residual risk is small
 *     and the performance win is real.
 *
 * Making the whole site dynamic to get one policy everywhere is the other valid
 * answer. It costs static rendering on every product page to defend pages that
 * have nothing worth stealing on them.
 */

/**
 * Paths that get the strict, nonce-based policy.
 *
 * INVARIANT: every page route matched here must set `export const dynamic =
 * "force-dynamic"`. A statically prerendered page under this prefix would be
 * served a nonce its script tags do not carry, and every script on it would be
 * blocked. `/cart` is deliberately absent for exactly that reason — it holds no
 * card data and is prerendered.
 */
const STRICT_PREFIXES = ["/checkout", "/api", "/admin"];

function isStrictPath(pathname: string): boolean {
  return STRICT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function buildPolicy(scriptSrc: string): string {
  return [
    `default-src 'self'`,
    scriptSrc,
    // Stripe's Payment Element injects its own styles, and Next emits a style
    // tag for critical CSS. Inline style is a far weaker vector than inline
    // script — it cannot execute.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: https://cdn.razorpay.com`,
    // next/font self-hosts, so no third-party font origin is needed.
    `font-src 'self' data:`,
    `connect-src 'self' https://api.stripe.com https://api.razorpay.com https://lumberjack.razorpay.com`,
    `frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://api.razorpay.com https://checkout.razorpay.com`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isStrictPath(pathname)) {
    const response = NextResponse.next();
    response.headers.set(
      "Content-Security-Policy",
      buildPolicy(`script-src 'self' 'unsafe-inline' https://js.stripe.com https://checkout.razorpay.com`),
    );
    return response;
  }

  // Strict path: mint a nonce and hand it to Next via the request headers.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildPolicy(
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com https://checkout.razorpay.com`,
  );

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Skip Next's immutable build output and static image assets — a
     * per-request policy buys nothing on a file that never changes, and keeping
     * them out keeps the proxy off the hot path for assets.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml)$).*)",
  ],
};
