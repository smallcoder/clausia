"use client";
/**
 * A case item you tap (fact, request, argument, party). Rows show no edit links; tapping opens the item's
 * actions — a bottom sheet on mobile, a side panel on desktop (native <dialog>: focus trap, Escape, backdrop).
 * `#item-<id>` in the URL opens it too (the hero's «محتاجة مراجعة» tile links there).
 */
import { X } from "lucide-react";
import { useActionState, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { editItemText, reviewItem } from "@/app/(app)/cases/actions";
import { SheetCloseCtx } from "@/components/cite/context";

/** `tight`: no 44px minimum, the row is exactly as tall as the mockup draws it (fact timeline, لنا / ضدنا lines). */
export function TapItem({ id, title, row, children, className = "", tight = false }: { id: string; title: string; row: ReactNode; children: ReactNode; className?: string; tight?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const hash = `#item-${id}`;
  const close = useCallback(() => ref.current?.close(), []);

  useEffect(() => {
    const check = () => { if (window.location.hash === hash && !ref.current?.open) ref.current?.showModal(); };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [hash]);

  return (
    <div id={`item-${id}`} className="scroll-mt-24">
      {/* the whole row opens the sheet through a button stretched over it (named by the row's own text), so a row can
          hold buttons of its own — the source chip — without nesting one button in another; the chip sits above it (z-10) */}
      <div className={`relative ${tight ? "" : "min-h-11"} w-full text-start transition-colors hover:bg-card-2/60 has-focus-visible:bg-card-2/60 ${className}`}>
        <div id={`row-${id}`}>{row}</div>
        <button type="button" onClick={() => ref.current?.showModal()} aria-haspopup="dialog" aria-labelledby={`row-${id}`}
          className="absolute inset-0 size-full rounded-[inherit]" /* ds-allow: the stretched button takes its row's radius */ />
      </div>
      <dialog ref={ref} aria-label={title}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        onClose={() => { if (window.location.hash === hash) history.replaceState(null, "", window.location.pathname + window.location.search); }}
        className="sheet-enter fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-xl border border-border bg-card p-0 text-text shadow-pop backdrop:bg-backdrop sm:[animation:fade-in_180ms_ease-out] sm:inset-y-0 sm:start-auto sm:end-0 sm:h-dvh sm:max-h-none sm:w-105 sm:rounded-none sm:rounded-s-xl" /* ds-allow: dvh: the sheet is at most 85% of the visible screen */>
        <SheetCloseCtx.Provider value={close}>
          <div className="px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-4" /* ds-allow: safe-area inset needs calc() */>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border sm:hidden" aria-hidden />
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-text">{title}</h2>
              <button type="button" onClick={close} aria-label="إغلاق"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card-2 text-text-3 hover:text-text">
                <X size={18} strokeWidth={2} />
              </button>
            </div>
            <div className="mt-4 space-y-4">{children}</div>
          </div>
        </SheetCloseCtx.Provider>
      </dialog>
    </div>
  );
}

function Hidden({ v }: { v: Record<string, string> }) {
  return <>{Object.entries(v).map(([k, x]) => <input key={k} type="hidden" name={k} value={x} />)}</>;
}

/** Confirm / reject a suggested item; closes the sheet on tap. */
export function SheetReview({ table, id, caseId }: { table: string; id: string; caseId: string }) {
  const close = useContext(SheetCloseCtx);
  const base = { table, id, case_id: caseId };
  return (
    <div className="flex gap-2">
      <form action={reviewItem} onSubmit={close} className="flex-1">
        <Hidden v={{ ...base, status: "confirmed" }} />
        <button className="bg-primary-fill h-11 w-full rounded-full text-md font-bold">تأكيد</button>
      </form>
      <form action={reviewItem} onSubmit={close} className="flex-1">
        <Hidden v={{ ...base, status: "rejected" }} />
        <button className="h-11 w-full rounded-full border border-border bg-card-2 text-md font-semibold text-bad">رفض</button>
      </form>
    </div>
  );
}

/** Edit the item's text (facts / requests / arguments). Provenance stays as is (see editItemText). */
export function SheetEditText({ table, id, caseId, initial }: { table: string; id: string; caseId: string; initial: string }) {
  const close = useContext(SheetCloseCtx);
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(editItemText, null);
  useEffect(() => { if (state?.ok) { setEditing(false); close(); } }, [state, close]);

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)}
        className="h-11 w-full rounded-full border border-border bg-chip text-md text-text-2 shadow-soft hover:text-text">
        تعديل النص
      </button>
    );
  }
  return (
    <form action={action} className="space-y-2">
      <Hidden v={{ table, id, case_id: caseId }} />
      <textarea name="value" defaultValue={initial} rows={4} autoFocus aria-label="نص البند"
        className="text-doc block w-full resize-y rounded-md border border-border bg-field px-3.5 py-2.5 text-md text-text" />
      {state?.error ? <p className="text-sm text-bad">{state.error}</p> : null}
      <div className="flex gap-2">
        <button disabled={pending} className="bg-primary-fill h-11 flex-1 rounded-full text-md font-bold disabled:opacity-50">{pending ? "بيتحفظ…" : "حفظ"}</button>
        <button type="button" onClick={() => setEditing(false)} className="h-11 flex-1 rounded-full border border-border bg-card-2 text-md text-text-2">إلغاء</button>
      </div>
    </form>
  );
}
