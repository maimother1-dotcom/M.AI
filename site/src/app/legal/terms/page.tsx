import type { Metadata } from "next";
import { ArticlePage } from "@/components/layout/ArticlePage";

export const metadata: Metadata = {
  title: "Terms of sale",
  description: "The terms on which L'Indienne sells, including pricing, cancellation and liability.",
};

export default function TermsPage() {
  return (
    <ArticlePage
      eyebrow="Legal"
      title="Terms of sale"
      intro="The terms you agree to when you order. Short, because a long one is usually hiding something."
      updated="27 July 2026"
      blocks={[
        {
          heading: "The contract",
          paragraphs: [
            "Placing an order is an offer to buy. The contract forms when we email you a dispatch confirmation, not when you pay. If we cannot fulfil an order we refund it in full and tell you why.",
          ],
        },
        {
          heading: "Pricing",
          paragraphs: [
            "All prices are in Indian rupees and include GST at the applicable rate. Shipping is shown separately before you pay.",
            "Every amount is calculated on our servers from our own catalog at the moment of checkout. If a price is displayed incorrectly through a technical error, we will contact you before dispatching and you may cancel for a full refund rather than being held to an obvious mistake.",
            "Crossed-out comparison prices are the typical retail for a comparable piece of the same construction and material. They are not a specific competitor's price and are not a price at which we previously sold the item.",
          ],
        },
        {
          heading: "Cancellation",
          paragraphs: [
            "You may cancel before dispatch for a full refund, with no reason required — email care@lindienne.com and we will stop the parcel if it has not left. After dispatch, the thirty-day returns policy applies.",
          ],
        },
        {
          heading: "Products",
          bullets: [
            "Hand-made pieces vary. Block prints, hand embroidery and fired enamel differ slightly between units, and that variation is the evidence of handwork rather than a defect.",
            "Generated product imagery is used where photography is not yet available. Specifications, materials and measurements on each product page are accurate and are what you are buying against.",
            "Natural materials change. Vegetable-tanned leather darkens, indigo fades, silver tarnishes. This is described on the product pages and is not covered as a fault.",
          ],
        },
        {
          heading: "Our liability",
          paragraphs: [
            "We are liable for what we get wrong: faulty goods, incorrect items, and losses that follow reasonably from our error. Our total liability for any order is limited to the amount you paid for it.",
            "Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or for anything else that cannot lawfully be limited. Your statutory rights under the Consumer Protection Act 2019 are unaffected by anything written here.",
          ],
        },
        {
          heading: "Intellectual property",
          paragraphs: [
            "The name L'Indienne, our designs, our written content and our imagery belong to us. All third-party trade marks referred to anywhere on this site remain the property of their owners, and no association with or endorsement by any other brand is claimed or implied.",
          ],
        },
        {
          heading: "Governing law",
          paragraphs: [
            "These terms are governed by the laws of India, and the courts of Kolkata, West Bengal have jurisdiction. If you are a consumer resident elsewhere, this does not remove protections available to you under the mandatory law of your own country.",
          ],
        },
      ]}
    />
  );
}
