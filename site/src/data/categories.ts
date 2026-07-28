import type { Category, CategorySlug } from "@/lib/types";

export const categories: Category[] = [
  {
    slug: "clothing",
    name: "Clothing",
    tagline: "Silk, wool, linen. Cut properly.",
    intro:
      "Everything here is cut from a natural fibre and finished by hand where it shows. Mulberry silk from Bangalore, merino spun in Ludhiana, linen woven in Kerala. The same mills that supply European houses, without the four seasons of markup in between.",
    subcategories: [
      { slug: "dresses", name: "Dresses" },
      { slug: "outerwear", name: "Coats & Jackets" },
      { slug: "knitwear", name: "Knitwear" },
      { slug: "silk", name: "Silk & Blouses" },
      { slug: "occasion", name: "Occasion" },
    ],
    artSeed: 11,
  },
  {
    slug: "bags",
    name: "Bags",
    tagline: "Full-grain leather. No logo tax.",
    intro:
      "Vegetable-tanned in Chennai, cut and stitched in the same workshops that produce for houses you already own. Full-grain hide, edge-painted by hand, unlined only where a lining would add weight and nothing else.",
    subcategories: [
      { slug: "tote", name: "Totes" },
      { slug: "shoulder", name: "Shoulder" },
      { slug: "clutch", name: "Clutches" },
      { slug: "mini", name: "Mini & Crossbody" },
    ],
    artSeed: 23,
  },
  {
    slug: "shoes",
    name: "Shoes",
    tagline: "Leather-lined. Built on a real last.",
    intro:
      "Every pair is leather-lined and built on a graded last rather than scaled from a single size, which is the difference between a shoe that breaks in and one that never stops hurting. Blake-stitched where the construction calls for it.",
    subcategories: [
      { slug: "heel", name: "Heels" },
      { slug: "flat", name: "Flats" },
      { slug: "boot", name: "Boots" },
      { slug: "sandal", name: "Sandals" },
    ],
    artSeed: 37,
  },
  {
    slug: "jewellery",
    name: "Jewellery",
    tagline: "Demi-fine. Honest about it.",
    intro:
      "Heavy 18k gold vermeil over recycled sterling, freshwater pearl, hand-set cubic zirconia, and meenakari enamel fired in Jaipur. No solid gold and no diamonds anywhere in this house, by choice. Everything is described by exactly what it is.",
    subcategories: [
      { slug: "earrings", name: "Earrings" },
      { slug: "necklaces", name: "Necklaces" },
      { slug: "rings", name: "Rings" },
      { slug: "bracelets", name: "Bracelets" },
    ],
    artSeed: 53,
  },
  {
    slug: "beauty",
    name: "Beauty",
    tagline: "Clean formulas. Weighted cases.",
    intro:
      "Formulated in Seoul and Grasse, filled in small batches, and put into cases with actual metal in them. Every shade is photographed on four skin depths, and the full INCI list is on every product page before you buy, not after.",
    subcategories: [
      { slug: "lip", name: "Lip" },
      { slug: "complexion", name: "Complexion" },
      { slug: "eyes", name: "Eyes" },
      { slug: "skincare", name: "Skincare" },
      { slug: "fragrance", name: "Fragrance" },
    ],
    artSeed: 71,
  },
  {
    slug: "accessories",
    name: "Accessories",
    tagline: "The last five percent.",
    intro:
      "Silk squares screen-printed by hand in twelve passes, acetate sunglasses cut from Mazzucchelli block, belts from the same hides as the bags. The pieces that finish an outfit, priced like they are not the point.",
    subcategories: [
      { slug: "scarves", name: "Silk Squares" },
      { slug: "sunglasses", name: "Sunglasses" },
      { slug: "belts", name: "Belts" },
      { slug: "small-leather", name: "Small Leather Goods" },
    ],
    artSeed: 89,
  },
];

export const categoryMap = new Map<CategorySlug, Category>(
  categories.map((c) => [c.slug, c]),
);

export function getCategory(slug: string): Category | undefined {
  return categoryMap.get(slug as CategorySlug);
}
