import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { isAdminEnabled } from "@/lib/admin/auth";
import { Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  // No credentials configured means the admin does not exist on this
  // deployment. A 404 rather than a login form, so there is nothing to probe.
  if (!isAdminEnabled()) notFound();

  return (
    <Container className="flex min-h-[70vh] items-center py-16">
      <LoginForm />
    </Container>
  );
}
