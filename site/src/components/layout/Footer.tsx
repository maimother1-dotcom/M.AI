import Link from "next/link";
import { categories } from "@/data/categories";
import { Motif, Wordmark } from "@/components/brand/Motif";
import { NewsletterForm } from "@/components/layout/NewsletterForm";

const HELP_LINKS = [
  { href: "/help/shipping", label: "Shipping" },
  { href: "/help/returns", label: "Returns & exchanges" },
  { href: "/help/size-guide", label: "Size guide" },
  { href: "/help/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

const HOUSE_LINKS = [
  { href: "/about", label: "The House" },
  { href: "/editorial", label: "Editorial" },
  { href: "/about#pricing", label: "Why it costs less" },
  { href: "/about#craft", label: "Our makers" },
];

const LEGAL_LINKS = [
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/terms", label: "Terms" },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line bg-ivory-deep">
      {/* Newsletter */}
      <div className="border-b border-line">
        <div className="mx-auto grid max-w-[1400px] gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:px-12 lg:py-20">
          <div>
            <Motif className="h-9 w-9 text-gold" />
            <h2 className="mt-6 text-balance text-3xl sm:text-4xl">Join the house list</h2>
            <p className="mt-4 max-w-md text-pretty text-sm leading-relaxed text-ink-soft">
              Ten percent off your first order, first access to new pieces, and roughly
              one letter a month. Never more than that, and never sold to anyone.
            </p>
          </div>
          <div className="lg:pt-16">
            <NewsletterForm />
          </div>
        </div>
      </div>

      {/* Link columns */}
      <div className="mx-auto max-w-[1400px] px-5 py-14 sm:px-8 lg:px-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <Wordmark className="text-sm" />
            <p className="mt-5 max-w-[28ch] text-xs leading-relaxed text-ink-muted">
              Named for the painted Indian cottons that swept Paris in the 1680s, and were
              banned in 1686 for outselling French silk.
            </p>
          </div>

          <FooterColumn title="Shop">
            {categories.map((c) => (
              <FooterLink key={c.slug} href={`/shop/${c.slug}`}>
                {c.name}
              </FooterLink>
            ))}
            <FooterLink href="/shop">Everything</FooterLink>
          </FooterColumn>

          <FooterColumn title="The House">
            {HOUSE_LINKS.map((l) => (
              <FooterLink key={l.href} href={l.href}>
                {l.label}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn title="Help">
            {HELP_LINKS.map((l) => (
              <FooterLink key={l.href} href={l.href}>
                {l.label}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn title="Reach us">
            <li className="text-xs leading-relaxed text-ink-muted">
              Monday to Saturday
              <br />
              10:00 – 19:00 IST
            </li>
            <li>
              <a href="mailto:care@lindienne.com" className="link-underline text-xs text-ink-soft">
                care@lindienne.com
              </a>
            </li>
            <li className="flex gap-4 pt-2">
              <SocialLink href="https://instagram.com" label="Instagram">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                </svg>
              </SocialLink>
              <SocialLink href="https://pinterest.com" label="Pinterest">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M9.5 20c-.5-1.6 0-3.6.4-5 .3-1.2 1-4 1-4a2.6 2.6 0 0 1-.2-1.2c0-1.2.7-2 1.5-2s1.2.6 1.2 1.3c0 .8-.5 2-.8 3.2-.2 1 .5 1.7 1.5 1.7 1.8 0 3-2.3 3-5 0-2-1.4-3.6-3.9-3.6a4.5 4.5 0 0 0-4.7 4.5c0 .9.3 1.5.7 2 .2.2.2.3.1.6l-.2.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </SocialLink>
            </li>
          </FooterColumn>
        </div>
      </div>

      {/* Base bar */}
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-5 py-6 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-12">
          <p className="text-[11px] text-ink-muted">
            © {new Date().getFullYear()} L&apos;Indienne. All rights reserved.
          </p>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {LEGAL_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-[11px] text-ink-muted hover:text-ink">
                {l.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2.5" aria-label="Accepted payment methods">
            {["VISA", "MC", "AMEX", "UPI", "RUPAY"].map((mark) => (
              <span
                key={mark}
                className="border border-line px-2 py-1 text-[9px] tracking-[0.1em] text-ink-muted"
              >
                {mark}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="eyebrow mb-5">{title}</h3>
      <ul className="space-y-3">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="link-underline text-xs text-ink-soft">
        {children}
      </Link>
    </li>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      // noopener is the security-relevant half: without it the opened page gets
      // a handle on window.opener and can navigate this tab.
      target="_blank"
      rel="noopener noreferrer"
      className="text-ink-muted transition-colors hover:text-ink"
    >
      {children}
    </a>
  );
}
