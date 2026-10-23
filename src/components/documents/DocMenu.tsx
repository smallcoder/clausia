"use client";
/**
 * The «…» menu of a row of the documents table: everything the old per-paper panel did.
 *   نوع المستند (the inline select) · فتح الملف · تنزيل · شوف النص المستخرج (the paper panel at page 1) · راجع المقترحات (the chat card)
 * The menu is drawn in a portal at the page level with fixed positioning: the table scrolls sideways, and a menu inside it
 * would be clipped. Esc, a tap outside, a scroll or a resize close it; Esc returns focus to the button.
 */
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCite, type CiteSource } from "@/components/cite/context";
import { DocTypeSelect } from "@/components/documents/DocTypeSelect";
import { DateText } from "@/components/ui";

const ITEM = "flex min-h-11 w-full items-center px-4 text-base text-text hover:bg-card-2 disabled:text-text-4 disabled:hover:bg-transparent";

export function DocMenu({ documentId, caseId, name, fileName, docType, meta, hasText, hasPending }: {
  documentId: string; caseId: string; name: string; fileName: string; docType: string; meta: string; hasText: boolean; hasPending: boolean;
}) {
  const { open: openPaper } = useCite();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // the paper panel's «back to the chip» finds this button by the cite id
  const citeId = `doc-text:${documentId}`;

  const close = useCallback((refocus = false) => { setOpen(false); if (refocus) btn.current?.focus(); }, []);

  // under the button, its end edges aligned; flipped above when there is no room; never outside the screen
  useLayoutEffect(() => {
    if (!open || !btn.current || !box.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = box.current.offsetWidth, h = box.current.offsetHeight;
    const left = Math.min(Math.max(r.right - w, 8), window.innerWidth - w - 8);
    const below = r.bottom + 6;
    setPos({ left, top: below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(true); } };
    const onDown = (e: PointerEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !btn.current?.contains(t)) close(); };
    const onMove = () => close();
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, close]);

  const cite: CiteSource = { id: citeId, documentId, page: 1, start: null, end: null, quote: null, label: `${name} · النص المستخرج`, about: null };

  return (
    <>
      <button ref={btn} type="button" data-cite-id={citeId} aria-label={`خيارات ${name}`} aria-haspopup="menu" aria-expanded={open}
        onClick={() => { setPos(null); setOpen((o) => !o); }}
        className="tap -me-1.5 ms-auto inline-flex size-9 shrink-0 items-center justify-center rounded-full text-text-3 transition hover:bg-card-2 hover:text-text">
        <MoreHorizontal aria-hidden size={18} strokeWidth={2} />
      </button>
      {open ? createPortal(
        <div ref={box} role="menu" aria-label={`خيارات ${name}`} style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
          className="fixed z-40 w-72 max-w-[calc(100vw-1rem)] overflow-hidden rounded-md border border-border-2 bg-card py-1 shadow-pop" /* ds-allow: a share of the screen width (vw), not a length: the menu never passes the screen edge */>
          <div className="border-b border-border-2 px-4 pb-2.5 pt-2">
            <p className="truncate text-base font-semibold text-text" dir="auto">{fileName}</p>
            {meta ? <p className="mt-0.5 text-xs text-text-3"><DateText value={meta} /></p> : null}
          </div>
          <div className="flex min-h-12 items-center justify-between gap-3 px-4 py-1">
            <span className="text-base text-text">النوع</span>
            <DocTypeSelect documentId={documentId} value={docType} />
          </div>
          <a role="menuitem" href={`/api/documents/${documentId}`} target="_blank" rel="noopener" onClick={() => close()} className={ITEM}>فتح الملف</a>
          <a role="menuitem" href={`/api/documents/${documentId}?download=1`} onClick={() => close()} className={ITEM}>تنزيل</a>
          <button type="button" role="menuitem" disabled={!hasText} title={hasText ? undefined : "الورقة لسه ما اتقرتش"}
            onClick={() => { close(); openPaper(cite); }} className={`${ITEM} text-start`}>شوف النص المستخرج</button>
          {hasPending ? <Link role="menuitem" href={`/cases/${caseId}?tab=chat`} onClick={() => close()} className={`${ITEM} font-semibold text-gold`}>راجع المقترحات في المحادثة ←</Link> : null}
        </div>, document.body) : null}
    </>
  );
}
