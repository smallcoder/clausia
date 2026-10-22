"use client";
/**
 * «Source to the sentence» (docs/design/next/Cite{Light,Dark}.dc.html): one paper panel for the whole app, opened by any
 * paper source chip (SourceChip). The provider holds which chip is open; CiteMain lays the page out around the panel.
 *
 * Desktop (≥1280): the panel floats over the page column (the chat panel stays in view); below 1280: a bottom sheet.
 * The chips live in the chat panel and in the page, so the panel is rendered once, at the root of the split shell.
 * Esc closes it; focus goes into the panel on open and back to the chip on close.
 */
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CiteCtx, type CiteSource } from "./context";

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

  const value = useMemo(() => ({ active, open, close }), [active, open, close]);
  return <CiteCtx.Provider value={value}>{children}</CiteCtx.Provider>;
}
