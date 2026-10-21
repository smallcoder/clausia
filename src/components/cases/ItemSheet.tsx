"use client";
/**
 * A case item you tap (fact, request, argument, party). Rows show no edit links; tapping opens the item's
 * actions — a bottom sheet on mobile, a side panel on desktop (native <dialog>: focus trap, Escape, backdrop).
 * `#item-<id>` in the URL opens it too (the hero's «محتاجة مراجعة» tile links there).
 */
import { X } from "lucide-react";
import { createContext, useActionState, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { editItemText, reviewItem } from "@/app/(app)/cases/actions";

const CloseCtx = createContext<() => void>(() => {});

export function TapItem({ id, title, row, children, className = "" }: { id: string; title: string; row: ReactNode; children: ReactNode; className?: string }) {
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
      <button type="button" onClick={() => ref.current?.showModal()} aria-haspopup="dialog"
        className={`block w-full cursor-pointer text-start transition-colors hover:bg-card-2/60 focus-visible:bg-card-2/60 ${className}`}>
        {row}
      </button>
      <dialog ref={ref} aria-label={title}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        onClose={() => { if (window.location.hash === hash) history.replaceState(null, "", window.location.pathname + window.location.search); }}
        className="sheet-enter fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-[24px] border border-border bg-card p-0 text-text shadow-pop backdrop:bg-backdrop sm:[animation:fade-in_180ms_ease-out] sm:inset-y-0 sm:start-auto sm:end-0 sm:h-dvh sm:max-h-none sm:w-[420px] sm:rounded-none sm:rounded-s-[24px]">
        <CloseCtx.Provider value={close}>
          <div className="px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-4">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border sm:hidden" aria-hidden />
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[17px] font-bold text-text">{title}</h2>
              <button type="button" onClick={close} aria-label="إغلاق"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card-2 text-text-3 hover:text-text">
                <X size={18} strokeWidth={2} />
              </button>
            </div>
            <div className="mt-4 space-y-4">{children}</div>
          </div>
        </CloseCtx.Provider>
      </dialog>
    </div>
  );
}

function Hidden({ v }: { v: Record<string, string> }) {
  return <>{Object.entries(v).map(([k, x]) => <input key={k} type="hidden" name={k} value={x} />)}</>;
}

/** Confirm / reject a suggested item; closes the sheet on tap. */
export function SheetReview({ table, id, caseId }: { table: string; id: string; caseId: string }) {
  const close = useContext(CloseCtx);
  const base = { table, id, case_id: caseId };
  return (
    <div className="flex gap-2">
      <form action={reviewItem} onSubmit={close} className="flex-1">
        <Hidden v={{ ...base, status: "confirmed" }} />
        <button className="bg-primary-fill h-11 w-full rounded-full text-[15px] font-bold">تأكيد</button>
      </form>
      <form action={reviewItem} onSubmit={close} className="flex-1">
        <Hidden v={{ ...base, status: "rejected" }} />
        <button className="h-11 w-full rounded-full border border-border bg-card-2 text-[15px] font-semibold text-bad">رفض</button>
      </form>
    </div>
  );
}

/** Edit the item's text (facts / requests / arguments). Provenance stays as is (see editItemText). */
export function SheetEditText({ table, id, caseId, initial }: { table: string; id: string; caseId: string; initial: string }) {
  const close = useContext(CloseCtx);
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(editItemText, null);
  useEffect(() => { if (state?.ok) { setEditing(false); close(); } }, [state, close]);

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)}
        className="h-11 w-full rounded-full border border-border bg-chip text-[15px] text-text-2 shadow-soft hover:text-text">
        تعديل النص
      </button>
    );
  }
  return (
    <form action={action} className="space-y-2">
      <Hidden v={{ table, id, case_id: caseId }} />
      <textarea name="value" defaultValue={initial} rows={4} autoFocus aria-label="نص البند"
        className="text-doc block w-full resize-y rounded-2xl border border-border bg-field px-3.5 py-2.5 text-[15px] text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]" />
      {state?.error ? <p className="text-[13px] text-bad">{state.error}</p> : null}
      <div className="flex gap-2">
        <button disabled={pending} className="bg-primary-fill h-11 flex-1 rounded-full text-[15px] font-bold disabled:opacity-50">{pending ? "بيتحفظ…" : "حفظ"}</button>
        <button type="button" onClick={() => setEditing(false)} className="h-11 flex-1 rounded-full border border-border bg-card-2 text-[15px] text-text-2">إلغاء</button>
      </div>
    </form>
  );
}
