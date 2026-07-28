import type { Metadata } from "next";
import { WishlistClient } from "@/components/shop/WishlistClient";
import { MotifDivider } from "@/components/brand/Motif";
import { Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Wishlist",
  robots: { index: false, follow: true },
};

export default function WishlistPage() {
  return (
    <Container className="py-16 lg:py-24">
      <header className="mb-12 text-center">
        <p className="eyebrow mb-4">Kept for later</p>
        <h1 className="text-4xl sm:text-5xl">Your wishlist</h1>
        <MotifDivider className="mx-auto mt-7 max-w-[200px]" />
      </header>
      <WishlistClient />
    </Container>
  );
}
