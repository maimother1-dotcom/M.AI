import type { Metadata } from "next";
import { PriceAnatomy } from "@/components/home/PriceAnatomy";
import { EditorialPlate } from "@/components/product/ProductImage";
import { Motif, MotifDivider } from "@/components/brand/Motif";
import { ButtonLink, Container, SectionHeading } from "@/components/ui";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

export const metadata: Metadata = {
  title: "The House",
  description:
    "Named for the Indian painted cottons banned in France in 1686 for outselling French silk. The same workshops, without the markup.",
};

const MAKERS = [
  {
    place: "Varanasi, Uttar Pradesh",
    craft: "Handloom silk and zari",
    body: "Pit-loom weavers working in real zari — silver wire, gilded, wound onto a silk core. Two weeks of work goes into a single blouse. We buy at a price the weavers set, and we publish that we do.",
  },
  {
    place: "Chennai, Tamil Nadu",
    craft: "Vegetable-tanned leather",
    body: "Six weeks in pits of bark liquor rather than two days in chromium. The workshop holds export contracts with European houses, which is how we know what the alternative costs at retail.",
  },
  {
    place: "Jaipur, Rajasthan",
    craft: "Meenakari enamel",
    body: "Coloured glass fired into engraved metal, one colour at a time, hottest first. Four firings across two days for a single clasp. There are fewer than a hundred people left doing it at this level.",
  },
  {
    place: "Bagru, Rajasthan",
    craft: "Hand block printing",
    body: "Carved teak blocks, vegetable dyes, registration by eye. Madder for red, indigo for blue, pomegranate rind for yellow. The technique Europe spent a century trying to reverse-engineer.",
  },
  {
    place: "Lucknow, Uttar Pradesh",
    craft: "Chikankari embroidery",
    body: "White-on-white shadow work, roughly forty hours per shirt. One of the few embroidery traditions where the reverse of the cloth is as considered as the face.",
  },
  {
    place: "Bengaluru, Karnataka",
    craft: "Mulberry silk",
    body: "Filament silk at 19 and 22 momme from the mill that supplies several houses you have heard of. The weight is the specification that decides whether a slip dress hangs or clings.",
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-line py-20 lg:py-32">
        <div className="absolute inset-0 -z-10 opacity-25">
          <EditorialPlate seed="about-hero" />
        </div>
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <p className="eyebrow mb-5">The house</p>
            <h1 className="text-balance text-4xl leading-[1.03] sm:text-5xl lg:text-[4.25rem]">
              Paris fell for <span className="italic text-madder">India</span> first
            </h1>
            <MotifDivider className="mx-auto my-9 max-w-[220px]" />
            <p className="text-pretty font-display text-xl italic leading-relaxed text-ink-soft sm:text-2xl">
              In 1686 France made it a crime to wear Indian cotton. Not because it was
              inferior. Because it was winning.
            </p>
          </div>
        </Container>
      </header>

      {/* Story */}
      <Container className="py-20 lg:py-28">
        <div className="mx-auto max-w-[68ch] space-y-6">
          <p className="text-pretty text-lg leading-[1.85] text-ink-soft first-letter:float-left first-letter:mr-3 first-letter:font-display first-letter:text-[4.5rem] first-letter:leading-[0.8] first-letter:text-madder">
            The French called them indiennes — the painted and printed cottons that came off
            ships from the Coromandel Coast and rearranged what Europe thought fabric could
            be. Light where silk was heavy. Washable where silk was not. And the colours held,
            which nobody in Europe could manage at the time.
          </p>
          <p className="text-pretty leading-[1.85] text-ink-soft">
            The technique was mordant dyeing, and India had been practising it for more than a
            thousand years. It let one dye bath produce several colours in precise patterns
            that survived washing, and European printers spent the better part of a century
            failing to work out how.
          </p>
          <p className="text-pretty leading-[1.85] text-ink-soft">
            By the 1680s the silk weavers of Lyon were losing badly enough to reach the Crown.
            In 1686 the import, manufacture and wearing of indiennes was banned outright.
            Smuggling routes opened through Geneva and Amsterdam within months. Women were
            stripped of forbidden dresses in the street. The ban lasted seventy-three years
            and failed at everything except making the cloth more desirable.
          </p>
          <p className="text-pretty leading-[1.85] text-ink-soft">
            We took the name because the underlying situation has not changed. The workshops
            are still here. They still supply the great houses. The only thing anyone added in
            between was the markup.
          </p>
        </div>
      </Container>

      <PriceAnatomy />

      {/* Makers */}
      <section id="craft" className="py-24 lg:py-32">
        <Container>
          <ScrollReveal>
            <SectionHeading
              eyebrow="Where it is made"
              title="Six workshops, named"
              description="Anonymous sourcing is how a supply chain hides. Ours is written down, place by place and craft by craft, so you can check it."
            />
          </ScrollReveal>

          <div className="mt-16 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
            {MAKERS.map((maker, i) => (
              <ScrollReveal key={maker.place} delay={(i % 3) * 90} className="bg-ivory p-8 lg:p-10">
                <Motif className="h-6 w-6 text-gold" />
                <p className="eyebrow mt-5">{maker.craft}</p>
                <h3 className="mt-3 font-display text-2xl leading-tight">{maker.place}</h3>
                <p className="mt-4 text-pretty text-sm leading-relaxed text-ink-soft">
                  {maker.body}
                </p>
              </ScrollReveal>
            ))}
          </div>
        </Container>
      </section>

      {/* What we will not do */}
      <section className="border-y border-line bg-indigo py-24 text-ivory lg:py-32">
        <Container>
          <div className="mx-auto max-w-3xl">
            <p className="eyebrow text-gold">Where we draw the line</p>
            <h2 className="mt-5 text-balance text-3xl text-ivory sm:text-4xl lg:text-[2.75rem]">
              Four things this house will not do
            </h2>

            <ol className="mt-12 space-y-9">
              {[
                {
                  title: "We do not copy anyone",
                  body: "Nothing here is designed against another brand's product, and we will never describe a piece as inspired by, in the style of, or a dupe for a named house. Our comparison prices are the typical retail for a construction and material, not a competitor's price tag.",
                },
                {
                  title: "We do not sell gold or diamonds",
                  body: "All jewellery is demi-fine: 18k vermeil over recycled sterling, freshwater pearl, cubic zirconia, enamel. We say cubic zirconia rather than reaching for a softer word, and we do not stock solid gold or diamonds at all.",
                },
                {
                  title: "We do not invent scarcity",
                  body: "When something is down to nine units it is because we made ninety, not because a countdown timer sells better. There are no fake stock counters and no manufactured sales on this site.",
                },
                {
                  title: "We do not hide the specification",
                  body: "Micron counts, momme weights, plating thickness, fibre length, ply, construction method. If a number decides whether the thing lasts, it is on the product page before you buy rather than in a review afterwards.",
                },
              ].map((item, i) => (
                <li key={item.title} className="flex gap-6">
                  <span className="font-display text-4xl leading-none text-gold/60 tabular">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-display text-2xl text-ivory">{item.title}</h3>
                    <p className="mt-3 text-pretty text-sm leading-relaxed text-ivory/70">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Container>
      </section>

      <section className="py-24 text-center lg:py-32">
        <Container>
          <Motif className="mx-auto h-12 w-12 text-gold" />
          <h2 className="mt-8 text-balance text-3xl sm:text-4xl">
            Luxury, at what it actually costs to make
          </h2>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/shop" size="lg">
              Shop the collection
            </ButtonLink>
            <ButtonLink href="/editorial" variant="secondary" size="lg">
              Read the journal
            </ButtonLink>
          </div>
        </Container>
      </section>
    </>
  );
}
