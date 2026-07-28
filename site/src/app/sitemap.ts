import type { MetadataRoute } from "next";
import { categories } from "@/data/categories";
import { editorial } from "@/data/editorial";
import { products } from "@/data/products";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lindienne.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes = [
    { path: "", priority: 1.0, changeFrequency: "daily" as const },
    { path: "/shop", priority: 0.9, changeFrequency: "daily" as const },
    { path: "/about", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/editorial", priority: 0.7, changeFrequency: "weekly" as const },
    { path: "/contact", priority: 0.4, changeFrequency: "yearly" as const },
    { path: "/help/shipping", priority: 0.4, changeFrequency: "monthly" as const },
    { path: "/help/returns", priority: 0.4, changeFrequency: "monthly" as const },
    { path: "/help/size-guide", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/help/faq", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/legal/privacy", priority: 0.2, changeFrequency: "yearly" as const },
    { path: "/legal/terms", priority: 0.2, changeFrequency: "yearly" as const },
  ];

  return [
    ...staticRoutes.map((route) => ({
      url: `${BASE}${route.path}`,
      lastModified: now,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
    ...categories.map((category) => ({
      url: `${BASE}/shop/${category.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...products.map((product) => ({
      url: `${BASE}/product/${product.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...editorial.map((story) => ({
      url: `${BASE}/editorial/${story.slug}`,
      lastModified: new Date(story.publishedAt),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
