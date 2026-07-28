"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ProductImage } from "@/components/product/ProductImage";
import { Button } from "@/components/ui";
import { displayPrice, savingPercent } from "@/lib/currency";
import type { Badge, Product } from "@/lib/types";

const BADGES: Badge[] = ["new", "bestseller", "last-few", "editors-pick"];

interface StoreInfo {
  mode: "file" | "memory";
  durable: boolean;
  note: string;
}

interface Draft {
  name: string;
  summary: string;
  price: string;
  compareAt: string;
  stock: string;
  badges: Badge[];
  image: string;
}

export function ProductAdmin({
  initialProducts,
  overriddenIds,
  store,
}: {
  initialProducts: Product[];
  overriddenIds: string[];
  store: StoreInfo;
}) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [overridden, setOverridden] = useState(new Set(overriddenIds));
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(initialProducts.map((p) => p.category)))],
    [initialProducts],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.id.includes(q);
    });
  }, [products, query, category]);

  function beginEdit(product: Product) {
    setEditing(product.id);
    setMessage(null);
    setDraft({
      name: product.name,
      summary: product.summary,
      // Shown in rupees, sent in paise. Editing paise by hand invites a
      // hundred-fold mistake on a live price.
      price: (product.priceMinor / 100).toString(),
      compareAt: (product.compareAtMinor / 100).toString(),
      stock: product.stock.toString(),
      badges: [...product.badges],
      image: product.image ?? "",
    });
  }

  async function save(id: string) {
    if (!draft) return;
    setBusy(true);
    setMessage(null);

    const priceMinor = Math.round(Number(draft.price) * 100);
    const compareAtMinor = Math.round(Number(draft.compareAt) * 100);

    if (!Number.isFinite(priceMinor) || !Number.isFinite(compareAtMinor)) {
      setMessage({ kind: "error", text: "Prices must be numbers." });
      setBusy(false);
      return;
    }

    try {
      const response = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: draft.name,
          summary: draft.summary,
          priceMinor,
          compareAtMinor,
          stock: Number(draft.stock),
          badges: draft.badges,
          image: draft.image.trim() === "" ? null : draft.image.trim(),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage({ kind: "error", text: data.message ?? "Could not save." });
        setBusy(false);
        return;
      }

      setProducts((current) => current.map((p) => (p.id === id ? data.product : p)));
      setOverridden((current) => new Set(current).add(id));
      setEditing(null);
      setDraft(null);
      setMessage({ kind: "ok", text: `${data.product.name} saved.` });
      router.refresh(); // so the storefront reflects it immediately
    } catch {
      setMessage({ kind: "error", text: "Network error." });
    } finally {
      setBusy(false);
    }
  }

  async function revert(id: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/products?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage({ kind: "error", text: data.message ?? "Could not revert." });
        return;
      }
      setProducts((current) => current.map((p) => (p.id === id ? data.product : p)));
      setOverridden((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      setEditing(null);
      setDraft(null);
      setMessage({ kind: "ok", text: `${data.product.name} reverted to the committed catalogue.` });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="eyebrow">Administration</p>
          <h1 className="mt-2 font-display text-4xl">Catalogue</h1>
          <p className="mt-2 text-xs text-ink-muted tabular">
            {products.length} products · {overridden.size} edited
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            href="/api/admin/export"
            className="inline-flex items-center border border-ink/25 px-5 py-2.5 text-[11px] uppercase tracking-[0.16em] transition-colors hover:border-ink"
          >
            Export edits
          </a>
          <Button variant="secondary" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>

      {/* Durability banner — the thing nobody should discover the hard way. */}
      {!store.durable && (
        <div className="mb-8 border border-madder/50 bg-madder/5 p-5">
          <p className="text-sm text-madder">Edits are not being saved permanently</p>
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">{store.note}</p>
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">
            You can still edit and then use <span className="text-ink">Export edits</span> to
            download the changes and commit them to the repository.
          </p>
        </div>
      )}

      {message && (
        <p
          role="status"
          className={`mb-6 border p-4 text-sm ${
            message.kind === "ok"
              ? "border-gold/50 bg-gold/10 text-ink"
              : "border-madder/40 bg-madder/5 text-madder"
          }`}
        >
          {message.text}
        </p>
      )}

      {/* Filters */}
      <div className="mb-8 flex flex-wrap gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or id"
          className="min-w-[220px] flex-1 border border-line bg-transparent px-4 py-2.5 text-sm outline-none focus:border-ink"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="cursor-pointer border border-line bg-transparent px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] outline-none focus:border-ink"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Rows */}
      <ul className="divide-y divide-line border-y border-line">
        {visible.map((product) => {
          const isEditing = editing === product.id;
          const saving = savingPercent(product.priceMinor, product.compareAtMinor);

          return (
            <li key={product.id} className="py-5">
              <div className="flex flex-wrap items-center gap-4">
                <div className="relative aspect-[3/4] w-14 shrink-0 overflow-hidden bg-ivory-deep">
                  <ProductImage
                    id={product.id}
                    name={product.name}
                    category={product.category}
                    subcategory={product.subcategory}
                    image={product.image}
                    sizes="56px"
                  />
                </div>

                <div className="min-w-[180px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-lg">{product.name}</span>
                    {overridden.has(product.id) && (
                      <span className="bg-gold/25 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em]">
                        Edited
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-muted tabular">
                    {product.id} · {product.category} / {product.subcategory}
                  </p>
                </div>

                <div className="text-right text-sm tabular">
                  <p>{displayPrice(product.priceMinor)}</p>
                  <p className="text-[11px] text-ink-muted">
                    was {displayPrice(product.compareAtMinor)} · −{saving}%
                  </p>
                </div>

                <div className="w-20 text-right text-sm tabular">
                  <p className={product.stock === 0 ? "text-madder" : ""}>{product.stock}</p>
                  <p className="text-[11px] text-ink-muted">in stock</p>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => (isEditing ? setEditing(null) : beginEdit(product))}
                >
                  {isEditing ? "Close" : "Edit"}
                </Button>
              </div>

              {isEditing && draft && (
                <div className="mt-5 border border-line bg-ivory-deep p-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field
                      label="Name"
                      value={draft.name}
                      onChange={(v) => setDraft({ ...draft, name: v })}
                      className="sm:col-span-2"
                    />
                    <Field
                      label="Summary"
                      value={draft.summary}
                      onChange={(v) => setDraft({ ...draft, summary: v })}
                      className="sm:col-span-2"
                    />
                    <Field
                      label="Price (₹)"
                      value={draft.price}
                      onChange={(v) => setDraft({ ...draft, price: v })}
                      inputMode="decimal"
                    />
                    <Field
                      label="Typical boutique price (₹)"
                      value={draft.compareAt}
                      onChange={(v) => setDraft({ ...draft, compareAt: v })}
                      inputMode="decimal"
                    />
                    <Field
                      label="Stock"
                      value={draft.stock}
                      onChange={(v) => setDraft({ ...draft, stock: v })}
                      inputMode="numeric"
                    />
                    <Field
                      label="Image URL (blank for generated art)"
                      value={draft.image}
                      onChange={(v) => setDraft({ ...draft, image: v })}
                      placeholder="/photos/dress.jpg or https://…"
                    />

                    <div className="sm:col-span-2">
                      <span className="eyebrow mb-2 block">Badges</span>
                      <div className="flex flex-wrap gap-2">
                        {BADGES.map((badge) => {
                          const active = draft.badges.includes(badge);
                          return (
                            <button
                              key={badge}
                              type="button"
                              onClick={() =>
                                setDraft({
                                  ...draft,
                                  badges: active
                                    ? draft.badges.filter((b) => b !== badge)
                                    : [...draft.badges, badge],
                                })
                              }
                              className={`border px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] transition-colors ${
                                active ? "border-ink bg-ink text-ivory" : "border-line hover:border-ink/50"
                              }`}
                            >
                              {badge.replace("-", " ")}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <Button size="sm" onClick={() => save(product.id)} disabled={busy}>
                      {busy ? "Saving…" : "Save"}
                    </Button>
                    {overridden.has(product.id) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revert(product.id)}
                        disabled={busy}
                      >
                        Revert to committed
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {visible.length === 0 && (
        <p className="py-16 text-center text-sm text-ink-muted">Nothing matches that search.</p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
  placeholder,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "numeric" | "decimal" | "text";
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="eyebrow mb-2 block">{label}</label>
      <input
        value={value}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-line bg-ivory px-3 py-2.5 text-sm outline-none focus:border-ink"
      />
    </div>
  );
}
