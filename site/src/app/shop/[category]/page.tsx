import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { categories, getCategory } from "@/data/categories";
import { getProductsByCategory } from "@/data/products";
import { ShopGrid } from "@/components/shop/ShopGrid";
import { MotifDivider } from "@/components/brand/Motif";
import { Container } from "@/components/ui";

/** Pre-render every category at build time. There are six and they never change. */
export function generateStaticParams() {
  return categories.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  const category = getCategory(slug);
  if (!category) return { title: "Not found" };

  return {
    title: category.name,
    description: category.intro.slice(0, 155),
    openGraph: { title: `${category.name} · L'INDIENNE`, description: category.tagline },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ sub?: string }>;
}) {
  const { category: slug } = await params;
  const { sub } = await searchParams;

  const category = getCategory(slug);
  if (!category) notFound();

  const items = getProductsByCategory(category.slug);
  // Ignore a `?sub=` that is not a real subcategory rather than showing an empty grid.
  const validSub = category.subcategories.some((s) => s.slug === sub) ? sub : undefined;

  return (
    <>
      <header className="border-b border-line py-16 lg:py-24">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow mb-4">{items.length} pieces</p>
            <h1 className="text-balance text-4xl sm:text-5xl lg:text-6xl">{category.name}</h1>
            <p className="mt-5 font-display text-xl italic text-madder">{category.tagline}</p>
            <MotifDivider className="mx-auto my-8 max-w-[220px]" />
            <p className="text-pretty text-sm leading-relaxed text-ink-soft">{category.intro}</p>
          </div>
        </Container>
      </header>

      <Container className="py-14 lg:py-20">
        <ShopGrid products={items} category={category} initialSub={validSub} />
      </Container>
    </>
  );
}
