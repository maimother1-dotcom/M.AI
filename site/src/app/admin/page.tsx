import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AdminNav } from "@/components/admin/AdminNav";
import { ProductAdmin } from "@/components/admin/ProductAdmin";
import { ADMIN_COOKIE, isAdminEnabled, readSession } from "@/lib/admin/auth";
import { describeStore, getCatalog, getOverrides } from "@/lib/admin/store";
import { beautyCleared, isComplianceConfigured } from "@/data/compliance";
import { describeOrderStore } from "@/lib/order-store";
import { isGstRegistered } from "@/data/tax";
import { Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Catalogue administration",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!isAdminEnabled()) notFound();

  // Checked on the server before a single byte of catalogue data is rendered.
  // The API routes check independently — this is not the only gate, by design.
  const store = await cookies();
  if (!readSession(store.get(ADMIN_COOKIE)?.value)) {
    redirect("/admin/login");
  }

  /**
   * Compliance blockers, shown to the seller and never to a customer.
   *
   * The product page renders the declarations either way — a listing without
   * them is the violation. What it cannot do is invent the details, so an
   * unconfigured site publishes visible placeholders. This banner is how you
   * find out before a Legal Metrology inspector does.
   */
  const blockers: string[] = [];
  if (!isComplianceConfigured()) {
    blockers.push(
      "Business details are still placeholders. Fill in COMPLIANCE in src/data/compliance.ts — the manufacturer name and address, consumer care details and packing date are printing as [brackets] on every product page.",
    );
  }
  if (!beautyCleared()) {
    blockers.push(
      "No cosmetic licence on file. Selling beauty in India needs your supplier's CDSCO licence recorded in COSMETIC_LICENCE. Until then, do not take orders in the Beauty category.",
    );
  }
  const orderStore = await describeOrderStore();
  if (!orderStore.durable) {
    blockers.push(`Orders: ${orderStore.note}`);
  }
  if (!isGstRegistered()) {
    blockers.push(
      "No GSTIN on file. Fill in TAX in src/data/tax.ts, or every sale is documented as a bill of supply rather than a tax invoice — which is correct for an unregistered seller, and wrong the moment you cross the registration threshold.",
    );
  }

  return (
    <Container className="py-12 lg:py-16">
      <AdminNav current="catalogue" />

      <div className="h-8" />

      {blockers.length > 0 && (
        <div className="mb-10 border border-madder/40 bg-madder/5 p-5">
          <p className="eyebrow text-madder">Before you sell</p>
          <ul className="mt-3 space-y-2.5">
            {blockers.map((blocker) => (
              <li key={blocker} className="flex gap-3 text-sm leading-relaxed text-ink-soft">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-madder" />
                <span className="text-pretty">{blocker}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ProductAdmin
        initialProducts={getCatalog()}
        overriddenIds={Object.keys(getOverrides())}
        store={describeStore()}
      />
    </Container>
  );
}
