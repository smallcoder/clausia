"use client";
/**
 * The dossier's tab click, felt at once: the tab bar and the body share this. A click makes that tab active and swaps the body for its skeleton
 * right away (not when the server's answer arrives); both go back to the page's own state as soon as `active` changes (the tab landed, or
 * Back / Forward), so what is shown always follows the address.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import type { TabKey } from "@/components/cases/dossier";
import { TabBodySkeleton } from "@/components/shell/PageSkeleton";

const Ctx = createContext<{ pending: TabKey | null; click: (to: TabKey) => void }>({ pending: null, click: () => {} });

export function TabsProvider({ active, children }: { active: TabKey; children: ReactNode }) {
  const [clicked, setClicked] = useState<TabKey | null>(null);
  const [seen, setSeen] = useState(active);
  if (seen !== active) { setSeen(active); setClicked(null); }
  const pending = clicked && clicked !== active ? clicked : null;
  return <Ctx.Provider value={{ pending, click: setClicked }}>{children}</Ctx.Provider>;
}

export const useTabs = () => useContext(Ctx);

/** The tab's content, or its skeleton while another tab was just clicked. */
export function TabBody({ children }: { children: ReactNode }) {
  const { pending } = useTabs();
  return pending ? <TabBodySkeleton /> : children;
}
