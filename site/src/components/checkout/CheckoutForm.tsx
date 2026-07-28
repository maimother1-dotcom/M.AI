"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { OrderSummary } from "@/components/checkout/OrderSummary";
import { CheckoutSteps } from "@/components/checkout/CheckoutSteps";
import { Motif } from "@/components/brand/Motif";
import { Button, ButtonLink } from "@/components/ui";
import { displayPrice } from "@/lib/currency";
import type { OrderTotals, ShippingMethod } from "@/lib/types";

/** Where the handoff to the payment page lives. Session-scoped, cleared on success. */
export const HANDOFF_KEY = "lindienne.checkout.v1";

interface Fields {
  email: string;
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

const EMPTY: Fields = {
  email: "",
  name: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
};

export function CheckoutForm() {
  const router = useRouter();
  const { lines, entries, hydrated } = useCart();

  const [fields, setFields] = useState<Fields>(EMPTY);
  const [website, setWebsite] = useState(""); // honeypot
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>("standard");
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoMessage, setPromoMessage] = useState<string | null>(null);

  const [totals, setTotals] = useState<OrderTotals | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Fields, string>>>({});

  /**
   * Ask the server what this costs.
   *
   * The totals shown on this page are never computed in the browser. Every time
   * the cart, shipping method or promo code changes we re-quote, so what is on
   * screen is the same number the payment step will charge.
   */
  const requestQuote = useCallback(
    async (promoCode: string | null) => {
      if (lines.length === 0) return;
      setQuoting(true);
      try {
        const response = await fetch("/api/checkout/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines, shippingMethod, promoCode }),
        });
        const data = await response.json();

        if (!response.ok) {
          setError(data.message ?? "We could not price your bag. Please refresh.");
          return;
        }

        setError(null);
        setTotals(data.totals);
        setAppliedPromo(data.appliedPromo);

        if (promoCode) {
          setPromoMessage(
            data.appliedPromo
              ? `${data.appliedPromo} applied.`
              : "That code is not valid for this order.",
          );
        }
      } catch {
        setError("Network error. Check your connection and try again.");
      } finally {
        setQuoting(false);
      }
    },
    [lines, shippingMethod],
  );

  /*
   * Fetch the opening quote once the cart has hydrated, and again whenever the
   * cart lines or shipping method change.
   *
   * Two rules are disabled here, both deliberately:
   *   - `exhaustive-deps`: appliedPromo is read but not depended on. The
   *     response sets it, so depending on it would loop forever.
   *   - `set-state-in-effect`: requestQuote flips a loading flag before it
   *     awaits. This is a network call triggered by a real dependency change,
   *     which is precisely what effects are for — there is no render-time
   *     derivation available for "what does the server say this costs".
   */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hydrated) void requestQuote(appliedPromo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, requestQuote]);

  function update(key: keyof Fields, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: undefined }));
  }

  /** Client-side validation is for speed of feedback. The server validates again. */
  function validate(): boolean {
    const errors: Partial<Record<keyof Fields, string>> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fields.email)) errors.email = "Enter a valid email.";
    if (fields.name.trim().length < 2) errors.name = "Enter your full name.";
    if (!/^[+0-9\s()-]{6,20}$/.test(fields.phone)) errors.phone = "Enter a valid phone number.";
    if (fields.line1.trim().length < 3) errors.line1 = "Enter your street address.";
    if (fields.city.trim().length < 2) errors.city = "Enter your city.";
    if (fields.state.trim().length < 2) errors.state = "Enter your state.";
    if (!/^[A-Za-z0-9\s-]{3,12}$/.test(fields.postalCode)) errors.postalCode = "Enter a valid PIN code.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) {
      document.querySelector<HTMLElement>("[data-field-error]")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines,
          shippingMethod,
          promoCode: appliedPromo,
          email: fields.email.trim(),
          name: fields.name.trim(),
          phone: fields.phone.trim(),
          shippingAddress: {
            line1: fields.line1.trim(),
            line2: fields.line2.trim(),
            city: fields.city.trim(),
            state: fields.state.trim(),
            postalCode: fields.postalCode.trim(),
            country: fields.country.trim(),
          },
          website,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message ?? "We could not start checkout. Please try again.");
        setSubmitting(false);
        return;
      }

      // Hand off to the payment step. sessionStorage rather than a query string:
      // an order token in a URL ends up in browser history and server logs.
      sessionStorage.setItem(
        HANDOFF_KEY,
        JSON.stringify({
          mode: data.mode,
          clientSecret: data.clientSecret ?? null,
          orderToken: data.orderToken,
          orderNumber: data.orderNumber,
          totals: data.totals,
          email: fields.email.trim(),
          name: fields.name.trim(),
          shippingMethod,
        }),
      );

      router.push("/checkout/payment");
    } catch {
      setError("Network error. No charge was made. Please try again.");
      setSubmitting(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="grid gap-12 lg:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-14 w-full" />
          ))}
        </div>
        <div className="skeleton h-80 w-full" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <Motif className="h-16 w-16 text-gold/50" />
        <h1 className="mt-8 text-3xl">There is nothing to check out</h1>
        <p className="mt-3 text-sm text-ink-muted">Your bag is empty.</p>
        <ButtonLink href="/shop" className="mt-8">
          Shop everything
        </ButtonLink>
      </div>
    );
  }

  return (
    <>
      <CheckoutSteps current={2} />

      <form onSubmit={onSubmit} noValidate className="mt-12 grid gap-12 lg:grid-cols-[1fr_400px] lg:gap-16">
        <div className="space-y-12">
          {/* Contact */}
          <fieldset>
            <legend className="mb-6 flex w-full items-baseline justify-between">
              <span className="font-display text-2xl">Contact</span>
              <span className="text-[11px] text-ink-muted">For your receipt and tracking</span>
            </legend>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="email"
                label="Email"
                type="email"
                autoComplete="email"
                value={fields.email}
                onChange={(v) => update("email", v)}
                error={fieldErrors.email}
                className="sm:col-span-2"
              />
              <Field
                id="name"
                label="Full name"
                autoComplete="name"
                value={fields.name}
                onChange={(v) => update("name", v)}
                error={fieldErrors.name}
              />
              <Field
                id="phone"
                label="Phone"
                type="tel"
                autoComplete="tel"
                value={fields.phone}
                onChange={(v) => update("phone", v)}
                error={fieldErrors.phone}
              />
            </div>
          </fieldset>

          {/* Address */}
          <fieldset>
            <legend className="mb-6 font-display text-2xl">Shipping address</legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="line1"
                label="Address"
                autoComplete="address-line1"
                value={fields.line1}
                onChange={(v) => update("line1", v)}
                error={fieldErrors.line1}
                className="sm:col-span-2"
              />
              <Field
                id="line2"
                label="Apartment, suite (optional)"
                autoComplete="address-line2"
                value={fields.line2}
                onChange={(v) => update("line2", v)}
                className="sm:col-span-2"
              />
              <Field
                id="city"
                label="City"
                autoComplete="address-level2"
                value={fields.city}
                onChange={(v) => update("city", v)}
                error={fieldErrors.city}
              />
              <Field
                id="state"
                label="State"
                autoComplete="address-level1"
                value={fields.state}
                onChange={(v) => update("state", v)}
                error={fieldErrors.state}
              />
              <Field
                id="postalCode"
                label="PIN code"
                autoComplete="postal-code"
                inputMode="numeric"
                value={fields.postalCode}
                onChange={(v) => update("postalCode", v)}
                error={fieldErrors.postalCode}
              />
              <Field
                id="country"
                label="Country"
                autoComplete="country-name"
                value={fields.country}
                onChange={(v) => update("country", v)}
              />
            </div>

            {/* Honeypot */}
            <div className="absolute left-[-9999px]" aria-hidden="true">
              <label htmlFor="co-website">Leave empty</label>
              <input
                id="co-website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
          </fieldset>

          {/* Delivery */}
          <fieldset>
            <legend className="mb-6 font-display text-2xl">Delivery</legend>
            <div className="space-y-3">
              {(
                [
                  {
                    id: "standard" as const,
                    title: "Standard",
                    detail: "5 – 8 working days",
                    note: "Complimentary over ₹5,000",
                  },
                  {
                    id: "express" as const,
                    title: "Express",
                    detail: "2 – 3 working days",
                    note: "₹599",
                  },
                ]
              ).map((option) => (
                <label
                  key={option.id}
                  className={`flex cursor-pointer items-center gap-4 border p-5 transition-colors ${
                    shippingMethod === option.id ? "border-ink bg-ivory-deep" : "border-line hover:border-ink/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="shipping"
                    value={option.id}
                    checked={shippingMethod === option.id}
                    onChange={() => setShippingMethod(option.id)}
                    className="sr-only"
                  />
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                      shippingMethod === option.id ? "border-ink" : "border-line"
                    }`}
                  >
                    {shippingMethod === option.id && (
                      <span className="h-2 w-2 rounded-full bg-ink" />
                    )}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm">{option.title}</span>
                    <span className="block text-xs text-ink-muted">{option.detail}</span>
                  </span>
                  <span className="text-xs text-ink-soft">{option.note}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="border border-madder/40 bg-madder/5 p-4 text-sm text-madder">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" size="lg" disabled={submitting || quoting || !totals}>
              {submitting ? "Preparing payment…" : "Continue to payment"}
            </Button>
            <Link href="/cart" className="text-[11px] uppercase tracking-[0.16em] text-ink-soft hover:text-ink">
              ← Back to bag
            </Link>
          </div>
        </div>

        {/* Summary rail */}
        <aside className="lg:sticky lg:top-[calc(var(--nav-height)+2rem)] lg:self-start">
          <OrderSummary
            entries={entries}
            totals={totals}
            loading={quoting}
            shippingMethod={shippingMethod}
          />

          {/* Promo */}
          <div className="mt-5 border border-line p-6">
            <label htmlFor="promo" className="eyebrow">
              Promotion code
            </label>
            <div className="mt-3 flex gap-2">
              <input
                id="promo"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                placeholder="ENTER CODE"
                className="min-w-0 flex-1 border border-line bg-transparent px-3 py-2.5 text-xs uppercase tracking-[0.1em] outline-none transition-colors focus:border-ink"
              />
              <button
                type="button"
                onClick={() => void requestQuote(promoInput.trim() || null)}
                disabled={quoting || !promoInput.trim()}
                className="shrink-0 border border-ink px-5 py-2.5 text-[10px] uppercase tracking-[0.16em] transition-colors hover:bg-ink hover:text-ivory disabled:opacity-40"
              >
                Apply
              </button>
            </div>
            {promoMessage && (
              <p className={`mt-2.5 text-[11px] ${appliedPromo ? "text-madder" : "text-ink-muted"}`}>
                {promoMessage}
              </p>
            )}
            <p className="mt-3 text-[10px] leading-relaxed text-ink-muted">
              Codes are validated on our server. Try MAISON10 for ten percent off your first
              order.
            </p>
          </div>

          <p className="mt-5 flex items-start gap-2.5 text-[11px] leading-relaxed text-ink-muted">
            <LockIcon />
            <span>
              Every amount above is calculated on our server from our own catalog. Nothing this
              page sends can change what you are charged.
            </span>
          </p>
        </aside>
      </form>
    </>
  );
}

/* ---------------------------------------------------------------------- */

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  inputMode,
  error,
  className = "",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  inputMode?: "numeric" | "text" | "tel" | "email";
  error?: string;
  className?: string;
}) {
  return (
    <div className={className} {...(error ? { "data-field-error": "true" } : {})}>
      <label htmlFor={id} className="eyebrow mb-2 block">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`w-full border-b bg-transparent px-1 py-3 text-sm outline-none transition-colors ${
          error ? "border-madder" : "border-ink/25 focus:border-ink"
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

export { displayPrice };
