"use client";
/**
 * «اتحفظ N تعديل · تراجع»: the toast after a confirm (split layout, PR 2b). It shows for 10 seconds; «تراجع» reverts exactly
 * what that confirm saved (undoDecisionAction → src/lib/undo.ts: once, within the window, refused if a row changed since).
 * It lives above the pages (in the split shell) because the card or the page bar that was tapped is gone after the refresh.
 * The confirm that cannot be reverted later (a new case) gives no event, so no toast.
 */
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { undoDecisionAction } from "@/lib/assistant/actions";
import { editsLabel } from "@/lib/edits";

export const UNDO_TOAST_MS = 10_000;

type Toast = { kind: "saved"; ids: string[]; count: number } | { kind: "undone" } | { kind: "error"; msg: string };
interface Api { show: (t: { eventIds: string[]; count: number }) => void }

const Ctx = createContext<Api>({ show: () => {} });
/** `show({ eventIds, count })` after a confirm that returned `undoEventId`s. */
export const useUndoToast = () => useContext(Ctx);

export function UndoToastProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [toast, setToast] = useState<Toast | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const set = useCallback((t: Toast | null, ms = 0) => {
    clearTimeout(timer.current);
    setToast(t);
    if (t && ms) timer.current = setTimeout(() => setToast(null), ms);
  }, []);
  const show = useCallback((t: { eventIds: string[]; count: number }) => {
    if (t.eventIds.length) set({ kind: "saved", ids: t.eventIds, count: t.count }, UNDO_TOAST_MS);
  }, [set]);
  const api = useMemo(() => ({ show }), [show]);

  function undo(ids: string[]) {
    clearTimeout(timer.current); // the 10 seconds stop while the tap is being worked on
    start(async () => {
      const r = await undoDecisionAction(ids);
      set(r.ok ? { kind: "undone" } : { kind: "error", msg: r.error ?? "تعذّر التراجع" }, r.ok ? 3_000 : 6_000);
      router.refresh();
    });
  }

  return (
    <Ctx.Provider value={api}>
      {children}
      {toast ? (
        <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-32 z-50 flex justify-center px-3.5 xl:bottom-8">
          <div className="glass pointer-events-auto flex max-w-full items-center gap-3 rounded-full py-1.5 ps-4.5 pe-1.5 text-sm text-text">
            {toast.kind === "saved" ? (
              <>
                <span>اتحفظ {editsLabel(toast.count)}</span>
                <button type="button" onClick={() => undo(toast.ids)} disabled={pending}
                  className="tap inline-flex h-8 items-center rounded-full border border-border px-3.5 font-semibold text-text-2 transition hover:text-text disabled:opacity-50">تراجع</button>
              </>
            ) : toast.kind === "undone" ? <span className="pe-3">اتراجع عن التعديل</span> : <span className="pe-3 text-bad">{toast.msg}</span>}
          </div>
        </div>
      ) : null}
    </Ctx.Provider>
  );
}
