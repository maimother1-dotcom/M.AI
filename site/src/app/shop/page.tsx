import type { Metadata } from "next";
import { getCatalog } from "@/lib/admin/store";
import { ShopGrid } from "@/components/shop/ShopGrid";
import { MotifDivider } from "@/components/brand/Motif";
import { Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Shop everything",
  description:
    "Every piece in the house — silk, leather, demi-fine jewellery, clean beauty and accessories, at 60 to 75 percent below boutique pricing.",
};

/** Reads the runtime override store — see the note in `product/[slug]/page.tsx`. */
export const dynamic = "force-dynamic";

export default function ShopPage() {
  const catalog = getCatalog();
  return (
    <>
      <header className="border-b border-line py-16 lg:py-24">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow mb-4">The complete collection</p>
            <h1 className="text-balance text-4xl sm:text-5xl lg:text-6xl">Everything</h1>
            <MotifDivider className="mx-auto my-8 max-w-[220px]" />
            <p className="text-pretty text-sm leading-relaxed text-ink-soft">
              {catalog.length} pieces. Each one is here because there is a specific,
              nameable reason it is better than the version you would otherwise buy — and
              that reason is written on its page.
            </p>
          </div>
        </Container>
      </header>

      <Container className="py-14 lg:py-20">
        <ShopGrid products={catalog} />
      </Container>
    </>
  );
}
