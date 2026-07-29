"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
/*
 * `@stripe/stripe-js/pure`, not `@stripe/stripe-js`.
 *
 * The default entry point injects Stripe.js as soon as the module is imported,
 * before anyone has decided whether a payment is happening. That means a demo
 * deployment with no keys still reaches out to js.stripe.com on every visit to
 * this page — a third-party request, and a third-party cookie, for a script it
 * will never use. The /pure build only loads when loadStripe() is actually
 * called, which here is only when a publishable key exists.
 */
import { loadStripe } from "@stripe/stripe-js/pure";
// The /pure entry point re-exports the runtime only; types live in the root.
import type { Stripe } from "@stripe/stripe-js";
import { useCart } from "@/components/cart/CartProvider";
import { CheckoutSteps } from "@/components/checkout/CheckoutSteps";
import { HANDOFF_KEY } from "@/components/checkout/CheckoutForm";
import { OrderSummary } from "@/components/checkout/OrderSummary";
import { RazorpayForm } from "@/components/checkout/RazorpayForm";
import { Motif } from "@/components/brand/Motif";
import { Button, ButtonLink } from "@/components/ui";
import { displayPrice } from "@/lib/currency";
import type { OrderTotals, ShippingMethod } from "@/lib/types";

interface Handoff {
  mode: "demo" | "stripe" | "razorpay";
  clientSecret: string | null;
  razorpayOrderId?: string;
  razorpayKeyId?: string;
  prefill?: { name: string; email: string; contact: string };
  orderToken: string;
  orderNumber: string;
  totals: OrderTotals;
  email: string;
  name: string;
  shippingMethod: ShippingMethod;
}

export function PaymentClient({ publishableKey }: { publishableKey: string | null }) {
  const { entries, hydrated } = useCart();
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [missing, setMissing] = useState(false);

  // Same reasoning as CartProvider: sessionStorage does not exist during server
  // rendering, so this cannot be read before mount. Runs once.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) {
      setMissing(true);
      return;
    }
    try {
      setHandoff(JSON.parse(raw) as Handoff);
    } catch {
      setMissing(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Load Stripe.js once, and only if there is actually a key.
  const stripePromise = useMemo<Promise<Stripe | null> | null>(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey],
  );

  if (missing) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <Motif className="h-16 w-16 text-gold/50" />
        <h1 className="mt-8 text-3xl">This payment session has expired</h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-muted">
          Payment sessions do not survive a closed tab, by design. Nothing was charged. Start
          again from your bag and it will take under a minute.
        </p>
        <ButtonLink href="/checkout" className="mt-8">
          Back to checkout
        </ButtonLink>
      </div>
    );
  }

  if (!handoff || !hydrated) {
    return (
      <div className="grid gap-12 lg:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-16 w-full" />
          ))}
        </div>
        <div className="skeleton h-80 w-full" />
      </div>
    );
  }

  const isRazorpay =
    handoff.mode === "razorpay" && handoff.razorpayOrderId && handoff.razorpayKeyId;
  const isStripe = handoff.mode === "stripe" && handoff.clientSecret && stripePromise;

  return (
    <>
      <CheckoutSteps current={3} />

      <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_400px] lg:gap-16">
        <div>
          {/* Order line */}
          <div className="mb-9 flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-5">
            <div>
              <p className="eyebrow">Order</p>
              <p className="mt-1.5 font-display text-2xl tabular">{handoff.orderNumber}</p>
            </div>
            <div className="text-right">
              <p className="eyebrow">Amount due</p>
              <p className="mt-1.5 font-display text-2xl tabular">
                {displayPrice(handoff.totals.totalMinor)}
              </p>
            </div>
          </div>

          {isRazorpay ? (
            <RazorpayForm
              handoff={{
                razorpayOrderId: handoff.razorpayOrderId!,
                razorpayKeyId: handoff.razorpayKeyId!,
                orderToken: handoff.orderToken,
                orderNumber: handoff.orderNumber,
                totals: handoff.totals,
                email: handoff.email,
                name: handoff.name,
                prefill: handoff.prefill,
              }}
            />
          ) : isStripe ? (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: handoff.clientSecret!,
                appearance: {
                  theme: "flat",
                  variables: {
                    colorPrimary: "#9C3A2C",
                    colorBackground: "#F8F5EF",
                    colorText: "#16130F",
                    colorDanger: "#9C3A2C",
                    fontFamily: "var(--font-jost), sans-serif",
                    borderRadius: "0px",
                    spacingUnit: "5px",
                  },
                },
              }}
            >
              <StripePaymentForm handoff={handoff} />
            </Elements>
          ) : (
            <DemoPaymentForm handoff={handoff} />
          )}
        </div>

        <aside className="lg:sticky lg:top-[calc(var(--nav-height)+2rem)] lg:self-start">
          <OrderSummary
            entries={entries}
            totals={handoff.totals}
            loading={false}
            shippingMethod={handoff.shippingMethod}
          />

          <div className="mt-5 space-y-3 border border-line p-6 text-[11px] leading-relaxed text-ink-muted">
            <p className="flex items-start gap-2.5">
              <LockIcon />
              <span>
                {isRazorpay
                  ? "Card and UPI details are entered inside Razorpay's own window and go directly to them. They never touch our servers, which keeps your payment details out of our reach entirely."
                  : isStripe
                    ? "Card details are entered inside a frame served by Stripe and go directly to them. They never touch our servers, which keeps your card out of our reach entirely."
                    : "This deployment has no payment keys configured, so no card is charged and none is stored."}
              </span>
            </p>
            <p className="flex items-start gap-2.5">
              <LockIcon />
              <span>
                The amount above was computed on our server from our catalog. It cannot be
                altered from this page.
              </span>
            </p>
          </div>

          <Link
            href="/checkout"
            className="mt-6 inline-block text-[11px] uppercase tracking-[0.16em] text-ink-soft hover:text-ink"
          >
            ← Edit details
          </Link>
        </aside>
      </div>
    </>
  );
}

