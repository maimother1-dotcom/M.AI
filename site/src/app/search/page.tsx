import type { Metadata } from "next";
import { SearchClient } from "@/components/shop/SearchClient";
import { Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Search",
  description: "Search the L'Indienne collection by piece, material or colour.",
  robots: { index: false, follow: true },
};

export default function SearchPage() {
  return (
    <Container className="py-16 lg:py-24">
      <h1 className="sr-only">Search</h1>
      <SearchClient />
    </Container>
  );
}
