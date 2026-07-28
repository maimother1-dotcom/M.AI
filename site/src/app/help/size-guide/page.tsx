import type { Metadata } from "next";
import { ArticlePage } from "@/components/layout/ArticlePage";

export const metadata: Metadata = {
  title: "Size guide",
  description: "Measurements in centimetres for clothing and shoes, plus how each fit runs.",
};

export default function SizeGuidePage() {
  return (
    <ArticlePage
      eyebrow="Help"
      title="Size guide"
      intro="Body measurements in centimetres, not garment measurements. Measure over your underwear, keep the tape level, and do not pull it tight."
      blocks={[
        {
          heading: "Clothing — bust",
          table: {
            head: ["Size", "Bust (cm)"],
            rows: [
              ["XS", "78 – 82"],
              ["S", "83 – 87"],
              ["M", "88 – 93"],
              ["L", "94 – 99"],
              ["XL", "100 – 106"],
              ["XXL", "107 – 113"],
            ],
          },
        },
        {
          heading: "Clothing — waist and hip",
          table: {
            head: ["Size", "Waist / Hip (cm)"],
            rows: [
              ["XS", "60 – 64 / 86 – 90"],
              ["S", "65 – 69 / 91 – 95"],
              ["M", "70 – 75 / 96 – 101"],
              ["L", "76 – 81 / 102 – 107"],
              ["XL", "82 – 88 / 108 – 114"],
              ["XXL", "89 – 95 / 115 – 121"],
            ],
          },
          paragraphs: [
            "If you fall between sizes on bust and waist, size to the larger of the two. Taking in a seam is straightforward for any tailor; letting one out often is not, because there may be no fabric to work with.",
          ],
        },
        {
          heading: "Shoes",
          table: {
            head: ["EU", "Foot length (cm)"],
            rows: [
              ["35", "22.5"],
              ["36", "23.0"],
              ["37", "23.7"],
              ["38", "24.4"],
              ["39", "25.1"],
              ["40", "25.8"],
              ["41", "26.5"],
            ],
          },
          paragraphs: [
            "Measure at the end of the day, standing, with your weight on the foot. Feet swell by up to half a size between morning and evening and every shoe that hurts by 6pm was fitted at 10am.",
          ],
        },
        {
          heading: "How our fits run",
          bullets: [
            "Silk slip dresses run true. The bias cut gives about one size of stretch across the hip.",
            "Knitwear is cut relaxed. Size down for a close fit.",
            "Tailoring — blazers and trousers — runs true and is cut for a fitted shoulder.",
            "The Colette loafer runs slightly narrow. Consider a half size up if you have a wide foot.",
            "The Amandine ballet flat has no give in the topline. Most people prefer a half size up.",
            "Linen relaxes with wear and washing. Size to your measurement, not above it.",
          ],
        },
        {
          heading: "Still not sure",
          paragraphs: [
            "Email care@lindienne.com with your measurements and the piece you are considering. Someone who has handled the garment will answer, usually within a few hours. It is a better use of everyone's time than a return.",
          ],
        },
      ]}
    />
  );
}
