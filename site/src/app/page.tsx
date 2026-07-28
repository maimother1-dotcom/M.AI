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
