"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { displayPrice } from "@/lib/currency";

/**
 * Raising and processing a return against one order.
 *
 * The admin picks quantities; the server prices them. Nothing here sends an
 * amount, and there is nowhere in the request shape to put one — on a surface
 * that issues refunds, that is the property worth designing around.
 */

interface OrderLine {
  sku: string;
  name: string;
  quantity: number;
  size: string;
  colorway: string;
}

export interface ReturnSummary {
  rma: string;
  status: string;
  reason: string;
  refundableMinor: number;
  refundedMinor: number;
  refundId?: string;
  restocked: boolean;
  lines: { sku: string; quantity: number }[];
}

const REASONS: { value: string; label: string }[] = [
  { value: "size", label: "Size" },
  { value: "changed-mind", label: "Changed their mind" },
  { value: "not-as-described", label: "Not as described" },
  { value: "faulty", label: "Faulty" },
  { value: "damaged-in-transit", label: "Damaged in transit" },
  { value: "wrong-item-sent", label: "We sent the wrong thing" },
];

export function ReturnPanel({
  orderNumber,
  orderLines,
  returns,
}: {
  orderNumber: string;
  orderLines: OrderLine[];
  returns: ReturnSummary[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reason, setReason] = useState("size");
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  async function send(path: string, body: unknown, method: "POST" | "PATCH") {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (data.ok) {
        setMessage(
          data.amountMinor !== undefined
            ? `Refunded ${displayPrice(data.amountMinor)}.`
            : "Done.",
        );
        setOpen(false);
        setQuantities({});
        router.refresh();
      } else {
        setMessage(data.message ?? "That did not work.");
      }
    } catch {
      setMessage("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const chosen = Object.entries(quantities)
    .filter(([, q]) => q > 0)
    .map(([sku, quantity]) => ({ sku, quantity }));

  return (
    <div className="mt-6 border-t border-line pt-5">
      <p className="eyebrow mb-3">Returns</p>

      {returns.length > 0 && (
        <ul className="mb-4 space-y-3">
          {returns.map((record) => (
            <li key={record.rma} className="border border-line p-3 text-xs">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono">{record.rma}</span>
                <span className="uppercase tracking-[0.12em] text-ink-muted">{record.status}</span>
                <span className="ml-auto tabular">
                  {record.refundedMinor > 0
                    ? `${displayPrice(record.refundedMinor)} refunded`
                    : `${displayPrice(record.refundableMinor)} refundable`}
                </span>
              </div>
              <p className="mt-1.5 text-ink-muted">
                {record.lines.map((l) => `${l.quantity}× ${l.sku}`).join(", ")} · {record.reason}
                {record.restocked && " · restocked"}
                {record.refundId && ` · ${record.refundId}`}
              </p>

              <div className="mt-2.5 flex flex-wrap gap-2">
                {record.status === "requested" && (
                  <>
                    <Action
                      label="Parcel received"
                      busy={busy}
                      onClick={() => send("/api/admin/returns", { rma: record.rma, action: "receive" }, "PATCH")}
                    />
                    <Action
                      label="Reject"
                      busy={busy}
                      onClick={() => send("/api/admin/returns", { rma: record.rma, action: "reject" }, "PATCH")}
                    />
                  </>
                )}
                {record.status === "received" && (
                  <Action
                    label={`Refund ${displayPrice(record.refundableMinor)}`}
                    busy={busy}
                    primary
                    onClick={() => send("/api/admin/returns", { rma: record.rma, action: "refund" }, "PATCH")}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border border-ink/25 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] transition-colors hover:border-ink"
        >
          Start a return
        </button>
      ) : (
        <div className="border border-line p-4">
          <p className="mb-3 text-xs text-ink-muted">
            What is coming back? The refund is worked out from what this customer actually paid,
            including their share of any promotion.
          </p>

          <ul className="space-y-2">
            {orderLines.map((line) => (
              <li key={`${line.sku}-${line.size}`} className="flex items-center gap-3 text-xs">
                <label htmlFor={`q-${orderNumber}-${line.sku}`} className="flex-1">
                  {line.name}
                  <span className="block text-ink-muted">
                    {line.sku} · {line.size} · {line.colorway} · {line.quantity} bought
                  </span>
                </label>
                <input
                  id={`q-${orderNumber}-${line.sku}`}
                  type="number"
                  min={0}
                  max={line.quantity}
                  value={quantities[line.sku] ?? 0}
                  onChange={(e) =>
                    setQuantities((q) => ({
                      ...q,
                      [line.sku]: Math.max(0, Math.min(line.quantity, Number(e.target.value))),
                    }))
                  }
                  className="w-16 border border-line px-2 py-1 text-right tabular"
                />
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-xs">
              <span className="mb-1 block text-ink-muted">Reason</span>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="border border-line bg-transparent px-2 py-1.5 text-xs"
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>

            <Action
              label="Raise return"
              primary
              busy={busy || chosen.length === 0}
              onClick={() =>
                send("/api/admin/returns", { orderNumber, reason, lines: chosen }, "POST")
              }
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] uppercase tracking-[0.14em] text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {message && <p className="mt-3 text-xs text-ink-soft">{message}</p>}
    </div>
  );
}

function Action({
  label,
  onClick,
  busy,
  primary,
}: {
  label: string;
  onClick: () => void;
  busy: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] transition-colors disabled:opacity-40 ${
        primary
          ? "bg-ink text-ivory hover:bg-ink/85"
          : "border border-ink/25 hover:border-ink"
      }`}
    >
      {label}
    </button>
  );
}
