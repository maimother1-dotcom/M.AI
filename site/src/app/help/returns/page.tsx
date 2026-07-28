import type { Metadata } from "next";
import { ArticlePage } from "@/components/layout/ArticlePage";

export const metadata: Metadata = {
  title: "Returns & exchanges",
  description:
    "Thirty-day returns on unworn pieces, return courier paid by us, and a two-year repair on making faults.",
};

export default function ReturnsPage() {
  return (
    <ArticlePage
      eyebrow="Help"
      title="Returns & exchanges"
      intro="Thirty days, no questions, and we pay the courier. The exceptions below are the only ones, and they exist for hygiene rather than for margin."
      blocks={[
        {
          heading: "The policy",
          bullets: [
            "Thirty days from delivery, not from dispatch.",
            "Unworn, unwashed, with tags still attached.",
            "We pay the return courier within India. No restocking fee, ever.",
            "Refunds are issued to the original payment method within five working days of the parcel reaching us.",
          ],
        },
        {
          heading: "What cannot come back",
          paragraphs: [
            "Beauty is returnable unopened only. Once a seal is broken we cannot resell it and will not pretend otherwise. Pierced jewellery — earrings and ear cuffs — cannot be returned once worn, for the same reason.",
            "Anything altered or tailored is final sale, including trousers hemmed after purchase. If a piece arrives faulty, none of this applies and we replace it.",
          ],
        },
        {
          heading: "Exchanges",
          paragraphs: [
            "Send the piece back and place a new order — it is faster than a formal exchange, because your replacement ships immediately rather than waiting for the original to arrive with us. Your refund is processed separately.",
            "If the exchange is because we sent the wrong size or colour, tell us and we ship the correct one before the incorrect one has been collected.",
          ],
        },
        {
          heading: "The two-year repair",
          paragraphs: [
            "Separate from returns and longer. For two years from purchase we repair making faults free of charge: stitching that has come apart, hardware that has failed, a sole that has separated. Postage both ways is on us.",
            "This covers faults in the making, not wear. A leather bag that has scuffed after eighteen months of daily use is behaving correctly and we will condition it for you rather than repair it. A strap that has torn out of its stitching in three months is our error, and it is our problem.",
          ],
        },
        {
          heading: "Starting a return",
          paragraphs: [
            "Email care@lindienne.com with your order number. We reply with a prepaid label the same working day. There is no form to fill in and no portal to log into.",
          ],
        },
      ]}
    />
  );
}
