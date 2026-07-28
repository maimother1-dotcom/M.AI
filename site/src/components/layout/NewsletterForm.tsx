"use client";

import { useState } from "react";

type Status = "idle" | "loading" | "done" | "error";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("loading");

    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website }),
      });
      const data = await response.json();

      if (!response.ok) {
        setStatus("error");
        setMessage(data.message ?? "Something went wrong. Try again.");
        return;
      }

      setStatus("done");
      setMessage(data.message ?? "You are on the list.");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Network error. Try again.");
    }
  }

  if (status === "done") {
    return (
      <div className="border border-gold/40 bg-ivory px-6 py-8">
        <p className="font-display text-2xl">Welcome to the house.</p>
        <p className="mt-2 text-sm text-ink-soft">{message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="newsletter-email" className="sr-only">
          Email address
        </label>
        <input
          id="newsletter-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="min-w-0 flex-1 border-b border-ink/25 bg-transparent px-1 py-3 text-sm outline-none transition-colors placeholder:text-ink-muted/70 focus:border-ink"
        />

        {/* Honeypot. Hidden from people, irresistible to bots. */}
        <div className="absolute left-[-9999px]" aria-hidden="true">
          <label htmlFor="newsletter-website">Leave this empty</label>
          <input
            id="newsletter-website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={status === "loading"}
          className="shrink-0 border border-ink bg-ink px-8 py-3.5 text-[11px] uppercase tracking-[0.18em] text-ivory transition-colors duration-500 hover:bg-madder hover:border-madder disabled:opacity-40"
        >
          {status === "loading" ? "Joining…" : "Join"}
        </button>
      </div>

      {status === "error" && <p className="mt-3 text-xs text-madder">{message}</p>}

      <p className="mt-4 text-[11px] leading-relaxed text-ink-muted">
        By joining you agree to our{" "}
        <a href="/legal/privacy" className="link-underline">
          privacy policy
        </a>
        . Unsubscribe in one click, any time.
      </p>
    </form>
  );
}
