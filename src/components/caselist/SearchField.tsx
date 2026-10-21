"use client";
/** Cases search (GET /cases?q=…). Keeps the active filters as hidden inputs; ⌘K / Ctrl+K focuses it. */
import { useEffect, useRef } from "react";

export function SearchField({ q, keep, children }: { q?: string; keep: Record<string, string | undefined>; children?: React.ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.current?.focus(); input.current?.select(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form action="/cases" role="search"
      className="relative mt-3 flex h-12 items-center gap-2.5 rounded-2xl border border-border bg-field px-3.5 shadow-pop sm:mt-4 sm:h-[54px] sm:gap-3 sm:rounded-[18px] sm:px-4">
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <span aria-hidden className="mark font-num inline-flex size-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-black sm:size-[26px] sm:text-xs">C</span>
      <input ref={input} name="q" type="search" defaultValue={q ?? ""} aria-label="ابحث في القضايا"
        placeholder="ابحث بالاسم أو رقم الدعوى أو المحكمة"
        className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-text placeholder:text-text-4 focus:outline-none sm:text-[15px]" />
      {children}
      <kbd className="font-num hidden rounded-md border border-border px-1.5 py-0.5 text-[11px] text-text-3 sm:inline">⌘K</kbd>
    </form>
  );
}
