import type { Metadata } from "next";
import { Suspense } from "react";
import { SuccessClient } from "@/components/checkout/SuccessClient";
import { Motif } from "@/components/brand/Motif";
import { Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Order confirmed",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default function SuccessPage() {
  return (
    <Container className="py-14 lg:py-20">
      {/* useSearchParams needs a Suspense boundary. */}
      <Suspense
        fallback={
          <div className="flex flex-col items-center py-28">
            <Motif className="h-14 w-14 animate-pulse text-gold/60" />
          </div>
        }
      >
        <SuccessClient />
      </Suspense>
    </Container>
  );
}
