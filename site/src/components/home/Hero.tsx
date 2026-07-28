import Link from "next/link";
import { Motif } from "@/components/brand/Motif";
import { ButtonLink } from "@/components/ui";

/**
 * The hero.
 *
 * Built entirely from SVG and CSS — no image request, so the largest
 * contentful paint is the headline text and it arrives with the HTML.
 */
export function Hero() {
  return (
    <section className="relative -mt-[var(--nav-height)] flex min-h-[92vh] items-center overflow-hidden pt-[var(--nav-height)]">
      {/* Ground */}
      <div className="absolute inset-0 -z-30 bg-gradient-to-br from-[#F6F1E7] via-[#EFE7D8] to-[#E2D3BC]" />

      {/* Slow-drifting light. The only motion above the fold. */}
      <div className="animate-ken-burns absolute inset-0 -z-20 origin-center">
        <div className="absolute left-[-10%] top-[-20%] h-[70vh] w-[70vh] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.85),transparent_65%)]" />
        <div className="absolute bottom-[-25%] right-[-5%] h-[60vh] w-[60vh] rounded-full bg-[radial-gradient(circle,rgba(198,166,100,0.3),transparent_65%)]" />
      </div>

      {/* Block-print watermark */}
      <div
        className="absolute inset-0 -z-10 opacity-[0.07]"
        aria-hidden="true"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='90' viewBox='0 0 100 100'%3E%3Cg fill='none' stroke='%2316130F' stroke-width='1.4'%3E%3Cpath d='M50 50C50 36 44 30 50 18 56 30 50 36 50 50Z'/%3E%3Cpath d='M50 50C50 64 44 70 50 82 56 70 50 64 50 50Z'/%3E%3Cpath d='M50 50C36 50 30 44 18 50 30 56 36 50 50 50Z'/%3E%3Cpath d='M50 50C64 50 70 44 82 50 70 56 64 50 50 50Z'/%3E%3Ccircle cx='50' cy='50' r='5'/%3E%3C/g%3E%3C/svg%3E\")",
          backgroundSize: "90px 90px",
        }}
      />

      <div className="mx-auto grid w-full max-w-[1500px] gap-14 px-5 py-20 sm:px-8 lg:grid-cols-12 lg:gap-8 lg:px-12">
        <div className="lg:col-span-7 lg:pr-10">
          <div className="animate-fade-up" style={{ animationDelay: "60ms" }}>
            <span className="eyebrow">Est. in the tradition of 1686</span>
          </div>

          <h1
            className="animate-fade-up mt-7 text-balance text-[3.1rem] leading-[0.94] sm:text-[4.5rem] lg:text-[5.6rem]"
            style={{ animationDelay: "140ms" }}
          >
            Paris fell for
            <br />
            <span className="italic text-madder">India</span> first.
          </h1>

          <p
            className="animate-fade-up mt-8 max-w-xl text-pretty text-base leading-relaxed text-ink-soft sm:text-lg"
            style={{ animationDelay: "240ms" }}
          >
            In 1686 France banned Indian painted cotton because it was outselling
            French silk. Three centuries later the same workshops still supply the
            great houses. We buy from them directly, and charge you what the piece
            costs to make rather than what the label is worth.
          </p>

          <div
            className="animate-fade-up mt-11 flex flex-wrap items-center gap-4"
            style={{ animationDelay: "340ms" }}
          >
            <ButtonLink href="/shop" size="lg">
              Shop the collection
            </ButtonLink>
            <ButtonLink href="/about#pricing" variant="secondary" size="lg">
              Why it costs less
            </ButtonLink>
          </div>

          <dl
            className="animate-fade-up mt-14 flex flex-wrap gap-x-12 gap-y-6 border-t border-line pt-8"
            style={{ animationDelay: "440ms" }}
          >
            {[
              { value: "60–75%", label: "Below boutique pricing" },
              { value: "74", label: "Pieces, considered" },
              { value: "30 days", label: "Returns, no questions" },
            ].map((stat) => (
              <div key={stat.label}>
                <dt className="font-display text-3xl leading-none text-ink tabular">{stat.value}</dt>
                <dd className="eyebrow mt-2.5">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* The plate */}
        <div className="relative lg:col-span-5">
          <div
            className="animate-fade-up relative mx-auto aspect-[4/5] w-full max-w-md"
            style={{ animationDelay: "300ms" }}
          >
            <div className="absolute inset-0 border border-gold/40" />
            <div className="absolute inset-4 overflow-hidden bg-gradient-to-b from-[#EEE6D6] to-[#CDB894]">
              <div className="absolute inset-0 flex items-center justify-center">
                <Motif className="h-2/3 w-2/3 text-ink/25" />
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent p-7 pt-20">
                <p className="eyebrow text-ivory/80">The house scent</p>
                <p className="mt-2 font-display text-3xl text-ivory">L&apos;Indienne</p>
                <p className="mt-1 text-sm text-ivory/75">Eau de Parfum, 22%</p>
                <Link
                  href="/product/indienne-eau-de-parfum"
                  className="mt-5 inline-block border-b border-gold/60 pb-1 text-[11px] uppercase tracking-[0.18em] text-gold"
                >
                  Discover →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll cue. Pinned to the right gutter rather than centred — centred, it
          lands on top of the stats row at a 900px-tall viewport. */}
      <div className="pointer-events-none absolute bottom-10 right-12 hidden lg:block">
        <div className="flex flex-col items-center gap-3">
          <span className="eyebrow text-[9px]">Scroll</span>
          <span className="h-12 w-px bg-gradient-to-b from-ink/40 to-transparent" />
        </div>
      </div>
    </section>
  );
}
