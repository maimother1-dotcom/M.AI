import { Container, SectionHeading } from "@/components/ui";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

/**
 * The argument the whole business rests on, made visually.
 *
 * Two bars showing where the money goes on the same ₹100 of product. Nothing
 * here names a competitor or claims to replicate anyone's design — it is an
 * argument about distribution cost, which is the honest version of the claim.
 */

const BOUTIQUE = [
  { label: "Materials & making", pct: 12, tone: "bg-madder" },
  { label: "House margin", pct: 38, tone: "bg-ink/70" },
  { label: "Boutique rent & staff", pct: 22, tone: "bg-ink/45" },
  { label: "Marketing & campaigns", pct: 18, tone: "bg-ink/28" },
  { label: "Wholesale layer", pct: 10, tone: "bg-ink/15" },
];

const OURS = [
  { label: "Materials & making", pct: 46, tone: "bg-madder" },
  { label: "Our margin", pct: 24, tone: "bg-gold" },
  { label: "Shipping & service", pct: 18, tone: "bg-ink/28" },
  { label: "Marketing", pct: 12, tone: "bg-ink/15" },
];

export function PriceAnatomy() {
  return (
    <section id="pricing" className="border-y border-line bg-ivory-deep py-24 lg:py-32">
      <Container>
        <ScrollReveal>
          <SectionHeading
            eyebrow="The arithmetic"
            title="Why the same quality costs a fraction"
            description="We are not cheaper because the work is worse. We are cheaper because there are four fewer people between the atelier and your door. Here is the same hundred rupees of finished product, split two ways."
          />
        </ScrollReveal>

        <div className="mx-auto mt-16 grid max-w-5xl gap-12 lg:grid-cols-2 lg:gap-16">
          <ScrollReveal delay={100}>
            <BreakdownColumn
              title="A boutique piece"
              caption="₹100 at the till"
              rows={BOUTIQUE}
              highlight="12%"
              highlightLabel="reaches the people who made it"
            />
          </ScrollReveal>

          <ScrollReveal delay={220}>
            <BreakdownColumn
              title="The same piece, here"
              caption="₹100 at the till"
              rows={OURS}
              highlight="46%"
              highlightLabel="reaches the people who made it"
              accent
            />
          </ScrollReveal>
        </div>

        <ScrollReveal delay={340}>
          <div className="mx-auto mt-16 grid max-w-5xl gap-8 border-t border-line pt-12 sm:grid-cols-3">
            {[
              {
                title: "The same ateliers",
                body: "Our leather workshop in Chennai and our silk mill in Bangalore both hold export contracts with European houses. We are not claiming to copy anyone. We are buying from the same benches.",
              },
              {
                title: "No boutique, no wholesale",
                body: "A flagship on a luxury high street costs more per year than most brands earn. We sell direct, so that line does not exist on our balance sheet or on your receipt.",
              },
              {
                title: "One margin, not four",
                body: "A piece that passes through a manufacturer, a brand, a distributor and a retailer is marked up four times. Ours is marked up once, and we will tell you by how much.",
              },
            ].map((item) => (
              <div key={item.title}>
                <h3 className="font-display text-xl">{item.title}</h3>
                <p className="mt-3 text-pretty text-sm leading-relaxed text-ink-soft">{item.body}</p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </Container>
    </section>
  );
}

function BreakdownColumn({
  title,
  caption,
  rows,
  highlight,
  highlightLabel,
  accent = false,
}: {
  title: string;
  caption: string;
  rows: { label: string; pct: number; tone: string }[];
  highlight: string;
  highlightLabel: string;
  accent?: boolean;
}) {
  return (
    <div className={`h-full border p-7 sm:p-9 ${accent ? "border-gold bg-ivory" : "border-line"}`}>
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-display text-2xl">{title}</h3>
        <span className="eyebrow shrink-0">{caption}</span>
      </div>

      {/* The bar */}
      <div className="mt-7 flex h-3 w-full overflow-hidden" role="img" aria-label={`Cost breakdown for ${title}`}>
        {rows.map((row) => (
          <div key={row.label} className={row.tone} style={{ width: `${row.pct}%` }} />
        ))}
      </div>

      <ul className="mt-7 space-y-3">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-3 text-sm">
            <span className={`h-2.5 w-2.5 shrink-0 ${row.tone}`} />
            <span className="flex-1 text-ink-soft">{row.label}</span>
            <span className="tabular text-ink">{row.pct}%</span>
          </li>
        ))}
      </ul>

      <div className={`mt-8 border-t pt-6 ${accent ? "border-gold/40" : "border-line"}`}>
        <p className={`font-display text-4xl tabular ${accent ? "text-madder" : "text-ink"}`}>
          {highlight}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">{highlightLabel}</p>
      </div>
    </div>
  );
}
