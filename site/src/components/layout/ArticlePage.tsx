import { MotifDivider } from "@/components/brand/Motif";
import { Container } from "@/components/ui";

export interface Block {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  /** Rendered as a two-column definition table. */
  table?: { rows: [string, string][]; head?: [string, string] };
}

/**
 * Shared layout for help and legal pages.
 *
 * Six pages sharing one component means they cannot drift apart typographically,
 * which is the usual failure mode of policy pages on an otherwise designed site.
 */
export function ArticlePage({
  eyebrow,
  title,
  intro,
  updated,
  blocks,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  updated?: string;
  blocks: Block[];
}) {
  return (
    <>
      <header className="border-b border-line py-16 lg:py-24">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow mb-4">{eyebrow}</p>
            <h1 className="text-balance text-4xl sm:text-5xl lg:text-6xl">{title}</h1>
            <MotifDivider className="mx-auto my-8 max-w-[220px]" />
            <p className="text-pretty text-sm leading-relaxed text-ink-soft">{intro}</p>
            {updated && (
              <p className="mt-6 text-[11px] uppercase tracking-[0.16em] text-ink-muted">
                Last updated {updated}
              </p>
            )}
          </div>
        </Container>
      </header>

      <Container className="py-16 lg:py-24">
        <div className="mx-auto max-w-[68ch]">
          {blocks.map((block, i) => (
            <section key={block.heading} className={i > 0 ? "mt-14" : ""}>
              <h2 className="text-2xl sm:text-3xl">{block.heading}</h2>

              {block.paragraphs?.map((paragraph, j) => (
                <p key={j} className="mt-5 text-pretty text-[15px] leading-[1.85] text-ink-soft">
                  {paragraph}
                </p>
              ))}

              {block.bullets && (
                <ul className="mt-5 space-y-3">
                  {block.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-3.5 text-[15px] leading-relaxed text-ink-soft">
                      <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-gold" />
                      <span className="text-pretty">{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}

              {block.table && (
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full min-w-[380px] border-collapse text-sm">
                    {block.table.head && (
                      <thead>
                        <tr className="border-b border-ink/20">
                          <th className="eyebrow py-3 text-left">{block.table.head[0]}</th>
                          <th className="eyebrow py-3 text-right">{block.table.head[1]}</th>
                        </tr>
                      </thead>
                    )}
                    <tbody>
                      {block.table.rows.map(([label, value]) => (
                        <tr key={label} className="border-b border-line">
                          <td className="py-3.5 pr-4 text-ink-soft">{label}</td>
                          <td className="py-3.5 text-right tabular text-ink">{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      </Container>
    </>
  );
}
