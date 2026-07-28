import Link from "next/link";
import { categories } from "@/data/categories";
import { products } from "@/data/products";
import { getCatalog, getCatalogBadged } from "@/lib/admin/store";
import { reviews } from "@/data/reviews";
import { editorial } from "@/data/editorial";
import { EditorialPlate, ProductImage } from "@/components/product/ProductImage";
import { ProductCard } from "@/components/product/ProductCard";
import { Motif, MotifDivider } from "@/components/brand/Motif";
import { ButtonLink, Container, SectionHeading, Stars } from "@/components/ui";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { displayPrice } from "@/lib/currency";

/* =========================================================================
   Trust strip
   ========================================================================= */

const TRUST = [
  {
    title: "Named specifications",
    body: "Micron counts, momme weights, plating thickness. If we claim it, it is on the page.",
  },
  {
    title: "Complimentary shipping",
    body: "On every order over ₹5,000. Two to three days on express, anywhere in India.",
  },
  {
    title: "Thirty-day returns",
    body: "Unworn, tags on, no questions and no restocking fee. We pay the return courier.",
  },
  {
    title: "Two-year repair",
    body: "Stitching, hardware, resoling. If it fails from making rather than wear, we fix it.",
  },
];

export function TrustStrip() {
  return (
    <section className="border-b border-line">
      <Container>
        <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
          {TRUST.map((item, i) => (
            <ScrollReveal
              key={item.title}
              delay={i * 90}
              className={`px-2 py-9 sm:px-6 lg:px-8 ${i > 0 ? "lg:border-l lg:border-line" : ""} ${
                i % 2 === 1 ? "sm:border-l sm:border-line" : ""
              } ${i > 1 ? "sm:border-t sm:border-line lg:border-t-0" : ""}`}
            >
              <Motif className="h-5 w-5 text-gold" />
              <h3 className="mt-4 text-sm uppercase tracking-[0.14em]">{item.title}</h3>
              <p className="mt-2.5 text-pretty text-xs leading-relaxed text-ink-muted">{item.body}</p>
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* =========================================================================
   Category tiles
   ========================================================================= */

export function CategoryTiles() {
  return (
    <section className="py-24 lg:py-32">
      <Container>
        <ScrollReveal>
          <SectionHeading
            eyebrow="The house edit"
            title="Six categories, one standard"
            description="Nothing here exists to fill a grid. Each piece was chosen because there was a specific reason it is better than the version you would otherwise buy."
          />
        </ScrollReveal>

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category, i) => (
            <ScrollReveal key={category.slug} delay={i * 80}>
              <Link
                href={`/shop/${category.slug}`}
                className="group relative block aspect-[4/5] overflow-hidden bg-ivory-deep"
              >
                <div className="absolute inset-0 transition-transform duration-[1.2s] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105">
                  <EditorialPlate seed={`cat-${category.slug}-${category.artSeed}`} />
                </div>

                <div className="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/10 to-transparent" />

                <div className="absolute inset-x-0 bottom-0 p-7">
                  <p className="eyebrow text-ivory/70">
                    {products.filter((p) => p.category === category.slug).length} pieces
                  </p>
                  <h3 className="mt-2.5 font-display text-3xl text-ivory">{category.name}</h3>
                  <p className="mt-1.5 text-sm text-ivory/80">{category.tagline}</p>
                  <span className="mt-5 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-gold">
                    Explore
                    <span className="inline-block transition-transform duration-500 group-hover:translate-x-1.5">
                      →
                    </span>
                  </span>
                </div>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* =========================================================================
   Bestsellers — a scroll-snap rail, which beats a JS carousel on mobile
   ========================================================================= */

export function Bestsellers() {
  const picks = getCatalogBadged("bestseller", 10);

  return (
    <section className="border-y border-line bg-ivory-deep py-24 lg:py-32">
      <Container wide>
        <ScrollReveal className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <p className="eyebrow mb-4">Most wanted</p>
            <h2 className="text-balance text-3xl sm:text-4xl lg:text-[2.75rem]">
              What the house is known for
            </h2>
          </div>
          <ButtonLink href="/shop" variant="secondary" size="sm">
            View everything
          </ButtonLink>
        </ScrollReveal>

        <div className="hide-scrollbar -mx-5 mt-14 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-4 sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
          {picks.map((product) => (
            <div
              key={product.id}
              className="w-[68vw] shrink-0 snap-start sm:w-[42vw] lg:w-[23vw] xl:w-[19vw]"
            >
              <ProductCard product={product} sizes="(max-width: 640px) 68vw, (max-width: 1024px) 42vw, 20vw" />
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-[11px] text-ink-muted lg:hidden">Swipe for more →</p>
      </Container>
    </section>
  );
}

/* =========================================================================
   Editorial split
   ========================================================================= */

export function EditorialSplit() {
  const story = editorial[0]!;

  return (
    <section className="py-24 lg:py-32">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <ScrollReveal>
            <div className="relative aspect-[4/5] overflow-hidden">
              <EditorialPlate seed={`ed-${story.slug}`} />
              <div className="absolute inset-6 border border-ivory/30" />
            </div>
          </ScrollReveal>

          <ScrollReveal delay={140}>
            <p className="eyebrow">{story.category}</p>
            <h2 className="mt-5 text-balance text-3xl sm:text-4xl lg:text-[2.75rem]">
              {story.title}
            </h2>
            <MotifDivider className="my-8 max-w-[180px]" />
            <p className="text-pretty text-base leading-relaxed text-ink-soft">{story.dek}</p>
            <p className="mt-5 text-pretty text-sm leading-relaxed text-ink-muted">
              {story.body[0]}
            </p>
            <ButtonLink href={`/editorial/${story.slug}`} variant="secondary" size="md" className="mt-9">
              Read the story
            </ButtonLink>
          </ScrollReveal>
        </div>
      </Container>
    </section>
  );
}

/* =========================================================================
   New arrivals
   ========================================================================= */

export function NewArrivals() {
  const fresh = getCatalogBadged("new", 8);

  return (
    <section className="py-24 lg:py-32">
      <Container>
        <ScrollReveal>
          <SectionHeading
            eyebrow="Just landed"
            title="New this season"
            description="Small drops, made in the quantities we can actually oversee. When a piece sells out it is because we made ninety of them, not because of a marketing decision."
          />
        </ScrollReveal>

        <div className="mt-16 grid grid-cols-2 gap-x-5 gap-y-12 lg:grid-cols-4">
          {fresh.map((product, i) => (
            <ScrollReveal key={product.id} delay={(i % 4) * 80}>
              <ProductCard product={product} />
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* =========================================================================
   Beauty spotlight — deliberately a different visual register
   ========================================================================= */

export function BeautySpotlight() {
  const beauty = getCatalog().filter((p) => p.category === "beauty").slice(0, 4);

  return (
    <section className="bg-indigo py-24 text-ivory lg:py-32">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <ScrollReveal className="lg:col-span-4">
            <p className="eyebrow text-gold">Beauty</p>
            <h2 className="mt-5 text-balance text-3xl text-ivory sm:text-4xl lg:text-[2.75rem]">
              Formulas that name their percentages
            </h2>
            <p className="mt-6 text-pretty text-sm leading-relaxed text-ivory/70">
              Fifteen percent L-ascorbic acid at pH 3.2. Twenty-four shades across three
              undertones. Twenty-two percent fragrance concentration. Numbers, because
              &ldquo;clinically proven&rdquo; is not one.
            </p>
            <Motif className="mt-9 h-8 w-8 text-gold" />
            <ButtonLink href="/shop/beauty" variant="light" size="md" className="mt-9">
              Shop beauty
            </ButtonLink>
          </ScrollReveal>

          <div className="grid grid-cols-2 gap-5 lg:col-span-8">
            {beauty.map((product, i) => (
              <ScrollReveal key={product.id} delay={i * 90}>
                <Link href={`/product/${product.slug}`} className="group block">
                  <div className="relative aspect-square overflow-hidden bg-indigo-deep">
                    <div className="h-full w-full transition-transform duration-[1.1s] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105">
                      <ProductImage
                        id={product.id}
                        name={product.name}
                        category={product.category}
                        subcategory={product.subcategory}
                        image={product.image}
                        sizes="(max-width: 1024px) 45vw, 22vw"
                      />
                    </div>
                  </div>
                  <h3 className="mt-4 font-display text-lg text-ivory transition-colors group-hover:text-gold">
                    {product.name}
                  </h3>
                  <p className="mt-1.5 text-sm text-ivory/60 tabular">
                    {displayPrice(product.priceMinor)}
                    <span className="ml-2 text-xs line-through opacity-60">
                      {displayPrice(product.compareAtMinor)}
                    </span>
                  </p>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

/* =========================================================================
   Reviews
   ========================================================================= */

export function Testimonials() {
  const featured = reviews.slice(0, 3);

  return (
    <section className="py-24 lg:py-32">
      <Container>
        <ScrollReveal>
          <SectionHeading eyebrow="From the house list" title="What people say when it arrives" />
        </ScrollReveal>

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {featured.map((review, i) => (
            <ScrollReveal key={review.id} delay={i * 110}>
              <figure className="flex h-full flex-col border border-line p-8">
                <Stars rating={review.rating} />
                <blockquote className="mt-5 flex-1">
                  <p className="font-display text-xl leading-snug">{review.title}</p>
                  <p className="mt-4 text-pretty text-sm leading-relaxed text-ink-soft">
                    {review.body}
                  </p>
                </blockquote>
                <figcaption className="mt-7 flex items-center justify-between border-t border-line pt-5 text-xs">
                  <span className="text-ink">
                    {review.author}
                    <span className="text-ink-muted"> · {review.location}</span>
                  </span>
                  {review.verified && (
                    <span className="eyebrow text-[9px] text-madder">Verified</span>
                  )}
                </figcaption>
              </figure>
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* =========================================================================
   Lookbook mosaic
   ========================================================================= */

export function Lookbook() {
  const picks = getCatalogBadged("editors-pick", 6);

  return (
    <section className="border-t border-line pt-24 lg:pt-32">
      <Container wide>
        <ScrollReveal>
          <SectionHeading
            eyebrow="The lookbook"
            title="Editor's picks"
            description="The six pieces the team keeps reaching for."
          />
        </ScrollReveal>

        <div className="mt-16 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:grid-rows-2">
          {picks.map((product, i) => (
            <ScrollReveal
              key={product.id}
              delay={i * 70}
              // First and fourth tiles span two rows on desktop, which turns a
              // uniform grid into something that looks composed.
              className={i === 0 || i === 3 ? "lg:row-span-2" : ""}
            >
              <Link
                href={`/product/${product.slug}`}
                /*
                 * No `h-full` below the lg breakpoint, deliberately. On a
                 * two-column mobile grid the row height is set by the tallest
                 * tile, so `h-full` combined with `aspect-square` resolves the
                 * width FROM that height and blows the tile past the viewport.
                 * Height only stretches where the row-span actually applies.
                 */
                className={`group relative block overflow-hidden bg-ivory-deep ${
                  i === 0 || i === 3
                    ? "aspect-[3/4] lg:aspect-auto lg:h-full"
                    : "aspect-square"
                }`}
              >
                <div className="absolute inset-0 transition-transform duration-[1.2s] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105">
                  <ProductImage
                    id={product.id}
                    name={product.name}
                    category={product.category}
                        subcategory={product.subcategory}
                    image={product.image}
                    sizes="(max-width: 1024px) 50vw, 25vw"
                  />
                </div>
                <div className="absolute inset-0 bg-ink/0 transition-colors duration-500 group-hover:bg-ink/25" />
                <div className="absolute inset-x-0 bottom-0 translate-y-2 p-5 opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
                  <p className="font-display text-xl text-ivory">{product.name}</p>
                  <p className="mt-1 text-sm text-ivory/80 tabular">
                    {displayPrice(product.priceMinor)}
                  </p>
                </div>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
