import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lindienne.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Order state and personal data live under these. Nothing here should ever
      // be crawled, and /api is disallowed so bots do not hammer rate-limited
      // endpoints on our behalf.
      disallow: ["/api/", "/admin", "/admin/", "/checkout", "/checkout/", "/cart", "/wishlist", "/search"],
    },
    sitemap: `${BASE}/sitemap.xml`,
  };
}
