"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Retry the courier push for one order.
 *
 * The webhook already does this on capture; this is the recovery path for when
 * Shiprocket was down or the wallet was empty. Both of those come back, and when
 * they do somebody wants to press a button rather than reissue a payment.
 */
export function FulfilButton({ orderNumber, label }: { orderNumber: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function push() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/fulfil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber }),
      });
      const data = (await response.json()) as { ok?: boolean; awbCode?: string; message?: string };
      if (data.ok) {
        setMessage(data.awbCode ? `AWB ${data.awbCode}` : "Pushed.");
        router.refresh();
      } else {
        setMessage(data.message ?? "Could not push it.");
      }
    } catch {
      setMessage("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={push}
        disabled={busy}
        className="border border-ink/25 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] transition-colors hover:border-ink disabled:opacity-50"
      >
        {busy ? "Pushing…" : label}
      </button>
      {message && <p className="mt-2 text-xs text-ink-soft">{message}</p>}
    </div>
  );
}
