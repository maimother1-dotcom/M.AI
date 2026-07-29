import Link from "next/link";

/** Tabs across the admin. Lives here rather than in a page, because a page route
 *  may only export a default component and Next's route config fields. */
export function AdminNav({ current }: { current: "catalogue" | "orders" }) {
  const tabs = [
    { key: "catalogue", href: "/admin", label: "Catalogue" },
    { key: "orders", href: "/admin/orders", label: "Orders" },
  ] as const;

  return (
    <nav className="flex gap-6 border-b border-line pb-4">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === current ? "page" : undefined}
          className={`text-[11px] uppercase tracking-[0.16em] transition-colors ${
            tab.key === current ? "text-ink" : "text-ink-muted hover:text-ink"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
