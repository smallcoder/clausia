"use client";
/**
 * Thin scrollbars that show only while something scrolls (the styles are in globals.css, «Scrollbars»).
 * One listener for the whole shell: a scroll event does not bubble, but it can be caught on the way down (capture), so the chat thread, the sidebar
 * list, the mobile sheet and the page itself (the event comes from `document`, so the class goes on <html>) all get `.is-scrolling` here
 * without each one carrying its own code. The class goes off about 800ms after the last scroll of that box.
 */
import { useEffect } from "react";

export const SCROLLBAR_HIDE_MS = 800;

export function useScrollbars() {
  useEffect(() => {
    const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
    const onScroll = (e: Event) => {
      const el = e.target instanceof Element ? e.target : document.documentElement;
      el.classList.add("is-scrolling");
      clearTimeout(timers.get(el));
      timers.set(el, setTimeout(() => el.classList.remove("is-scrolling"), SCROLLBAR_HIDE_MS));
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, []);
}
