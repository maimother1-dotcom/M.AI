import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import "@/styles/globals.css";

import { CartProvider } from "@/components/cart/CartProvider";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

/**
 * next/font downloads these at build time and serves them from our own origin.
 * That removes a third-party request from the critical path, keeps the CSP free
 * of a Google Fonts exception, and — because the font files are known at build —
 * lets Next emit `size-adjust` fallbacks so nothing reflows when they land.
 */
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const jost = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-jost",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lindienne.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "L'INDIENNE — Luxury, at what it actually costs to make",
    template: "%s · L'INDIENNE",
  },
  description:
    "Silk, leather, demi-fine jewellery and clean beauty from the ateliers that supply the great houses — without the markup. Paris fell for India first.",
  keywords: [
    "luxury womenswear",
    "affordable luxury",
    "silk dresses",
    "leather handbags",
    "demi-fine jewellery",
    "clean beauty",
  ],
  authors: [{ name: "L'Indienne" }],
  openGraph: {
    type: "website",
    siteName: "L'INDIENNE",
    title: "L'INDIENNE — Luxury, at what it actually costs to make",
    description:
      "The same ateliers. The same mills. Without four seasons of markup in between.",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "L'INDIENNE",
    description: "Luxury, at what it actually costs to make.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#F8F5EF",
  width: "device-width",
  initialScale: 1,
  // Never lock zoom. Pinch-to-zoom is an accessibility feature, not a bug.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cormorant.variable} ${jost.variable}`}>
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-ink focus:px-5 focus:py-3 focus:text-xs focus:uppercase focus:tracking-widest focus:text-ivory"
        >
          Skip to content
        </a>

        <CartProvider>
          <Header />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
          <CartDrawer />
        </CartProvider>
      </body>
    </html>
  );
}
