"use client";
/**
 * The case page's «…» round button (owner decision 2026-10-21): a small glass popover with the case's links —
 * case details, hearings, the case chat and the JSON download. Mobile: the floating «…» at the top end; desktop: next
 * to the back button. `align` puts the popover under the button's own side.
 */
import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function CaseMenu({ caseId, chatHref, align, className }: { caseId: string; chatHref: string; align: "start" | "end"; className: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", esc); };
  }, [open]);
  const close = () => setOpen(false);
  const item = "flex min-h-11 items-center rounded-md px-3.5 text-base font-medium text-text transition-colors hover:bg-card-2/70";
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-label="المزيد" title="المزيد" aria-haspopup="menu" aria-expanded={open}
        className={`tap glass glass-icon inline-flex shrink-0 items-center justify-center rounded-full ${className}`}>
        <Ellipsis size={20} strokeWidth={2} aria-hidden />
      </button>
      {open ? (
        <div role="menu" aria-label="القضية" className={`glass absolute top-[calc(100%+8px)] z-50 w-56 rounded-lg p-1.5 ${align === "end" ? "end-0" : "start-0"}`}>
          <Link role="menuitem" href={`/cases/${caseId}?tab=details`} onClick={close} className={item}>بيانات الدعوى</Link>
          <Link role="menuitem" href={`/cases/${caseId}?tab=hearings`} onClick={close} className={item}>الجلسات</Link>
          <Link role="menuitem" href={chatHref} onClick={close} className={item}>محادثة القضية</Link>
          <a role="menuitem" href={`/api/cases/${caseId}/case-file?download`} onClick={close} className={item}>تنزيل ملف القضية (JSON)</a>
        </div>
      ) : null}
    </div>
  );
}
