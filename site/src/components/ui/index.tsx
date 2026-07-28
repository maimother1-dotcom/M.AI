import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { displayPrice, savingPercent } from "@/lib/currency";
import type { Badge as BadgeType } from "@/lib/types";

/* -------------------------------------------------------------------------
   Button
   ------------------------------------------------------------------------- */

type Variant = "primary" | "secondary" | "ghost" | "light";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-ink text-ivory hover:bg-madder border border-ink hover:border-madder",
  secondary:
    "bg-transparent text-ink border border-ink/25 hover:border-ink hover:bg-ink hover:text-ivory",
  ghost: "bg-transparent text-ink border border-transparent hover:border-ink/25",
  light:
    "bg-ivory text-ink border border-ivory hover:bg-transparent hover:text-ivory",
};

const SIZES: Record<Size, string> = {
  sm: "px-5 py-2.5 text-[11px] tracking-[0.16em]",
  md: "px-8 py-3.5 text-[11px] tracking-[0.18em]",
  lg: "px-10 py-4.5 text-xs tracking-[0.2em]",
};

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 uppercase font-normal transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] disabled:opacity-40 disabled:pointer-events-none cursor-pointer";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return (
    <button className={`${BUTTON_BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return (
    <Link className={`${BUTTON_BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`} {...props}>
      {children}
    </Link>
  );
}

/* -------------------------------------------------------------------------
   Price
   ------------------------------------------------------------------------- */

export function Price({
  priceMinor,
  compareAtMinor,
  size = "md",
  align = "left",
}: {
  priceMinor: number;
  compareAtMinor?: number;
  size?: "sm" | "md" | "lg";
  align?: "left" | "center";
}) {
  const saving = compareAtMinor ? savingPercent(priceMinor, compareAtMinor) : 0;
  const scale = {
    sm: { price: "text-sm", was: "text-xs", pct: "text-[10px]" },
    md: { price: "text-base", was: "text-sm", pct: "text-[10px]" },
    lg: { price: "text-2xl", was: "text-base", pct: "text-[11px]" },
  }[size];

  return (
    <div
      className={`flex flex-wrap items-baseline gap-x-2.5 gap-y-1 tabular ${
        align === "center" ? "justify-center" : ""
      }`}
    >
      <span className={`${scale.price} text-ink`}>{displayPrice(priceMinor)}</span>
      {compareAtMinor && saving > 0 && (
        <>
          <span className={`${scale.was} text-ink-muted line-through decoration-ink-muted/50`}>
            {displayPrice(compareAtMinor)}
          </span>
          <span className={`${scale.pct} uppercase tracking-[0.12em] text-madder`}>
            −{saving}%
          </span>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Badges
   ------------------------------------------------------------------------- */

const BADGE_LABEL: Record<BadgeType, string> = {
  new: "New",
  bestseller: "Bestseller",
  "last-few": "Last few",
  "editors-pick": "Editor's pick",
};

const BADGE_STYLE: Record<BadgeType, string> = {
  new: "bg-ink text-ivory",
  bestseller: "bg-gold/90 text-ink",
  "last-few": "bg-madder text-ivory",
  "editors-pick": "bg-indigo text-ivory",
};

export function ProductBadge({ badge }: { badge: BadgeType }) {
  return (
    <span
      className={`px-2.5 py-1 text-[9px] uppercase tracking-[0.16em] leading-none ${BADGE_STYLE[badge]}`}
    >
      {BADGE_LABEL[badge]}
    </span>
  );
}

/* -------------------------------------------------------------------------
   Rating
   ------------------------------------------------------------------------- */

export function Stars({ rating, className = "" }: { rating: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      aria-label={`Rated ${rating} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, rating - i + 1));
        return (
          <svg key={i} viewBox="0 0 20 20" className="h-3 w-3" aria-hidden="true">
            <defs>
              <linearGradient id={`star-${i}-${Math.round(fill * 100)}`}>
                <stop offset={`${fill * 100}%`} stopColor="var(--color-gold)" />
                <stop offset={`${fill * 100}%`} stopColor="transparent" />
              </linearGradient>
            </defs>
            <path
              d="M10 1.5l2.4 5.3 5.6.6-4.2 3.9 1.2 5.7L10 14.1 5 17l1.2-5.7L2 7.4l5.6-.6z"
              fill={`url(#star-${i}-${Math.round(fill * 100)})`}
              stroke="var(--color-gold)"
              strokeWidth="0.9"
              opacity={fill > 0 ? 1 : 0.35}
            />
          </svg>
        );
      })}
    </span>
  );
}

/* -------------------------------------------------------------------------
   Section furniture
   ------------------------------------------------------------------------- */

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className = "",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={`${align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"} ${className}`}
    >
      {eyebrow && <p className="eyebrow mb-4">{eyebrow}</p>}
      <h2 className="text-balance text-3xl sm:text-4xl lg:text-[2.75rem]">{title}</h2>
      {description && (
        <p className="mt-5 text-pretty text-sm leading-relaxed text-ink-soft sm:text-[15px]">
          {description}
        </p>
      )}
    </div>
  );
}

export function Container({
  children,
  className = "",
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`mx-auto w-full px-5 sm:px-8 lg:px-12 ${wide ? "max-w-[1600px]" : "max-w-[1400px]"} ${className}`}
    >
      {children}
    </div>
  );
}
