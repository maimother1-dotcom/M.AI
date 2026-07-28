import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ProductAdmin } from "@/components/admin/ProductAdmin";
import { ADMIN_COOKIE, isAdminEnabled, readSession } from "@/lib/admin/auth";
import { describeStore, getCatalog, getOverrides } from "@/lib/admin/store";
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

  return (
    <Container className="py-12 lg:py-16">
      <ProductAdmin
        initialProducts={getCatalog()}
        overriddenIds={Object.keys(getOverrides())}
        store={describeStore()}
      />
    </Container>
  );
}
