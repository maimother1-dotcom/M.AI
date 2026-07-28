"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { categories } from "@/data/categories";
import { getBadgedProducts } from "@/data/products";
import { useCart } from "@/components/cart/CartProvider";
import { Motif, Wordmark } from "@/components/brand/Motif";
import { ProductImage } from "@/components/product/ProductImage";
import { displayPrice } from "@/lib/currency";

/* --- Scroll, as an external store ---------------------------------------- */

const SCROLL_THRESHOLD = 24;

function subscribeToScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

function isScrolled() {
  return window.scrollY > SCROLL_THRESHOLD;
}

const ANNOUNCEMENTS = [
  "Complimentary shipping on orders over ₹5,000",
  "Thirty-day returns, no questions asked",
  "New: the Neel indigo capsule",
];

export function Header() {
  const pathname = usePathname();
  const { count, openCart, wishlist, hydrated } = useCart();

  // Scroll position is an external store, so read it through the primitive
  // built for external stores. This also gives the correct value on a back
  // navigation that restores a scroll offset, which a mount-time setState in an
  // effect would miss for one frame.
  const scrolled = useSyncExternalStore(subscribeToScroll, isScrolled, () => false);

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [announcement, setAnnouncement] = useState(0);

  // The header sits over the hero on the landing page only; everywhere else it
  // is solid from the first pixel.
  const isTransparentPage = pathname === "/";
  const solid = scrolled || !isTransparentPage || openMenu !== null || mobileOpen;

  useEffect(() => {
    const timer = setInterval(
      () => setAnnouncement((i) => (i + 1) % ANNOUNCEMENTS.length),
      5000,
    );
    return () => clearInterval(timer);
  }, []);

  // Any navigation closes the mega-menu and the mobile drawer. This is
  // synchronising UI to an external event (the router), not deriving state that
  // render could have computed, so the rule is disabled knowingly.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setOpenMenu(null);
    setMobileOpen(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenMenu(null);
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* Announcement bar */}
      <div className="relative z-50 bg-ink text-ivory">
        <div className="mx-auto flex h-9 max-w-[1600px] items-center justify-center overflow-hidden px-5">
          <p key={announcement} className="animate-fade-up text-[10px] uppercase tracking-[0.22em]">
            {ANNOUNCEMENTS[announcement]}
          </p>
        </div>
      </div>

      <header
        className={`sticky top-0 z-40 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          solid
            ? "border-b border-line bg-ivory/95 backdrop-blur-md"
            : "border-b border-transparent bg-transparent"
        }`}
        onMouseLeave={() => setOpenMenu(null)}
      >
        <div className="mx-auto flex h-[var(--nav-height)] max-w-[1600px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-12">
          {/* Left — desktop nav */}
          <nav className="hidden flex-1 items-center gap-7 lg:flex" aria-label="Categories">
            {categories.slice(0, 4).map((category) => (
              <button
                key={category.slug}
                type="button"
                onMouseEnter={() => setOpenMenu(category.slug)}
                onFocus={() => setOpenMenu(category.slug)}
                onClick={() => setOpenMenu(openMenu === category.slug ? null : category.slug)}
                aria-expanded={openMenu === category.slug}
                className={`relative py-2 text-[11px] uppercase tracking-[0.18em] transition-colors ${
                  solid ? "text-ink" : "text-ink"
                } hover:text-madder`}
              >
                {category.name}
                <span
                  className={`absolute -bottom-0.5 left-0 h-px w-full origin-left bg-madder transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    openMenu === category.slug ? "scale-x-100" : "scale-x-0"
                  }`}
                />
              </button>
            ))}
          </nav>

          {/* Mobile menu toggle */}
          <button
            type="button"
            className="lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            <span className="flex h-6 w-6 flex-col justify-center gap-[5px]">
              <span
                className={`block h-px w-full bg-ink transition-transform duration-300 ${
                  mobileOpen ? "translate-y-[6px] rotate-45" : ""
                }`}
              />
              <span
                className={`block h-px w-full bg-ink transition-opacity duration-300 ${
                  mobileOpen ? "opacity-0" : ""
                }`}
              />
              <span
                className={`block h-px w-full bg-ink transition-transform duration-300 ${
                  mobileOpen ? "-translate-y-[6px] -rotate-45" : ""
                }`}
              />
            </span>
          </button>

          {/* Centre — wordmark */}
          <Link
            href="/"
            className="shrink-0 text-ink transition-opacity hover:opacity-70"
            aria-label="L'Indienne, home"
          >
            <Wordmark className="text-[13px] sm:text-base" />
          </Link>

          {/* Right — utilities */}
          <div className="flex flex-1 items-center justify-end gap-4 sm:gap-5">
            <nav className="hidden items-center gap-7 lg:flex" aria-label="More categories">
              {categories.slice(4).map((category) => (
                <button
                  key={category.slug}
                  type="button"
                  onMouseEnter={() => setOpenMenu(category.slug)}
                  onFocus={() => setOpenMenu(category.slug)}
                  onClick={() => setOpenMenu(openMenu === category.slug ? null : category.slug)}
                  aria-expanded={openMenu === category.slug}
                  className="relative py-2 text-[11px] uppercase tracking-[0.18em] text-ink transition-colors hover:text-madder"
                >
                  {category.name}
                  <span
                    className={`absolute -bottom-0.5 left-0 h-px w-full origin-left bg-madder transition-transform duration-500 ${
                      openMenu === category.slug ? "scale-x-100" : "scale-x-0"
                    }`}
                  />
                </button>
              ))}
            </nav>

            <Link href="/search" aria-label="Search" className="text-ink transition-colors hover:text-madder">
              <SearchIcon />
            </Link>

            <Link
              href="/wishlist"
              aria-label={`Wishlist, ${wishlist.length} items`}
              className="relative hidden text-ink transition-colors hover:text-madder sm:block"
            >
              <HeartIcon />
              {hydrated && wishlist.length > 0 && (
                <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-madder px-1 text-[9px] leading-none text-ivory tabular">
                  {wishlist.length}
                </span>
              )}
            </Link>

            <button
              type="button"
              onClick={openCart}
              aria-label={`Shopping bag, ${count} items`}
              className="relative text-ink transition-colors hover:text-madder"
            >
              <BagIcon />
              {hydrated && count > 0 && (
                <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-madder px-1 text-[9px] leading-none text-ivory tabular">
                  {count}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mega-menu */}
        {categories.map((category) => {
          const featured = getBadgedProducts("bestseller", 20).filter(
            (p) => p.category === category.slug,
          );
          const picks = (featured.length > 0 ? featured : []).slice(0, 2);
          return (
            <div
              key={category.slug}
              className={`absolute left-0 right-0 top-full hidden overflow-hidden border-b border-line bg-ivory transition-[max-height,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] lg:block ${
                openMenu === category.slug
                  ? "pointer-events-auto max-h-[520px] opacity-100"
                  : "pointer-events-none max-h-0 opacity-0"
              }`}
            >
              <div className="mx-auto grid max-w-[1600px] grid-cols-12 gap-10 px-12 py-12">
                <div className="col-span-3">
                  <p className="eyebrow mb-5">{category.name}</p>
                  <ul className="space-y-3">
                    <li>
                      <Link
                        href={`/shop/${category.slug}`}
                        className="link-underline font-display text-xl text-ink"
                      >
                        All {category.name}
                      </Link>
                    </li>
                    {category.subcategories.map((sub) => (
                      <li key={sub.slug}>
                        <Link
                          href={`/shop/${category.slug}?sub=${sub.slug}`}
                          className="link-underline text-sm text-ink-soft"
                        >
                          {sub.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="col-span-3 border-l border-line pl-10">
                  <p className="eyebrow mb-5">The house</p>
                  <p className="max-w-xs font-display text-2xl leading-snug text-ink">
                    {category.tagline}
                  </p>
                  <Motif className="mt-6 h-8 w-8 text-gold" />
                  <Link
                    href={`/shop/${category.slug}`}
                    className="mt-6 inline-block text-[11px] uppercase tracking-[0.18em] text-madder"
                  >
                    Shop the category →
                  </Link>
                </div>

                <div className="col-span-6 grid grid-cols-2 gap-6">
                  {picks.map((product) => (
                    <Link key={product.id} href={`/product/${product.slug}`} className="group flex gap-4">
                      <div className="relative aspect-[3/4] w-24 shrink-0 overflow-hidden bg-ivory-deep">
                        <ProductImage
                          id={product.id}
                          name={product.name}
                          category={product.category}
                          subcategory={product.subcategory}
                          image={product.image}
                          sizes="96px"
                        />
                      </div>
                      <div className="min-w-0 pt-1">
                        <p className="eyebrow mb-2">Bestseller</p>
                        <p className="font-display text-lg leading-tight text-ink transition-colors group-hover:text-madder">
                          {product.name}
                        </p>
                        <p className="mt-2 text-sm text-ink-soft tabular">
                          {displayPrice(product.priceMinor)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </header>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${mobileOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!mobileOpen}
      >
        <div
          className={`absolute inset-0 bg-ink/40 transition-opacity duration-500 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMobileOpen(false)}
        />
        <nav
          className={`absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col overflow-y-auto bg-ivory transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          aria-label="Mobile navigation"
        >
          <div className="flex items-center justify-between border-b border-line px-6 py-5">
            <Wordmark className="text-sm" />
            <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <CloseIcon />
            </button>
          </div>

          <div className="flex-1 px-6 py-6">
            {categories.map((category) => (
              <details key={category.slug} className="border-b border-line py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between font-display text-2xl text-ink">
                  {category.name}
                  <PlusIcon />
                </summary>
                <ul className="mt-4 space-y-3 pl-1">
                  <li>
                    <Link href={`/shop/${category.slug}`} className="text-sm text-madder">
                      All {category.name}
                    </Link>
                  </li>
                  {category.subcategories.map((sub) => (
                    <li key={sub.slug}>
                      <Link
                        href={`/shop/${category.slug}?sub=${sub.slug}`}
                        className="text-sm text-ink-soft"
                      >
                        {sub.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ))}

            <div className="mt-8 space-y-4">
              {[
                { href: "/editorial", label: "Editorial" },
                { href: "/about", label: "The House" },
                { href: "/wishlist", label: "Wishlist" },
                { href: "/help/faq", label: "Help" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block text-[11px] uppercase tracking-[0.18em] text-ink-soft"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="border-t border-line px-6 py-6">
            <Motif className="h-6 w-6 text-gold" />
            <p className="mt-3 text-xs leading-relaxed text-ink-muted">
              Paris fell for India first.
            </p>
          </div>
        </nav>
      </div>
    </>
  );
}

/* --- Icons. Inline rather than a library: six icons is not worth 40kb. --- */

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4.2-4.2" strokeLinecap="round" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M12 20.5S3.5 15 3.5 8.9A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.5 1.9c0 6.1-8.5 11.6-8.5 11.6Z" strokeLinejoin="round" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M5 7h14l1 14H4L5 7Z" strokeLinejoin="round" />
      <path d="M9 9V6a3 3 0 0 1 6 0v3" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-muted" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}
