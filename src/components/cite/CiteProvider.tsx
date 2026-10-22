"use client";
/**
 * «Source to the sentence» (docs/design/next/Cite{Light,Dark}.dc.html): one paper panel for the whole app, opened by any
 * paper source chip (SourceChip). The provider holds which chip is open; CiteMain lays the page out around the panel.
 *
 * Desktop (≥1024): on a chat thread the page becomes the mockup's two columns — the thread on the right, the paper on
 * the left (RTL) — and the top bar takes the same wide box; on every other page the panel floats over the left side
 * (those pages are not built for half a screen). Mobile: a bottom sheet.
 * Esc closes it; focus goes into the panel on open and back to the chip on close.
 */
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { CitePanel } from "./CitePanel";
import { CiteCtx, useCite, type CiteSource } from "./context";

/** the thread pages are the only narrow pages that hold paper chips: they get the two-column layout */
const SPLIT_PATH = /^\/chat\/[^/]+/;

export function CiteProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [active, setActive] = useState<CiteSource | null>(null);
  const activeId = useRef<string | null>(null);
  useEffect(() => { activeId.current = active?.id ?? null; }, [active]);
  // another page closes the panel (its chip is gone)
  const [seen, setSeen] = useState(pathname);
  if (pathname !== seen) { setSeen(pathname); setActive(null); }

  const open = useCallback((src: CiteSource) => setActive(src), []);
  const close = useCallback(() => {
    const id = activeId.current;
    setActive(null);
    // back to the chip (found again by its id: the card may have re-rendered while the panel was open)
    if (id) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-cite-id="${CSS.escape(id)}"]`)?.focus());
  }, []);

  // Esc closes it. Capture phase on the document, so it runs before (and stops) the window-level Esc of a sheet below:
  // one Esc closes only the topmost thing.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.stopPropagation();
      close();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [active, close]);

  const split = !!active && SPLIT_PATH.test(pathname);
  const value = useMemo(() => ({ active, split, open, close }), [active, split, open, close]);
  return <CiteCtx.Provider value={value}>{children}</CiteCtx.Provider>;
}

/**
 * The page body: `<main>` and the panel. The wrapper and `<main>` keep their place in the tree whether the panel is
 * open or not, so opening it never remounts the page (a half-written message, a scroll position).
 * Split: the mockup's 1600px box (two equal columns, 24px apart) under the top bar. `<main>` reaches 16px into the
 * gutter so the thread keeps the mockup's 8px column padding inside its own 24px one.
 */
export function CiteMain({ children }: { children: ReactNode }) {
  const { split } = useCite();
  return (
    <div className={split ? "contents lg:mx-auto lg:grid lg:w-full lg:max-w-split lg:flex-1 lg:grid-cols-2 lg:items-start lg:gap-6 lg:px-10 lg:pb-6 lg:pt-3" : "contents"}>
      <main className={cx("flex w-full flex-1 flex-col", split && "lg:-mx-4 lg:w-auto lg:min-w-0")}>{children}</main>
      <CitePanel />
    </div>
  );
}
