import type { Metadata } from "next";
import { ArticlePage } from "@/components/layout/ArticlePage";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "How L'Indienne can charge less, what the comparison prices mean, and why we do not sell gold or diamonds.",
};

export default function FaqPage() {
  return (
    <ArticlePage
      eyebrow="Help"
      title="Frequently asked"
      intro="The questions people actually ask, including the uncomfortable ones."
      blocks={[
        {
          heading: "How can you charge so much less?",
          paragraphs: [
            "Because there are four fewer businesses between the workshop and you. A piece that passes through a manufacturer, a brand, a distributor and a boutique carries four margins and pays for a flagship store, a wholesale team and a campaign. Ours carries one margin and pays for a warehouse.",
            "It is not because the work is worse. Several of our workshops hold export contracts with European houses, which is how we know what a comparable piece retails for.",
          ],
        },
        {
          heading: "Are these copies of designer pieces?",
          paragraphs: [
            "No, and we would tell you if they were. Nothing here is designed against another brand's product, nothing is described as inspired by or a dupe for a named house, and no logo, monogram or trademark belonging to anyone else appears anywhere on our goods.",
            "What we do is buy from the same kinds of workshops and sell direct. That is a distribution argument, not a design one.",
          ],
        },
        {
          heading: "What does the crossed-out price mean?",
          paragraphs: [
            "It is the typical retail in a boutique for a comparable piece of the same construction, material and finish. It is not a specific competitor's price tag, and it is not a price we ever sold the item at ourselves.",
            "We are aware that struck-through pricing is abused across the industry. If you think one of ours is a stretch, write to us and we will show you the comparable and correct the figure if you are right.",
          ],
        },
        {
          heading: "Why is there no gold or diamond jewellery?",
          paragraphs: [
            "Because we cannot do it honestly at these prices. Solid gold and certified stones are commodity-priced, so there is no distribution efficiency to pass on — the metal costs what it costs. Selling them would mean either losing money or quietly cutting quality elsewhere.",
            "Everything in the jewellery category is demi-fine and described as exactly what it is: 18k vermeil at 3 microns over recycled sterling, freshwater pearl, hand-set cubic zirconia, fired enamel. We use the words cubic zirconia rather than a softer euphemism.",
          ],
        },
        {
          heading: "Are the reviews on this site real?",
          paragraphs: [
            "The reviews currently shown are written sample copy from launch, not collected customer feedback, and we would rather say so here than let you assume otherwise. They will be replaced with verified purchase reviews as orders accumulate, and verified ones will be labelled as such.",
          ],
        },
        {
          heading: "How do you handle my card details?",
          paragraphs: [
            "We never see them. Card fields are served by our payment processor inside their own frame, and the details go from your browser directly to them. Our servers receive a confirmation that a payment succeeded and nothing else.",
            "Every amount you are charged is calculated on our server from our own catalog, so nothing sent from your browser can change a price.",
          ],
        },
        {
          heading: "Do you restock?",
          paragraphs: [
            "Usually, but not always, and not quickly. We make in runs of under a hundred with workshops that have their own schedules, so a restock is typically six to ten weeks. Nothing on this site uses a fake countdown or an invented stock number to hurry you.",
          ],
        },
        {
          heading: "Do you ship internationally?",
          paragraphs: [
            "Yes, worldwide by tracked courier, with rates calculated from real weight and destination at checkout. Duties and import taxes are payable by you on delivery and are not included in what you pay us.",
          ],
        },
      ]}
    />
  );
}
