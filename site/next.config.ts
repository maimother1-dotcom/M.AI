import type { NextConfig } from "next";

/**
 * Static security headers.
 *
 * The Content-Security-Policy is NOT set here — it is generated per-request in
 * `src/middleware.ts` so that it can carry a fresh nonce. Everything below is
 * request-independent and therefore cheaper to serve from the edge config.
 */
const securityHeaders = [
  // Force HTTPS for two years, including subdomains. TLS everywhere, no exceptions.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // This site is never legitimately framed. Clickjacking a "Pay now" button is
  // the exact attack this prevents.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    // Stripe needs payment; nothing else on this site needs any of these.
    // Origins in a Permissions-Policy allowlist are structured-header strings,
    // so they take DOUBLE quotes. Single quotes are a CSP convention and make
    // Chrome reject the entire header as unparseable — silently dropping every
    // other restriction on this line with it.
    value:
      'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")',
  },
  // Isolate the browsing context group so cross-origin popups cannot reach back
  // into this window.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  images: {
    // Product art is generated SVG rendered inline, so nothing remote is needed
    // out of the box. When real photography is added, whitelist its host here.
    remotePatterns: [],
    formats: ["image/avif", "image/webp"],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
