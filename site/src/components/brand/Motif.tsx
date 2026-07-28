/**
 * The house motif — a drawn indienne block-print form.
 *
 * One distinctive mark reused everywhere (dividers, watermarks, empty states,
 * the 404, the loading skeleton) is what makes a site look art-directed rather
 * than assembled. This is that mark.
 */

interface MotifProps {
  className?: string;
  /** Stroke/fill colour. Defaults to currentColor so it inherits. */
  color?: string;
  variant?: "bloom" | "vine" | "star" | "border";
}

export function Motif({ className, color = "currentColor", variant = "bloom" }: MotifProps) {
  if (variant === "vine") {
    return (
      <svg viewBox="0 0 120 40" fill="none" className={className} aria-hidden="true">
        <path
          d="M0 20c10 0 10-12 20-12s10 24 20 24 10-24 20-24 10 24 20 24 10-12 20-12"
          stroke={color}
          strokeWidth="0.9"
          strokeLinecap="round"
        />
        {[20, 60, 100].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy={8} r="2.4" fill={color} opacity="0.55" />
            <path d={`M${cx} 5.6 v-4`} stroke={color} strokeWidth="0.7" strokeLinecap="round" />
          </g>
        ))}
        {[40, 80].map((cx) => (
          <circle key={cx} cx={cx} cy={32} r="2.4" fill={color} opacity="0.35" />
        ))}
      </svg>
    );
  }

  if (variant === "star") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path
          d="M12 0c.6 6.6 4.8 10.8 12 12-7.2 1.2-11.4 5.4-12 12-.6-6.6-4.8-10.8-12-12C7.2 10.8 11.4 6.6 12 0Z"
          fill={color}
        />
      </svg>
    );
  }

  if (variant === "border") {
    return (
      <svg viewBox="0 0 200 16" fill="none" className={className} aria-hidden="true">
        {Array.from({ length: 10 }).map((_, i) => (
          <g key={i} transform={`translate(${i * 20} 0)`}>
            <path d="M10 2 L14 8 L10 14 L6 8 Z" fill={color} opacity="0.5" />
            <circle cx="0" cy="8" r="1.1" fill={color} opacity="0.3" />
          </g>
        ))}
      </svg>
    );
  }

  // bloom — the primary mark: an eight-fold botanical rosette, the form that
  // recurs across eighteenth-century indienne palampores.
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true">
      <g stroke={color} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
        {/* Four cardinal petals, full length. */}
        {[0, 90, 180, 270].map((angle) => (
          <g key={angle} transform={`rotate(${angle} 50 50)`}>
            <path d="M50 44 C50 32 43 25 50 11 C57 25 50 32 50 44Z" />
            <path d="M50 41 C50 34 47.5 30 50 23 C52.5 30 50 34 50 41Z" opacity="0.5" />
          </g>
        ))}

        {/* Four shorter diagonal petals, filling the quadrants. A rosette needs
            the intermediate ring or it reads as a cross. */}
        {[45, 135, 225, 315].map((angle) => (
          <path
            key={angle}
            transform={`rotate(${angle} 50 50)`}
            d="M50 44 C50 36 45 31 50 21 C55 31 50 36 50 44Z"
            opacity="0.45"
          />
        ))}

        <circle cx="50" cy="50" r="7" />
        <circle cx="50" cy="50" r="2.4" fill={color} stroke="none" />
      </g>
    </svg>
  );
}

/** A centred horizontal rule with the mark set into it. Used between sections. */
export function MotifDivider({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-4 ${className}`} aria-hidden="true">
      <span className="rule-gold flex-1" />
      <Motif className="h-5 w-5 shrink-0 text-gold" />
      <span className="rule-gold flex-1" />
    </div>
  );
}

/** The wordmark. Letterspaced caps with a hairline rule beneath. */
export function Wordmark({
  className = "",
  showTagline = false,
}: {
  className?: string;
  showTagline?: boolean;
}) {
  return (
    <span className={`inline-flex flex-col items-center leading-none ${className}`}>
      <span className="font-display text-[1.35em] font-light tracking-[0.3em] whitespace-nowrap">
        L&apos;INDIENNE
      </span>
      {showTagline && (
        <span className="eyebrow mt-2 text-[0.34em] tracking-[0.42em]">
          Paris fell for India first
        </span>
      )}
    </span>
  );
}
