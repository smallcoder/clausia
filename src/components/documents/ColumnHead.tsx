"use client";
/**
 * The head of a custom column of the documents table: its title, «مقترح» when it is a suggested column, and a «…» menu with
 *   غيّر الاسم  (the title becomes one input + save / cancel, in place)
 *   امسح العمود (opens a confirm step in the same menu: «هيتمسح العمود وكل خاناته. متأكد؟». Only its «امسح» button deletes.)
 * The menu is drawn in a portal with fixed positioning like the row's DocMenu: the table scrolls sideways, and a menu inside
 * it would be clipped. Esc, a tap outside, a scroll or a resize close it (that is «إلغاء» too); Esc returns focus to the button.
 */
import { MoreHorizontal } from "lucide-react";
import { useActionState, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { removeColumnAction, renameColumnAction } from "@/lib/doc-columns/actions";

const ITEM = "flex min-h-11 w-full items-center px-4 text-start text-base text-text hover:bg-card-2";
const FIELD = "h-11 w-full rounded-md border border-border bg-field px-3.5 text-md font-normal text-text placeholder:text-text-4";

export function ColumnHead({ id, title, suggested }: { id: string; title: string; suggested: boolean }) {
  const [renaming, setRenaming] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [renameState, renameAction, renamePending] = useActionState(renameColumnAction, null);
  const [removeState, removeAction, removePending] = useActionState(removeColumnAction, null);

  const close = useCallback((refocus = false) => { setOpen(false); setConfirming(false); if (refocus) btn.current?.focus(); }, []);
  useEffect(() => { if (renameState?.ok) setRenaming(false); }, [renameState]);

  // under the button, its end edges aligned; flipped above when there is no room; never outside the screen
  useLayoutEffect(() => {
    if (!open || !btn.current || !box.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = box.current.offsetWidth, h = box.current.offsetHeight;
    const left = Math.min(Math.max(r.right - w, 8), window.innerWidth - w - 8);
    const below = r.bottom + 6;
    setPos({ left, top: below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below });
  }, [open, confirming]);

  useEffect(() => { if (confirming) cancel.current?.focus(); }, [confirming]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(true); } };
    const onDown = (e: PointerEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !btn.current?.contains(t)) close(); };
    const onMove = (e: Event) => { if (!box.current?.contains(e.target as Node)) close(); };
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

  if (renaming) {
    return (
      <form action={renameAction} className="flex w-full flex-col gap-2">
        <input type="hidden" name="column_id" value={id} />
        <input name="value" defaultValue={title} maxLength={80} autoFocus autoComplete="off" aria-label="اسم العمود" className={FIELD} />
        {renameState?.error ? <p className="rounded-md bg-bad-bg px-3 py-2 text-sm font-normal text-bad" role="alert">{renameState.error}</p> : null}
        <div className="flex gap-2">
          <button disabled={renamePending} className="bg-primary-fill inline-flex h-11 items-center justify-center rounded-full px-5 text-base font-bold transition disabled:opacity-60">{renamePending ? "بيتحفظ…" : "حفظ"}</button>
          <button type="button" onClick={() => setRenaming(false)} className="inline-flex h-11 items-center rounded-full border border-border bg-chip px-4 text-base font-normal text-text-2">إلغاء</button>
        </div>
      </form>
    );
  }

  return (
    <>
      <span className="min-w-0">{title}</span>
      {suggested ? <span className="inline-flex items-center gap-1 text-xs text-gold"><span aria-hidden className="size-dot rounded-full bg-gold" />مقترح</span> : null}
      <button ref={btn} type="button" aria-label={`خيارات عمود ${title}`} aria-haspopup="menu" aria-expanded={open}
        onClick={() => { setPos(null); setConfirming(false); setOpen((o) => !o); }}
        className="tap -me-1.5 ms-auto inline-flex size-9 shrink-0 items-center justify-center rounded-full text-text-3 transition hover:bg-card hover:text-text">
        <MoreHorizontal aria-hidden size={18} strokeWidth={2} />
      </button>
      {open ? createPortal(
        <div ref={box} role={confirming ? "alertdialog" : "menu"} aria-label={confirming ? "مسح العمود" : `خيارات عمود ${title}`}
          style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
          className="fixed z-40 w-72 max-w-[calc(100vw-1rem)] overflow-hidden rounded-md border border-border-2 bg-card py-1 shadow-pop" /* ds-allow: a share of the screen width (vw), not a length: the menu never passes the screen edge */>
          {confirming ? (
            <form action={removeAction} className="space-y-3 px-4 pb-3 pt-3">
              <input type="hidden" name="column_id" value={id} />
              <input type="hidden" name="confirm" value="yes" />
              <p className="text-base font-semibold leading-6 text-text">هيتمسح العمود وكل خاناته. متأكد؟</p>
              <p className="truncate text-sm text-text-3">«{title}»</p>
              {removeState?.error ? <p className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad" role="alert">{removeState.error}</p> : null}
              <div className="flex gap-2">
                <button disabled={removePending} className="inline-flex h-11 items-center justify-center rounded-full border border-bad bg-bad-bg px-5 text-base font-bold text-bad transition disabled:opacity-60">{removePending ? "بيتمسح…" : "امسح"}</button>
                <button ref={cancel} type="button" onClick={() => close(true)} className="inline-flex h-11 items-center rounded-full border border-border bg-chip px-5 text-base text-text-2">إلغاء</button>
              </div>
            </form>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={() => { close(); setRenaming(true); }} className={ITEM}>غيّر الاسم</button>
              <button type="button" role="menuitem" onClick={() => setConfirming(true)} className={`${ITEM} text-bad`}>امسح العمود</button>
            </>
          )}
        </div>, document.body) : null}
    </>
  );
}
