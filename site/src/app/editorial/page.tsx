import type { Metadata } from "next";
import Link from "next/link";
import { editorial } from "@/data/editorial";
import { EditorialPlate } from "@/components/product/ProductImage";
import { MotifDivider } from "@/components/brand/Motif";
import { Container } from "@/components/ui";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

export const metadata: Metadata = {
  title: "Editorial",
  description:
    "The history behind the house, and plain-language guides to the specifications that decide whether a garment lasts.",
};

export default function EditorialPage() {
  const [lead, ...rest] = editorial;

  return (
    <>
      <header className="border-b border-line py-16 lg:py-24">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow mb-4">The journal</p>
            <h1 className="text-balance text-4xl sm:text-5xl lg:text-6xl">Editorial</h1>
            <MotifDivider className="mx-auto my-8 max-w-[220px]" />
            <p className="text-pretty text-sm leading-relaxed text-ink-soft">
              History, and the specifications nobody prints on a label. Written so that you
              could use it to shop somewhere else, which is rather the point.
            </p>
          </div>
        </Container>
      </header>

      <Container className="py-16 lg:py-24">
        {lead && (
          <ScrollReveal>
            <Link href={`/editorial/${lead.slug}`} className="group block">
              <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <div className="relative aspect-[16/10] overflow-hidden">
                  <div className="absolute inset-0 transition-transform duration-[1.2s] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105">
                    <EditorialPlate seed={`ed-${lead.slug}`} />
                  </div>
                  <div className="absolute inset-5 border border-ivory/30" />
                </div>
                <div>
                  <p className="eyebrow">
                    {lead.category} · {lead.readMinutes} min read
                  </p>
                  <h2 className="mt-5 text-balance text-3xl leading-tight transition-colors group-hover:text-madder sm:text-4xl lg:text-[2.75rem]">
                    {lead.title}
                  </h2>
                  <p className="mt-5 text-pretty text-base leading-relaxed text-ink-soft">
                    {lead.dek}
                  </p>
                  <span className="mt-7 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-madder">
                    Read
                    <span className="transition-transform duration-500 group-hover:translate-x-1.5">→</span>
                  </span>
                </div>
              </div>
            </Link>
          </ScrollReveal>
        )}

        <div className="mt-20 grid gap-10 border-t border-line pt-16 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((story, i) => (
            <ScrollReveal key={story.slug} delay={i * 100}>
              <Link href={`/editorial/${story.slug}`} className="group block">
                <div className="relative aspect-[4/3] overflow-hidden">
                  <div className="absolute inset-0 transition-transform duration-[1.2s] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105">
                    <EditorialPlate seed={`ed-${story.slug}`} />
                  </div>
                </div>
                <p className="eyebrow mt-5">
                  {story.category} · {story.readMinutes} min
                </p>
                <h3 className="mt-3 text-balance font-display text-2xl leading-tight transition-colors group-hover:text-madder">
                  {story.title}
                </h3>
                <p className="mt-3 text-pretty text-sm leading-relaxed text-ink-muted">
                  {story.dek}
                </p>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </>
  );
}
