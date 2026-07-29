import { Hero } from "@/components/home/Hero";
import { PriceAnatomy } from "@/components/home/PriceAnatomy";
import {
  Bestsellers,
  BeautySpotlight,
  CategoryTiles,
  EditorialSplit,
  Lookbook,
  NewArrivals,
  Testimonials,
  TrustStrip,
} from "@/components/home/Sections";

/**
 * Bestsellers and New arrivals price from the runtime override store, so this
 * page cannot be baked either — see the note in `product/[slug]/page.tsx`.
 */
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <>
      <Hero />
      <TrustStrip />
      <CategoryTiles />
      <Bestsellers />
      <PriceAnatomy />
      <EditorialSplit />
      <NewArrivals />
      <BeautySpotlight />
      <Testimonials />
      <Lookbook />
    </>
  );
}
