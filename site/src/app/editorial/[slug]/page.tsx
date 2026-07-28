import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { editorial, getStory } from "@/data/editorial";
import { getProduct } from "@/data/products";
import { EditorialPlate } from "@/components/product/ProductImage";
import { ProductCard } from "@/components/product/ProductCard";
import { MotifDivider } from "@/components/brand/Motif";
import { Container, SectionHeading } from "@/components/ui";

export function generateStaticParams() {
  return editorial.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const story = getStory(slug);
  if (!story) return { title: "Not found" };

  return {
    title: story.title,
    description: story.dek,
    openGraph: {
      title: story.title,
      description: story.dek,
      type: "article",
      publishedTime: story.publishedAt,
    },
  };
}

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = getStory(slug);
  if (!story) notFound();

  const featured = story.featuredProducts.map(getProduct).filter((p) => p !== undefined);

  return (
    <article>
      <header className="border-b border-line py-16 lg:py-24">
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <p className="eyebrow mb-5">
              {story.category} · {story.readMinutes} min read ·{" "}
              {new Date(story.publishedAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
            <h1 className="text-balance text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">
              {story.title}
            </h1>
            <MotifDivider className="mx-auto my-9 max-w-[220px]" />
            <p className="text-pretty font-display text-xl italic leading-relaxed text-ink-soft sm:text-2xl">
              {story.dek}
            </p>
          </div>
        </Container>
      </header>

      <Container className="py-14 lg:py-20">
        <div className="relative mx-auto aspect-[16/9] max-w-4xl overflow-hidden">
          <EditorialPlate seed={`ed-${story.slug}`} />
          <div className="absolute inset-6 border border-ivory/30" />
        </div>

        {/* Body. Paragraphs prefixed "## " become subheadings. */}
        <div className="mx-auto mt-16 max-w-[68ch]">
          {story.body.map((paragraph, i) =>
            paragraph.startsWith("## ") ? (
              <h2 key={i} className="mt-14 text-3xl first:mt-0 sm:text-4xl">
                {paragraph.slice(3)}
              </h2>
            ) : (
              <p
                key={i}
                className={`text-pretty leading-[1.85] text-ink-soft ${
                  i === 0
                    ? "mt-8 text-lg first-letter:float-left first-letter:mr-3 first-letter:font-display first-letter:text-[4.5rem] first-letter:leading-[0.8] first-letter:text-madder"
                    : "mt-6 text-[15px]"
                }`}
              >
                {paragraph}
              </p>
            ),
          )}
        </div>

        <MotifDivider className="mx-auto mt-16 max-w-[220px]" />

        <p className="mt-10 text-center text-xs text-ink-muted">
          <Link href="/editorial" className="link-underline">
            ← All stories
          </Link>
        </p>
      </Container>

      {featured.length > 0 && (
        <section className="border-t border-line py-20 lg:py-28">
          <Container>
            <SectionHeading
              eyebrow="Referenced above"
              title="The pieces in this story"
            />
            <div className="mt-14 grid grid-cols-2 gap-x-5 gap-y-12 lg:grid-cols-4">
              {featured.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </Container>
        </section>
      )}
    </article>
  );
}
