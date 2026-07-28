import Link from "next/link";

const STEPS = [
  { n: 1, label: "Bag", href: "/cart" },
  { n: 2, label: "Details", href: "/checkout" },
  { n: 3, label: "Payment", href: null },
];

export function CheckoutSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav aria-label="Checkout progress">
      <ol className="flex items-center justify-center gap-3 sm:gap-6">
        {STEPS.map((step, i) => {
          const state = step.n < current ? "done" : step.n === current ? "current" : "upcoming";
          const content = (
            <span className="flex items-center gap-2.5">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] tabular transition-colors ${
                  state === "current"
                    ? "border-ink bg-ink text-ivory"
                    : state === "done"
                      ? "border-gold bg-gold/20 text-ink"
                      : "border-line text-ink-muted"
                }`}
              >
                {state === "done" ? "✓" : step.n}
              </span>
              <span
                className={`text-[11px] uppercase tracking-[0.16em] ${
                  state === "upcoming" ? "text-ink-muted" : "text-ink"
                }`}
              >
                {step.label}
              </span>
            </span>
          );

          return (
            <li key={step.n} className="flex items-center gap-3 sm:gap-6">
              {state === "done" && step.href ? (
                <Link href={step.href} className="transition-opacity hover:opacity-70">
                  {content}
                </Link>
              ) : (
                <span aria-current={state === "current" ? "step" : undefined}>{content}</span>
              )}
              {i < STEPS.length - 1 && (
                <span className="h-px w-6 bg-line sm:w-12" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
