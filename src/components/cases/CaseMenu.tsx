"use client";
/**
 * The case page's «…» round button: a small glass popover. It holds only the JSON download now: the case's data, hearings and
 * documents each have their tab (one home each), so the menu has no links to pages. Mobile: the floating «…» at the top end;
 * desktop: next to the status chip. `align` puts the popover under the button's own side.
 */
import { Ellipsis } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function CaseMenu({ caseId, align, className }: { caseId: string; align: "start" | "end"; className: string }) {
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
        <div role="menu" aria-label="القضية" className={`glass absolute top-[calc(100%+8px)] z-50 w-56 rounded-lg p-1.5 ${align === "end" ? "end-0" : "start-0"}`} /* ds-allow: 8px under the button needs calc() */>
          <a role="menuitem" href={`/api/cases/${caseId}/case-file?download`} onClick={close} className={item}>تنزيل ملف القضية (JSON)</a>
        </div>
      ) : null}
    </div>
  );
}
