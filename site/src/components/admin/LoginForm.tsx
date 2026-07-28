"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Motif } from "@/components/brand/Motif";
import { Button } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, code }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.message ?? "Sign-in failed.");
        setCode(""); // a TOTP code is single-use; make them read a fresh one
        setSubmitting(false);
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="text-center">
        <Motif className="mx-auto h-10 w-10 text-gold" />
        <h1 className="mt-6 font-display text-3xl">House administration</h1>
        <p className="mt-2 text-xs text-ink-muted">
          Password and authenticator code both required.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-10 space-y-6">
        <div>
          <label htmlFor="admin-email" className="eyebrow mb-2 block">
            Email
          </label>
          <input
            id="admin-email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border-b border-ink/25 bg-transparent px-1 py-3 text-sm outline-none focus:border-ink"
          />
        </div>

        <div>
          <label htmlFor="admin-password" className="eyebrow mb-2 block">
            Password
          </label>
          <input
            id="admin-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border-b border-ink/25 bg-transparent px-1 py-3 text-sm outline-none focus:border-ink"
          />
        </div>

        <div>
          <label htmlFor="admin-code" className="eyebrow mb-2 block">
            Authenticator code
          </label>
          <input
            id="admin-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full border-b border-ink/25 bg-transparent px-1 py-3 text-center text-2xl tracking-[0.5em] tabular outline-none focus:border-ink"
          />
        </div>

        {error && (
          <p role="alert" className="border border-madder/40 bg-madder/5 p-3 text-xs text-madder">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? "Checking…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-8 text-center text-[11px] leading-relaxed text-ink-muted">
        Attempts are rate limited and logged. If you have lost your authenticator,
        regenerate the secret with <code>npm run admin:setup</code> and update the
        deployment&rsquo;s environment variables.
      </p>
    </div>
  );
}
