import type { Metadata } from "next";
import { ArticlePage } from "@/components/layout/ArticlePage";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What L'Indienne collects, why, how long it is kept, and how to have it deleted.",
};

export default function PrivacyPage() {
  return (
    <ArticlePage
      eyebrow="Legal"
      title="Privacy policy"
      intro="Written to be read. If something here is unclear, that is a fault in the writing and we would like to know about it."
      updated="27 July 2026"
      blocks={[
        {
          heading: "What we collect",
          bullets: [
            "Order details: your name, email, phone, shipping address, and what you bought. Needed to fulfil the order.",
            "Payment confirmation: a token and a status from our payment processor. We never receive or store your card number, expiry or CVC.",
            "Email address, if you join the newsletter. Withdrawable in one click.",
            "Basic technical data in server logs: IP address, user agent, and the pages requested. Used for security and rate limiting.",
          ],
        },
        {
          heading: "What stays in your browser",
          paragraphs: [
            "Your bag and your wishlist are stored in this browser's local storage and are never transmitted to us until you check out. Clearing your browser data clears both, and we have no copy.",
            "This site sets no advertising or cross-site tracking cookies, and there is no third-party analytics script on any page.",
          ],
        },
        {
          heading: "Who else sees it",
          bullets: [
            "Our payment processor, to take the payment. They are PCI DSS Level 1 certified and are the only party that handles card data.",
            "Our courier, to deliver the parcel — name, address and phone only.",
            "Our email provider, to send order confirmations and, if you asked for it, the newsletter.",
            "Nobody else. We do not sell, rent or share personal data for marketing, and we will not begin to.",
          ],
        },
        {
          heading: "How long we keep it",
          paragraphs: [
            "Order records are kept for eight years, because Indian tax law requires it. Newsletter subscriptions are kept until you unsubscribe. Server logs are kept for thirty days and then deleted.",
          ],
        },
        {
          heading: "Your rights",
          paragraphs: [
            "Under the Digital Personal Data Protection Act 2023, and under the GDPR if you are in the EU or UK, you can ask for a copy of your data, ask us to correct it, or ask us to erase it. Email care@lindienne.com and we will respond within thirty days.",
            "Erasure has one limit: we cannot delete an order record we are legally required to retain for tax purposes. We can and will delete everything else.",
          ],
        },
        {
          heading: "Security",
          bullets: [
            "The whole site is served over TLS. There is no unencrypted version of it.",
            "Card data never reaches our infrastructure, which is the strongest protection available: we cannot leak what we do not hold.",
            "Order records are cryptographically signed, so a receipt cannot be forged by editing a URL.",
            "Every form is rate limited and validated on the server.",
          ],
        },
        {
          heading: "Contact",
          paragraphs: [
            "Questions, requests, or a complaint about how we have handled your data: care@lindienne.com. If you are not satisfied with our response you may complain to the Data Protection Board of India, or to your local supervisory authority in the EU or UK.",
          ],
        },
      ]}
    />
  );
}
