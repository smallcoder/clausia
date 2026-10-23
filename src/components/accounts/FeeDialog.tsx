"use client";
/**
 * «حدد الأتعاب» / «تعديل» in a case's row of the fees table: a fixed amount, or «مفتوحة» (no amount, so no balance). A dialog; nothing is saved until
 * the lawyer taps «حفظ» (setFeeAction → applyOp set_case_fee, MANUAL, RLS-bound). Optional: a case with no fee set simply has no balance.
 */
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { setFeeAction } from "@/app/(app)/clients/[id]/actions";
import { cx } from "@/components/ui";
import { amountText, formatEgp, parseAmount } from "@/lib/money";

const field = "w-full rounded-md border border-border bg-field px-3.5 text-md text-text placeholder:text-text-4";

export function FeeDialog({ clientId, caseId, caseLabel, kind: current, amount: currentAmount }: {
  clientId: string; caseId: string; caseLabel: string; kind: "fixed" | "open" | null; amount: number | null;
}) {
  const dlg = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [state, action, pending] = useActionState(setFeeAction, null);
  const [kind, setKind] = useState<"fixed" | "open">(current ?? "fixed");
  const [amount, setAmount] = useState(currentAmount ? amountText(currentAmount) : "");
  useEffect(() => { if (state?.ok) dlg.current?.close(); }, [state]);

  const open = () => { setKind(current ?? "fixed"); setAmount(currentAmount ? amountText(currentAmount) : ""); dlg.current?.showModal(); };
  const parsed = amount.trim() ? parseAmount(amount) : null;

  return (
    <>
      <button type="button" onClick={open} aria-haspopup="dialog" aria-label={`${current ? "تعديل" : "حدد"} أتعاب ${caseLabel}`}
        className={cx("tap text-sm font-semibold hover:underline", current ? "text-text-3 hover:text-text" : "text-gold")}>{current ? "تعديل" : "حدد الأتعاب"}</button>
      <dialog ref={dlg} aria-labelledby={`${id}-t`} onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border-2 bg-card p-0 text-text shadow-pop backdrop:bg-backdrop" /* ds-allow: a dialog keeps a 16px margin on each side of a phone */>
        <form action={action} className="flex flex-col">
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="case_id" value={caseId} />
          <input type="hidden" name="kind" value={kind} />
          <div className="border-b border-border-2 px-5 py-4">
            <h2 id={`${id}-t`} className="text-lg font-bold text-title">أتعاب القضية</h2>
            <p className="mt-1 text-sm text-text-3">{caseLabel}</p>
          </div>
          <div className="flex flex-col gap-3.5 px-5 py-4">
            <div role="radiogroup" aria-label="نوع الأتعاب" className="grid grid-cols-2 gap-1 rounded-full bg-card-2 p-1">
              {([["fixed", "مبلغ ثابت"], ["open", "مفتوحة"]] as const).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                  className={cx("tap h-9 rounded-full text-base font-semibold transition", kind === k ? "bg-selected text-on-selected shadow-card" : "text-text-3 hover:text-text")}>{l}</button>
              ))}
            </div>
            {kind === "fixed" ? (
              <div>
                <label htmlFor={`${id}-a`} className="mb-1.5 block text-sm font-semibold text-text-3">المتفق عليه بالجنيه</label>
                <input id={`${id}-a`} name="amount" required value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" inputMode="decimal" autoComplete="off" placeholder="15000"
                  className={cx(field, "num h-11 text-start", state?.field === "amount" && "border-bad")} />
                <p className="mt-1.5 min-h-5 text-sm text-text-3" aria-live="polite">
                  {amount.trim() ? (parsed !== null ? <>هيتسجل: <b className="font-num font-bold text-text">{formatEgp(parsed)}</b></> : <span className="text-bad">المبلغ غير واضح: رقم واحد بالجنيه، مثل 15000</span>) : null}
                </p>
              </div>
            ) : (
              <p className="text-base leading-7 text-text-3">الأتعاب المفتوحة بلا مبلغ، فمفيش «باقي» بيتحسب للقضية دي.</p>
            )}
          </div>
          {state?.error ? <p className="mx-5 mb-3 rounded-md bg-bad-bg px-3 py-2 text-base text-bad" role="alert">{state.error}</p> : null}
          <div className="flex gap-2 border-t border-border-2 px-5 py-4">
            <button disabled={pending || (kind === "fixed" && parsed === null)} className="bg-primary-fill inline-flex h-11 items-center justify-center rounded-full px-6 text-md font-bold transition disabled:opacity-50">{pending ? "بيتحفظ…" : "حفظ"}</button>
            <button type="button" onClick={() => dlg.current?.close()} className="inline-flex h-11 items-center rounded-full border border-border bg-chip px-5 text-md text-text-2">إلغاء</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
