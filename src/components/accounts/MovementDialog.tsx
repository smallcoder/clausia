"use client";
/**
 * «+ حركة» (the accounts tab's head) and «إيصال استلام»: a dialog to record a receipt or an expense by hand, and the link that prints the newest receipt.
 * Nothing is saved until the lawyer taps «سجّل» (addMovementAction → applyOp, MANUAL, RLS-bound). Nothing is chosen for the lawyer that matters: the method
 * has no default, the expense's «على مين» has no default, and when the client has several open cases and none stands out, the case has no default either
 * (when one does, it is the suggestion rule's pick and it is shown as a normal choice). The amount shows back as it will be saved, so a typo is seen.
 */
import { Plus, Printer } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { addMovementAction } from "@/app/(app)/clients/[id]/actions";
import { cx } from "@/components/ui";
import { formatDmy } from "@/lib/dates";
import { MONEY_CHARGE, MONEY_KIND, MONEY_METHOD } from "@/lib/labels";
import { formatEgp, parseAmount } from "@/lib/money";

export interface CaseChoice { id: string; label: string }

const field = "w-full rounded-md border border-border bg-field px-3.5 text-md text-text placeholder:text-text-4";
const label = "mb-1.5 block text-sm font-semibold text-text-3";

export function MovementActions({ clientId, clientName, cases, suggestedCase, today, lastReceiptId }: {
  clientId: string; clientName: string; cases: CaseChoice[]; suggestedCase: string | null; today: string; lastReceiptId: string | null;
}) {
  const dlg = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [state, action, pending] = useActionState(addMovementAction, null);
  const [kind, setKind] = useState<"receipt" | "expense">("receipt");
  const [amount, setAmount] = useState("");
  const only = cases.length === 0 ? "general" : "";
  const [caseChoice, setCaseChoice] = useState(suggestedCase ?? only);
  const [date, setDate] = useState(formatDmy(today));

  useEffect(() => {
    if (state?.ok) { dlg.current?.close(); setAmount(""); setKind("receipt"); }
  }, [state]);

  const open = () => { setDate(formatDmy(today)); setCaseChoice(suggestedCase ?? only); dlg.current?.showModal(); };
  const parsed = amount.trim() ? parseAmount(amount) : null;
  const err = (f: string) => (state?.field === f ? state.error : undefined);
  const btn = "tap inline-flex h-control-xl items-center justify-center gap-2 rounded-full px-5 text-base font-bold transition";

  return (
    <>
      {lastReceiptId ? (
        <Link href={`/receipts/${lastReceiptId}`} target="_blank" className={`${btn} border border-border bg-chip text-text-2 hover:text-text`}>
          <Printer aria-hidden size={16} strokeWidth={1.9} />إيصال استلام
        </Link>
      ) : (
        <span title="لسه مفيش استلام يتطبع له إيصال" className={`${btn} cursor-not-allowed border border-border bg-chip text-text-4`}>
          <Printer aria-hidden size={16} strokeWidth={1.9} />إيصال استلام
        </span>
      )}
      <button type="button" onClick={open} aria-haspopup="dialog" className={`${btn} bg-selected text-on-selected shadow-card hover:opacity-90`}>
        <Plus aria-hidden size={16} strokeWidth={2.2} />حركة
      </button>
      <dialog ref={dlg} aria-labelledby={`${id}-t`} onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border-2 bg-card p-0 text-text shadow-pop backdrop:bg-backdrop" /* ds-allow: a dialog keeps a 16px margin on each side of a phone */>
        <form action={action} className="flex max-h-[90dvh] flex-col" /* ds-allow: the dialog never grows past the screen */>
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="kind" value={kind} />
          <div className="border-b border-border-2 px-5 py-4">
            <h2 id={`${id}-t`} className="text-lg font-bold text-title">حركة جديدة في حساب {clientName}</h2>
            <p className="mt-1 text-sm text-text-3">مش هيتحفظ حاجة قبل ما تدوس «سجّل».</p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4">
            <div role="radiogroup" aria-label="نوع الحركة" className="grid grid-cols-2 gap-1 rounded-full bg-card-2 p-1">
              {(["receipt", "expense"] as const).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                  className={cx("tap h-9 rounded-full text-base font-semibold transition", kind === k ? "bg-selected text-on-selected shadow-card" : "text-text-3 hover:text-text")}>{MONEY_KIND[k]}</button>
              ))}
            </div>

            <div>
              <label htmlFor={`${id}-a`} className={label}>المبلغ بالجنيه</label>
              <input id={`${id}-a`} name="amount" required value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" inputMode="decimal" autoComplete="off" placeholder="3000"
                aria-invalid={!!err("amount") || undefined} className={cx(field, "num h-11 text-start", err("amount") && "border-bad")} />
              <p className="mt-1.5 min-h-5 text-sm text-text-3" aria-live="polite">
                {amount.trim() ? (parsed !== null ? <>هيتسجل: <b className="font-num font-bold text-text">{formatEgp(parsed)}</b></> : <span className="text-bad">المبلغ غير واضح: رقم واحد بالجنيه، مثل 3000 أو 450.50</span>) : null}
              </p>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div>
                <label htmlFor={`${id}-m`} className={label}>الطريقة</label>
                <select id={`${id}-m`} name="method" required defaultValue="" className={cx(field, "h-11", err("method") && "border-bad")}>
                  <option value="" disabled>اختار</option>
                  {Object.entries(MONEY_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-d`} className={label}>التاريخ</label>
                <input id={`${id}-d`} name="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" inputMode="numeric" placeholder="يوم/شهر/سنة" autoComplete="off"
                  className={cx(field, "num h-11 text-start", err("date") && "border-bad")} />
              </div>
            </div>

            <div>
              <label htmlFor={`${id}-c`} className={label}>على قضية</label>
              <select id={`${id}-c`} name="case" required value={caseChoice} onChange={(e) => setCaseChoice(e.target.value)} className={cx(field, "h-11", err("case") && "border-bad")}>
                <option value="" disabled>اختار</option>
                <option value="general">الحساب العام للموكل</option>
                {cases.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>

            {kind === "expense" ? (
              <fieldset>
                <legend className={label}>المصروف</legend>
                <div className="flex gap-2">
                  {(["client", "office"] as const).map((k) => (
                    <label key={k} className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-md border border-border bg-field px-3.5 text-base text-text has-checked:border-gold-edge has-checked:bg-gold-bg">
                      <input type="radio" name="charged_to" value={k} required className="size-4 accent-selected" />{MONEY_CHARGE[k]}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <div>
              <label htmlFor={`${id}-n`} className={label}>ملاحظة (اختياري)</label>
              <input id={`${id}-n`} name="note" maxLength={300} autoComplete="off" placeholder={kind === "expense" ? "مثلاً: رسوم وإعلان" : "مثلاً: دفعة تانية"} className={cx(field, "h-11")} />
            </div>
          </div>

          {state?.error && !state.field ? <p className="mx-5 mb-3 rounded-md bg-bad-bg px-3 py-2 text-base text-bad" role="alert">{state.error}</p> : null}
          {state?.error && state.field && state.field !== "amount" ? <p className="mx-5 mb-3 rounded-md bg-bad-bg px-3 py-2 text-base text-bad" role="alert">{state.error}</p> : null}
          <div className="flex gap-2 border-t border-border-2 px-5 py-4">
            <button disabled={pending || (amount.trim() !== "" && parsed === null)} className="bg-primary-fill inline-flex h-11 items-center justify-center rounded-full px-6 text-md font-bold transition disabled:opacity-50">{pending ? "بيتسجل…" : "سجّل"}</button>
            <button type="button" onClick={() => dlg.current?.close()} className="inline-flex h-11 items-center rounded-full border border-border bg-chip px-5 text-md text-text-2">إلغاء</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
