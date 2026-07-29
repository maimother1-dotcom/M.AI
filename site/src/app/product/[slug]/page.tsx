import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { products } from "@/data/products";
import { getCatalogBySlug, getCatalogRelated } from "@/lib/admin/store";
import { getReviewsForProduct } from "@/data/reviews";
import { BuyBox } from "@/components/product/BuyBox";
import { ProductCard } from "@/components/product/ProductCard";
import { MotifDivider } from "@/components/brand/Motif";
import { Container, SectionHeading, Stars } from "@/components/ui";
import { displayPrice } from "@/lib/currency";

/**
 * Rendered per request, because the price on this page must be the price
 * checkout charges.
 *
 * This page reads the admin override store, which changes at runtime. Prerendered
 * HTML cannot: `revalidatePath` does not reliably reach a route that was baked at
 * build time, and `next start` renders in worker processes that would each hold
 * their own stale copy. The result was a page showing the committed price while
 * `/api/checkout/quote` returned the edited one. Do not make this static again
 * while the catalogue is mutable at runtime.
 */
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = getCatalogBySlug(slug);
  if (!product) return { title: "Not found" };

  return {
    title: product.name,
    description: product.summary,
    openGraph: {
      title: `${product.name} · L'INDIENNE`,
      description: product.summary,
      type: "website",
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getCatalogBySlug(slug);
  if (!product) notFound();

  const related = getCatalogRelated(product, 4);
  const productReviews = getReviewsForProduct(product.slug);

  /**
   * Product structured data. Google shows price and rating in results from this,
   * and getting it wrong is worse than omitting it — so availability and price
   * are read from the same catalog the checkout prices against.
   */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.summary,
    category: product.category,
    material: product.materials.join(", "),
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      price: (product.priceMinor / 100).toFixed(2),
      availability:
        product.stock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: product.rating,
      reviewCount: product.reviewCount,
    },
  };

  return (
    <>
      {/* Static JSON, not user input — nothing here can be injected into. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Container className="py-10 lg:py-16">
        <BuyBox product={product} />
      </Container>

      {/* Reviews */}
      {productReviews.length > 0 && (
        <section className="border-t border-line py-20 lg:py-28">
          <Container>
            <div className="grid gap-12 lg:grid-cols-[280px_1fr] lg:gap-20">
              <div>
                <p className="eyebrow mb-4">Reviews</p>
                <p className="font-display text-6xl leading-none tabular">{product.rating}</p>
                <Stars rating={product.rating} className="mt-4" />
                <p className="mt-3 text-xs text-ink-muted tabular">
                  Based on {product.reviewCount} reviews
                </p>
                <MotifDivider className="mt-8 max-w-[160px]" />
              </div>

              <div className="divide-y divide-line">
                {productReviews.map((review) => (
                  <article key={review.id} className="py-7 first:pt-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <Stars rating={review.rating} />
                      {review.verified && (
                        <span className="eyebrow text-[9px] text-madder">Verified purchase</span>
                      )}
                    </div>
                    <h3 className="mt-3 font-display text-xl">{review.title}</h3>
                    <p className="mt-2.5 text-pretty text-sm leading-relaxed text-ink-soft">
                      {review.body}
                    </p>
                    <p className="mt-4 text-xs text-ink-muted">
                      {review.author} · {review.location} ·{" "}
                      {new Date(review.date).toLocaleDateString("en-IN", {
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </Container>
        </section>
      )}

      {/* The pricing argument, repeated at the point of decision */}
      <section className="border-t border-line bg-ivory-deep py-20 lg:py-24">
        <Container>
          <div className="mx-auto grid max-w-4xl gap-10 sm:grid-cols-3">
            {[
              {
                figure: displayPrice(product.compareAtMinor),
                label: "Typical boutique price",
                note: "For a comparable piece of this construction and material.",
              },
              {
                figure: displayPrice(product.priceMinor),
                label: "Our price",
                note: "One margin, applied once, direct from the workshop.",
                accent: true,
              },
              {
                figure: displayPrice(product.compareAtMinor - product.priceMinor),
                label: "What you keep",
                note: "The difference is distribution, not quality.",
              },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <p
                  className={`font-display text-3xl tabular sm:text-4xl ${
                    item.accent ? "text-madder" : "text-ink"
                  }`}
                >
                  {item.figure}
                </p>
                <p className="eyebrow mt-3">{item.label}</p>
                <p className="mt-3 text-xs leading-relaxed text-ink-muted">{item.note}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Related */}
      {related.length > 0 && (
        <section className="py-20 lg:py-28">
          <Container>
            <SectionHeading eyebrow="You may also like" title="From the same category" />
            <div className="mt-14 grid grid-cols-2 gap-x-5 gap-y-12 lg:grid-cols-4">
              {related.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </Container>
        </section>
      )}
    </>
  );
}
