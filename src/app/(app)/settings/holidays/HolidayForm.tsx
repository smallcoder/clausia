"use client";
/** The small form of the holidays page: «بلّغ عن إجازة ناقصة» for an office, «ضيف إجازة» for the admin. Same fields. */
import { useActionState } from "react";
import { cx } from "@/components/ui";
import type { HolidayState } from "./actions";

const FIELD = "h-11 w-full rounded-full border border-border bg-field px-4 text-base text-text placeholder:text-text-4";

export function HolidayForm({ action, submit, hint }: { action: (prev: HolidayState, f: FormData) => Promise<HolidayState>; submit: string; hint: string }) {
  const [state, run, pending] = useActionState(action, null as HolidayState);
  return (
    <form action={run} className="space-y-3 px-6 py-5">
      <p className="text-base text-text-3">{hint}</p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[10rem_1fr]">
        <input name="date" required dir="ltr" inputMode="numeric" autoComplete="off" placeholder="6/10/2026" aria-label="التاريخ" className={cx(FIELD, "font-num")} />
        <input name="name" required maxLength={80} autoComplete="off" placeholder="اسم الإجازة" aria-label="اسم الإجازة" className={FIELD} />
      </div>
      <input name="note" maxLength={200} autoComplete="off" placeholder="ملاحظة (اختياري)" aria-label="ملاحظة" className={FIELD} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="bg-primary-fill h-11 rounded-full px-5 text-base font-bold transition disabled:opacity-50">{submit}</button>
        {state?.error ? <p role="alert" className="text-base text-bad">{state.error}</p> : state?.ok ? <p role="status" className="text-base text-good">اتسجّل.</p> : null}
      </div>
    </form>
  );
}
