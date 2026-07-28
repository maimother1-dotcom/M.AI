"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getProductBySku } from "@/data/products";
import { MAX_QUANTITY_PER_LINE } from "@/lib/limits";
import type { CartLine, Product } from "@/lib/types";

/**
 * Cart state.
 *
 * The browser stores `{sku, quantity, size, colorway}` and nothing about money.
 * Prices shown here are read from the bundled catalog for display only — the
 * server re-derives every figure at checkout, so a user editing localStorage
 * changes what they see and nothing about what they are charged.
 */

const STORAGE_KEY = "lindienne.cart.v1";
const WISHLIST_KEY = "lindienne.wishlist.v1";

export interface CartEntry extends CartLine {
  product: Product;
  lineTotalMinor: number;
  lineCompareAtMinor: number;
}

interface CartContextValue {
  lines: CartLine[];
  entries: CartEntry[];
  count: number;
  subtotalMinor: number;
  compareAtSubtotalMinor: number;
  /** True until localStorage has been read. Prevents a hydration mismatch. */
  hydrated: boolean;

  add: (input: CartLine) => void;
  remove: (sku: string, size: string, colorway: string) => void;
  setQuantity: (sku: string, size: string, colorway: string, quantity: number) => void;
  clear: () => void;

  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;

  wishlist: string[];
  toggleWishlist: (slug: string) => void;
  inWishlist: (slug: string) => boolean;

  lastAdded: string | null;
}

const CartContext = createContext<CartContextValue | null>(null);

function sameLine(a: CartLine, sku: string, size: string, colorway: string) {
  return a.sku === sku && a.size === size && a.colorway === colorway;
}

function readStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt or unavailable storage should never take the site down.
    return fallback;
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  /*
   * Load once on mount.
   *
   * `react-hooks/set-state-in-effect` is disabled for this one effect on
   * purpose. The rule exists to stop cascading renders from state that could
   * have been derived during render — but localStorage does not exist during
   * server rendering, so this value provably cannot be read any earlier. Doing
   * it in render would produce server HTML that disagrees with the first client
   * paint, which is the exact hydration bug `hydrated` is here to prevent.
   *
   * It runs once, on mount, and never again.
   */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const stored = readStored<CartLine[]>(STORAGE_KEY, []);
    // Drop anything that no longer exists in the catalog rather than letting a
    // stale SKU reach checkout and fail there.
    setLines(stored.filter((l) => getProductBySku(l.sku)));
    setWishlist(readStored<string[]>(WISHLIST_KEY, []));
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* Storage full or blocked — the cart still works for this session. */
    }
  }, [lines, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
    } catch {
      /* ignore */
    }
  }, [wishlist, hydrated]);

  // Lock the page behind the drawer, and preserve scroll position.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  const add = useCallback((input: CartLine) => {
    const product = getProductBySku(input.sku);
    if (!product) return;

    setLines((current) => {
      const index = current.findIndex((l) =>
        sameLine(l, input.sku, input.size, input.colorway),
      );
      if (index === -1) {
        return [...current, { ...input, quantity: Math.min(input.quantity, MAX_QUANTITY_PER_LINE) }];
      }
      const next = [...current];
      const existing = next[index]!;
      next[index] = {
        ...existing,
        quantity: Math.min(existing.quantity + input.quantity, MAX_QUANTITY_PER_LINE),
      };
      return next;
    });

    setLastAdded(input.sku);
    setIsOpen(true);
  }, []);

  const remove = useCallback((sku: string, size: string, colorway: string) => {
    setLines((current) => current.filter((l) => !sameLine(l, sku, size, colorway)));
  }, []);

  const setQuantity = useCallback(
    (sku: string, size: string, colorway: string, quantity: number) => {
      if (quantity < 1) {
        setLines((current) => current.filter((l) => !sameLine(l, sku, size, colorway)));
        return;
      }
      setLines((current) =>
        current.map((l) =>
          sameLine(l, sku, size, colorway)
            ? { ...l, quantity: Math.min(quantity, MAX_QUANTITY_PER_LINE) }
            : l,
        ),
      );
    },
    [],
  );

  const clear = useCallback(() => setLines([]), []);

  const toggleWishlist = useCallback((slug: string) => {
    setWishlist((current) =>
      current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug],
    );
  }, []);

  const entries = useMemo<CartEntry[]>(() => {
    return lines.flatMap((line) => {
      const product = getProductBySku(line.sku);
      if (!product) return [];
      return [
        {
          ...line,
          product,
          lineTotalMinor: product.priceMinor * line.quantity,
          lineCompareAtMinor: product.compareAtMinor * line.quantity,
        },
      ];
    });
  }, [lines]);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      entries,
      count: entries.reduce((sum, e) => sum + e.quantity, 0),
      subtotalMinor: entries.reduce((sum, e) => sum + e.lineTotalMinor, 0),
      compareAtSubtotalMinor: entries.reduce((sum, e) => sum + e.lineCompareAtMinor, 0),
      hydrated,
      add,
      remove,
      setQuantity,
      clear,
      isOpen,
      openCart: () => setIsOpen(true),
      closeCart: () => setIsOpen(false),
      wishlist,
      toggleWishlist,
      inWishlist: (slug: string) => wishlist.includes(slug),
      lastAdded,
    }),
    [lines, entries, hydrated, isOpen, wishlist, lastAdded, add, remove, setQuantity, clear, toggleWishlist],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside <CartProvider>");
  return context;
}
