"use client";
/**
 * «حدد الموكل» (a case with no client) and «تغيير» (a case that has one), in the case header's client cell. A dialog: search the office's clients and
 * choose one, or add a new one (name, phone); nothing is saved until the lawyer taps «حفظ» (setCaseClientAction, through applyOp, RLS-bound).
 * Never a guess: the choice is the lawyer's, and a new client needs a typed name.
 */
import { Search } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { setCaseClientAction } from "@/app/(app)/cases/actions";
import { cx } from "@/components/ui";

export interface PickerClient { id: string; name: string; phone: string | null }

const field = "w-full rounded-md border border-border bg-field px-3.5 text-md text-text placeholder:text-text-4";

export function ClientPicker({ caseId, clients, currentId }: { caseId: string; clients: PickerClient[]; currentId: string | null }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState(setCaseClientAction, null);
  const [q, setQ] = useState("");
  const [choice, setChoice] = useState<string | null>(currentId);
  const [fresh, setFresh] = useState(false);
  const id = useId();
  const norm = (s: string) => s.replace(/[ً-ٟـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").toLowerCase();
  const shown = q.trim() ? clients.filter((c) => norm(c.name).includes(norm(q.trim())) || (c.phone ?? "").includes(q.trim())) : clients;

  useEffect(() => { if (state?.ok) dlg.current?.close(); }, [state]);

  const open = () => { setQ(""); setChoice(currentId); setFresh(false); dlg.current?.showModal(); };
  const label = currentId ? "تغيير" : "حدد الموكل";

  return (
    <>
      <button type="button" onClick={open} aria-haspopup="dialog"
        className={cx("tap shrink-0 text-sm font-semibold hover:underline", currentId ? "text-text-3 hover:text-text" : "text-gold")}>{label}</button>
      <dialog ref={dlg} aria-labelledby={`${id}-t`} onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border-2 bg-card p-0 text-text shadow-pop backdrop:bg-backdrop" /* ds-allow: a dialog keeps a 16px margin on each side of a phone */>
        <form action={action} className="flex max-h-[85dvh] flex-col" /* ds-allow: the dialog never grows past the screen */>
          <input type="hidden" name="case_id" value={caseId} />
          {!fresh && choice ? <input type="hidden" name="client_id" value={choice} /> : null}
          <div className="border-b border-border-2 px-5 py-4">
            <h2 id={`${id}-t`} className="text-lg font-bold text-title">{currentId ? "غيّر موكل الدعوى" : "مين موكل الدعوى دي؟"}</h2>
            <p className="mt-1 text-sm text-text-3">اختار موكل من اللي عندك، أو أضف موكل جديد. مش هيتحفظ حاجة قبل ما تدوس «حفظ».</p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {fresh ? (
              <div className="flex flex-col gap-2.5 px-2 pb-1">
                <label className="text-sm font-semibold text-text-2" htmlFor={`${id}-n`}>اسم الموكل</label>
                <input id={`${id}-n`} name="new_name" className={`${field} h-11`} placeholder="الاسم كما هو في التوكيل" autoComplete="off" autoFocus required />
                <label className="text-sm font-semibold text-text-2" htmlFor={`${id}-p`}>التليفون (اختياري)</label>
                <input id={`${id}-p`} name="new_phone" className={`${field} h-11`} inputMode="tel" dir="ltr" autoComplete="off" />
                <button type="button" onClick={() => setFresh(false)} className="tap self-start text-sm font-semibold text-text-3 hover:text-text">اختار من الموكلين الموجودين</button>
              </div>
            ) : (
              <>
                <label className="relative mb-2 block">
                  <span className="sr-only">دوّر في الموكلين</span>
                  <Search aria-hidden size={16} strokeWidth={1.9} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-text-4" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} className={`${field} h-11 ps-10`} placeholder="دوّر بالاسم أو التليفون" autoComplete="off" />
                </label>
                <ul role="radiogroup" aria-label="الموكلين">
                  {shown.map((c) => (
                    <li key={c.id}>
                      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-card-2 has-checked:bg-card-2">
                        <input type="radio" name="pick" checked={choice === c.id} onChange={() => setChoice(c.id)} className="size-4 accent-selected" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-md font-semibold text-text">{c.name}</span>
                          {c.phone ? <span className="font-num block truncate text-end text-sm text-text-4" dir="ltr">{c.phone}</span> : null}
                        </span>
                      </label>
                    </li>
                  ))}
                  {shown.length === 0 ? <li className="px-3 py-3 text-base text-text-3">مفيش موكل بالاسم ده.</li> : null}
                </ul>
                <button type="button" onClick={() => { setFresh(true); setChoice(null); }} className="tap mt-2 inline-flex min-h-11 items-center px-3 text-base font-semibold text-gold">+ موكل جديد</button>
              </>
            )}
          </div>

          {state?.error ? <p className="mx-5 mb-3 rounded-md bg-bad-bg px-3 py-2 text-base text-bad" role="alert">{state.error}</p> : null}
          <div className="flex gap-2 border-t border-border-2 px-5 py-4">
            <button disabled={pending || (!fresh && !choice) || (!!currentId && !fresh && choice === currentId)}
              className="bg-primary-fill inline-flex h-11 items-center justify-center rounded-full px-6 text-md font-bold transition disabled:opacity-50">{pending ? "بيتحفظ…" : "حفظ"}</button>
            <button type="button" onClick={() => dlg.current?.close()} className="inline-flex h-11 items-center rounded-full border border-border bg-chip px-5 text-md text-text-2">إلغاء</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
