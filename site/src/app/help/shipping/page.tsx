import type { Metadata } from "next";
import { ArticlePage } from "@/components/layout/ArticlePage";

export const metadata: Metadata = {
  title: "Shipping",
  description: "Delivery times, costs and tracking for L'Indienne orders across India and worldwide.",
};

export default function ShippingPage() {
  return (
    <ArticlePage
      eyebrow="Help"
      title="Shipping"
      intro="Everything leaves Kolkata within one working day. Below is what it costs and how long it takes, with no asterisks."
      blocks={[
        {
          heading: "Within India",
          table: {
            head: ["Method", "Cost"],
            rows: [
              ["Standard, 5 – 8 working days", "₹249"],
              ["Standard, orders over ₹5,000", "Complimentary"],
              ["Express, 2 – 3 working days", "₹599"],
            ],
          },
          paragraphs: [
            "Metro cities usually arrive at the faster end of each range. Remote PIN codes can add two working days, and our courier will tell you at the point of dispatch rather than leaving you to guess.",
          ],
        },
        {
          heading: "International",
          paragraphs: [
            "We ship worldwide by tracked courier. Rates are calculated at checkout from actual weight and destination rather than a flat fee that overcharges most people to subsidise a few.",
            "Duties and import taxes are not included and are payable by you on delivery. We say this plainly because the alternative — a surprise bill from a courier — is the single most common complaint in international e-commerce.",
          ],
        },
        {
          heading: "Tracking",
          paragraphs: [
            "You get a tracking number by email the moment your parcel is scanned by the courier, not when the label is generated. Those are usually a day apart, and a tracking number that shows nothing for twenty-four hours is a bad experience we would rather avoid.",
          ],
        },
        {
          heading: "Packaging",
          bullets: [
            "Recycled and recyclable throughout. No plastic wrap on garments.",
            "Silk and knitwear ship in reusable cotton muslin bags.",
            "Jewellery and beauty ship in rigid boxes that survive a courier.",
            "No branded outer packaging, so nothing advertises what is inside.",
          ],
        },
      ]}
    />
  );
}
