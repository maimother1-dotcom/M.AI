import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/layout/ContactForm";
import { Motif, MotifDivider } from "@/components/brand/Motif";
import { Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Contact",
  description: "Reach the L'Indienne team. We reply within one working day, Monday to Saturday.",
};

export default function ContactPage() {
  return (
    <>
      <header className="border-b border-line py-16 lg:py-24">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow mb-4">We answer everything</p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl">Contact</h1>
            <MotifDivider className="mx-auto my-8 max-w-[220px]" />
            <p className="text-pretty text-sm leading-relaxed text-ink-soft">
              A real person reads every message and replies within one working day. If you are
              writing about an order, quoting the order number gets you a faster answer.
            </p>
          </div>
        </Container>
      </header>

      <Container className="py-16 lg:py-24">
        <div className="grid gap-14 lg:grid-cols-[1fr_320px] lg:gap-20">
          <ContactForm />

          <aside className="space-y-10">
            <div>
              <Motif className="h-6 w-6 text-gold" />
              <h2 className="mt-4 font-display text-xl">Email</h2>
              <a href="mailto:care@lindienne.com" className="link-underline mt-2 block text-sm text-ink-soft">
                care@lindienne.com
              </a>
            </div>

            <div>
              <h2 className="font-display text-xl">Hours</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Monday to Saturday
                <br />
                10:00 – 19:00 IST
              </p>
            </div>

            <div>
              <h2 className="font-display text-xl">Before you write</h2>
              <ul className="mt-3 space-y-2.5 text-sm">
                {[
                  { href: "/help/shipping", label: "Shipping times and costs" },
                  { href: "/help/returns", label: "How returns work" },
                  { href: "/help/size-guide", label: "Size guide" },
                  { href: "/help/faq", label: "Frequently asked" },
                ].map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="link-underline text-ink-soft">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </Container>
    </>
  );
}
