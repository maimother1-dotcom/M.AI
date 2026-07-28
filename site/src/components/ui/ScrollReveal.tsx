"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

/**
 * Reveal-on-scroll.
 *
 * Uses IntersectionObserver rather than scroll listeners, so it costs nothing
 * on the main thread. The element is visible by default in CSS if JS never
 * runs — a reveal animation must never be the reason content is missing.
 */
export function ScrollReveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
  threshold = 0.12,
}: {
  children: ReactNode;
  delay?: number;
  as?: ElementType;
  className?: string;
  threshold?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Reduced motion is handled entirely in CSS — the `prefers-reduced-motion`
    // block in globals.css forces `.reveal` to full opacity regardless of the
    // data attribute below. Duplicating that check here would only add a second
    // place for the two to disagree.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <Tag
      ref={ref}
      className={`reveal ${className}`}
      data-visible={visible ? "true" : "false"}
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}
