"use client";
/** The paper panel's shared state: which chip is open (see CiteProvider). Kept apart so the panel and the chips can import it without a cycle. */
import { createContext, useContext, useSyncExternalStore } from "react";

/** What a chip knows about the sentence it points at. */
export interface CiteSource {
  /** unique per chip (the row it sits on): tells which chip is the open one */
  id: string;
  documentId: string;
  page: number;
  /** the stored span in the page's original text; null for rows made before spans were kept */
  start: number | null;
  end: number | null;
  quote: string | null;
  /** «الصحيفة · ص 2» */
  label: string;
  /** «واقعة · 1/9/2022 · تحرير عقد إيجار الشقة»: the item taken from the sentence (the panel's footer) */
  about: string | null;
}

export interface Cite {
  active: CiteSource | null;
  open: (src: CiteSource) => void;
  close: () => void;
}

/** An item's sheet (a native modal <dialog>) provides its close function here: a chip inside it closes the sheet before opening the panel. */
export const SheetCloseCtx = createContext<() => void>(() => {});

export const CiteCtx =createContext<Cite>({ active: null, open: () => {}, close: () => {} });
export const useCite = () => useContext(CiteCtx);

const DESKTOP = "(min-width: 1280px)";
const subscribe = (cb: () => void) => { const mq = window.matchMedia(DESKTOP); mq.addEventListener("change", cb); return () => mq.removeEventListener("change", cb); };
/** xl and up (the split layout: chat + page side by side); false on the server and during hydration */
export const useDesktop = () => useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP).matches, () => false);