/* =========================================================================
   Stripe path
   ========================================================================= */

function StripePaymentForm({ handoff }: { handoff: Handoff }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/success`,
        receipt_email: handoff.email,
      },
    });

    // Reaching here at all means the redirect did not happen, which means
    // something failed. On success the browser has already left this page.
    if (stripeError) {
      setError(
        stripeError.type === "card_error" || stripeError.type === "validation_error"
          ? (stripeError.message ?? "Your card was declined.")
          : "Something went wrong processing your payment. No charge was made.",
      );
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-7">
      <h2 className="font-display text-2xl">Payment</h2>
      <PaymentElement options={{ layout: "tabs" }} />

      {error && (
        <p role="alert" className="border border-madder/40 bg-madder/5 p-4 text-sm text-madder">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={!stripe || submitting}>
        {submitting ? "Processing…" : `Pay ${displayPrice(handoff.totals.totalMinor)}`}
      </Button>

      <p className="text-center text-[11px] text-ink-muted">
        By paying you accept our{" "}
        <Link href="/legal/terms" className="link-underline">
          terms
        </Link>{" "}
        and{" "}
        <Link href="/legal/privacy" className="link-underline">
          privacy policy
        </Link>
        .
      </p>
    </form>
  );
}

/* =========================================================================
   Demo path — identical layout, no money movement
   ========================================================================= */

/** Luhn check. Catches transposed digits, which is most real mistyping. */
function luhnValid(digits: string): boolean {
  if (!/^\d{12,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function DemoPaymentForm({ handoff }: { handoff: Handoff }) {
  const router = useRouter();
  const { clear } = useCart();

  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [holder, setHolder] = useState(handoff.name);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const next: Record<string, string> = {};
    const digits = number.replace(/\s/g, "");

    if (!luhnValid(digits)) next.number = "Enter a valid card number.";

    const match = /^(\d{2})\s*\/\s*(\d{2})$/.exec(expiry.trim());
    if (!match) {
      next.expiry = "Use MM / YY.";
    } else {
      const month = Number(match[1]);
      const year = 2000 + Number(match[2]);
      if (month < 1 || month > 12) {
        next.expiry = "Month must be 01–12.";
      } else {
        // Expiry is end-of-month, so compare against the first of the next month.
        const expiresAfter = new Date(year, month, 1);
        if (expiresAfter <= new Date()) next.expiry = "That card has expired.";
      }
    }

    if (!/^\d{3,4}$/.test(cvc)) next.cvc = "3 or 4 digits.";
    if (holder.trim().length < 2) next.holder = "Enter the name on the card.";

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    // A beat, so the state change is legible rather than instantaneous.
    await new Promise((r) => setTimeout(r, 900));

    // The order token is what the confirmation page verifies. Nothing entered
    // on this form is sent anywhere — in demo mode there is nowhere to send it.
    sessionStorage.setItem("lindienne.order.v1", handoff.orderToken);
    sessionStorage.removeItem(HANDOFF_KEY);
    clear();
    router.push("/checkout/success");
  }

  function formatNumber(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 19);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl">Payment</h2>
        <span className="border border-gold bg-gold/15 px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-ink">
          Demo mode · no charge
        </span>
      </div>

      <div className="border border-gold/40 bg-gold/5 p-5 text-[11px] leading-relaxed text-ink-soft">
        <p className="mb-2 text-ink">No payment keys are configured on this deployment.</p>
        <p>
          The form below validates properly but moves no money. Add{" "}
          <code className="bg-ivory-deep px-1">STRIPE_SECRET_KEY</code> and{" "}
          <code className="bg-ivory-deep px-1">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> and
          this same page becomes Stripe&rsquo;s Payment Element with no code change. Try{" "}
          <button
            type="button"
            onClick={() => {
              setNumber("4242 4242 4242 4242");
              setExpiry("12 / 34");
              setCvc("123");
            }}
            className="underline"
          >
            4242 4242 4242 4242
          </button>
          .
        </p>
      </div>

      <DemoField
        id="card-number"
        label="Card number"
        value={number}
        onChange={(v) => setNumber(formatNumber(v))}
        placeholder="0000 0000 0000 0000"
        inputMode="numeric"
        autoComplete="cc-number"
        error={errors.number}
      />

      <div className="grid grid-cols-2 gap-5">
        <DemoField
          id="card-expiry"
          label="Expiry"
          value={expiry}
          onChange={setExpiry}
          placeholder="MM / YY"
          inputMode="numeric"
          autoComplete="cc-exp"
          error={errors.expiry}
        />
        <DemoField
          id="card-cvc"
          label="CVC"
          value={cvc}
          onChange={(v) => setCvc(v.replace(/\D/g, "").slice(0, 4))}
          placeholder="123"
          inputMode="numeric"
          autoComplete="cc-csc"
          error={errors.cvc}
        />
      </div>

      <DemoField
        id="card-holder"
        label="Name on card"
        value={holder}
        onChange={setHolder}
        autoComplete="cc-name"
        error={errors.holder}
      />

      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? "Processing…" : `Pay ${displayPrice(handoff.totals.totalMinor)}`}
      </Button>

      <p className="text-center text-[11px] text-ink-muted">
        By paying you accept our{" "}
        <Link href="/legal/terms" className="link-underline">
          terms
        </Link>{" "}
        and{" "}
        <Link href="/legal/privacy" className="link-underline">
          privacy policy
        </Link>
        .
      </p>
    </form>
  );
}

function DemoField({
  id,
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  autoComplete,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "numeric" | "text";
  autoComplete?: string;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="eyebrow mb-2 block">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`w-full border bg-ivory px-4 py-3.5 text-sm tabular outline-none transition-colors placeholder:text-ink-muted/60 ${
          error ? "border-madder" : "border-line focus:border-ink"
        }`}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-[11px] text-madder">
          {error}
        </p>
      )}
    </div>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
