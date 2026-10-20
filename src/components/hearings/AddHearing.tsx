"use client";
/** Inline «إضافة جلسة»: a date (d/m/yyyy) and an optional purpose. */
import { useActionState, useEffect, useRef, useState } from "react";
import { Button, cx } from "@/components/ui";
import { formatDmy } from "@/lib/dates";
import { addHearingAction, type HearingFormState } from "./actions";

const input = "h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none";

export function AddHearing({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<HearingFormState, FormData>(addHearingAction, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) form.current?.reset(); }, [state]);

  const saved = state?.ok ? state : null;
  const err = state && !state.ok ? state : null;
  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>إضافة جلسة</Button>
        {saved?.nextDate ? <span className="text-sm text-ok">أضيفت جلسة <span className="num">{formatDmy(saved.nextDate)}</span></span> : null}
      </div>
    );
  }
  return (
    <form ref={form} action={action} className="space-y-2 rounded-lg border border-line bg-surface-2 p-3">
      <input type="hidden" name="case_id" value={caseId} />
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <label className="block">
          <span className="mb-1 block text-xs text-ink-2">تاريخ الجلسة</span>
          <input name="date" required inputMode="numeric" dir="ltr" placeholder="ي/ش/سنة" autoComplete="off"
            className={cx(input, "num text-start", err?.field === "date" && "border-danger")} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-2">الغرض / المطلوب فيها</span>
          <input name="purpose" className={input} placeholder="مثال: أول جلسة، لتقديم المستندات" autoComplete="off" />
        </label>
      </div>
      {err ? <p className="text-sm text-danger" role="alert">{err.error}</p> : null}
      {saved?.nextDate ? <p className="text-sm text-ok" role="status">أضيفت جلسة <span className="num">{formatDmy(saved.nextDate)}</span></p> : null}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? "جارٍ الحفظ…" : "حفظ الجلسة"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>إغلاق</Button>
      </div>
    </form>
  );
}
