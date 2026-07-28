import type { Metadata } from "next";
import { CartView } from "@/components/cart/CartView";
import { Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Your bag",
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return (
    <Container className="py-14 lg:py-20">
      <CartView />
    </Container>
  );
}
