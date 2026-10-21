"use client";
/**
 * Mobile tabs on the case page (docs/design/*MobileCase.dc.html): Facts / Docs / Parties as a segmented control.
 * Below `lg` only the active segment is shown; at `lg` and up every segment is visible in its desktop column, so
 * the content stays server-rendered and the desktop layout is untouched. A `#item-<id>` link (the review banner,
 * a hero stat) switches to the segment that holds the item, so its sheet can open.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type SegKey = "facts" | "docs" | "parties";
const Ctx = createContext<{ on: SegKey; set: (k: SegKey) => void }>({ on: "facts", set: () => {} });

export function TabScope({ children }: { children: ReactNode }) {
  const [on, set] = useState<SegKey>("facts");
  useEffect(() => {
    const sync = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      if (id === "facts") return set("facts");
      const seg = document.getElementById(id)?.closest<HTMLElement>("[data-seg]")?.dataset.seg as SegKey | undefined;
      if (seg) set(seg);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return <Ctx.Provider value={{ on, set }}>{children}</Ctx.Provider>;
}

export function SegBar({ items, className = "" }: { items: { key: SegKey; label: string; count: number }[]; className?: string }) {
  const { on, set } = useContext(Ctx);
  return (
    <div role="tablist" aria-label="أقسام القضية" className={`flex gap-0.5 rounded-[22px] border border-border-2 bg-card p-1 shadow-card ${className}`}>
      {items.map((t) => {
        const active = on === t.key;
        return (
          <button key={t.key} type="button" role="tab" aria-selected={active} aria-controls={`seg-${t.key}`} onClick={() => set(t.key)}
            className={`h-11 flex-1 rounded-[18px] text-[13.5px] transition ${active ? "bg-selected font-semibold text-on-selected shadow-mark" : "text-text-3 hover:text-text"}`}>
            {t.label} <span className="font-num opacity-70">{t.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/** One segment's content: hidden below `lg` unless active. */
export function Seg({ k, className = "", children }: { k: SegKey; className?: string; children: ReactNode }) {
  const { on } = useContext(Ctx);
  return (
    <div id={`seg-${k}`} data-seg={k} role="tabpanel" className={`${on === k ? "" : "max-lg:hidden"} ${className}`}>
      {children}
    </div>
  );
}
