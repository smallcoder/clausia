"use client";
/**
 * «أضف جلسة»: the last row of the case hearings panel. Opens into a date (d/m/yyyy, parsed with parseDmy on the
 * server, refused when unclear — never guessed) and an optional purpose.
 */
import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { cx } from "@/components/ui";
import { formatDmy } from "@/lib/dates";
import { addHearingAction, type HearingFormState } from "./actions";

const input = "h-11 w-full rounded-md border border-border bg-field px-3 text-md text-text placeholder:text-text-4 focus:border-gold focus:outline-none";

export function AddHearing({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState(false);
  // controlled, so a refused save keeps what the lawyer typed; cleared after a successful save
  const [date, setDate] = useState("");
  const [purpose, setPurpose] = useState("");
  const [state, action, pending] = useActionState<HearingFormState, FormData>(async (prev, fd) => {
    const r = await addHearingAction(prev, fd);
    if (r?.ok) { setDate(""); setPurpose(""); }
    return r;
  }, null);

  const saved = state?.ok ? state : null;
  const err = state && !state.ok ? state : null;
  const savedLine = saved?.nextDate
    ? <span className="text-sm text-good" role="status">أضيفت جلسة <span className="num font-num font-bold">{formatDmy(saved.nextDate)}</span></span>
    : null;

  if (!open) {
    return (
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 px-5 py-1">
        <button type="button" onClick={() => setOpen(true)} className="-ms-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-md font-semibold text-text-2 hover:text-text hover:underline">
          <Plus aria-hidden size={18} strokeWidth={2.2} />أضف جلسة
        </button>
        {savedLine}
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3 bg-card-2 px-5 py-4">
      <input type="hidden" name="case_id" value={caseId} />
      <p className="text-md font-bold text-text">جلسة جديدة</p>
      <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-text-3">تاريخ الجلسة</span>
          <input name="date" required value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" inputMode="numeric" placeholder="يوم/شهر/سنة" autoComplete="off"
            aria-invalid={err?.field === "date" || undefined}
            className={cx(input, "num font-num text-start", err?.field === "date" && "border-bad")} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-text-3">الغرض / المطلوب فيها</span>
          <input name="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} className={input} placeholder="مثلاً: أول جلسة، لتقديم المستندات" autoComplete="off" />
        </label>
      </div>
      {err ? <p className="rounded-md bg-bad-bg px-3 py-2 text-base text-bad" role="alert">{err.error}</p> : null}
      {savedLine}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="bg-primary-fill inline-flex h-11 items-center justify-center rounded-full px-6 text-md font-bold transition disabled:opacity-60">
          {pending ? "جارٍ الحفظ…" : "حفظ الجلسة"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={pending} className="inline-flex h-11 items-center rounded-full border border-border bg-chip px-5 text-md text-text-2">
          إغلاق
        </button>
      </div>
    </form>
  );
}
