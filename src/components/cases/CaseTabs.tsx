"use client";
/**
 * The dossier's tab click, felt at once: the tab bar and the body share this. A click makes that tab active and swaps the body for its skeleton
 * right away (not when the server's answer arrives); both go back to the page's own state when the new `active` comes in. The answer to the
 * click only counts for the tab it was clicked from, so a click that never lands cannot leave the page stuck.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import type { TabKey } from "@/components/cases/dossier";
import { TabBodySkeleton } from "@/components/shell/PageSkeleton";

const Ctx = createContext<{ pending: TabKey | null; click: (to: TabKey) => void }>({ pending: null, click: () => {} });

export function TabsProvider({ active, children }: { active: TabKey; children: ReactNode }) {
  const [clicked, setClicked] = useState<{ from: TabKey; to: TabKey } | null>(null);
  const pending = clicked && clicked.from === active && clicked.to !== active ? clicked.to : null;
  return <Ctx.Provider value={{ pending, click: (to) => setClicked({ from: active, to }) }}>{children}</Ctx.Provider>;
}

export const useTabs = () => useContext(Ctx);

/** The tab's content, or its skeleton while another tab was just clicked. */
export function TabBody({ children }: { children: ReactNode }) {
  const { pending } = useTabs();
  return pending ? <TabBodySkeleton /> : children;
}
