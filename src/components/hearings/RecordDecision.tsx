"use client";
/** Compact inline «تسجيل القرار»: closed by default, opens into four small fields. Never a big form. */
import { useActionState, useState } from "react";
import { Button, cx } from "@/components/ui";
import { formatDmy } from "@/lib/dates";
import { DECISION } from "@/lib/labels";
import { recordDecisionAction, type HearingFormState } from "./actions";

const input = "h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none";

export function RecordDecision({ hearingId, caseId, hearingDate, compact = false }: { hearingId: string; caseId: string; hearingDate: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState("");
  const [state, action, pending] = useActionState<HearingFormState, FormData>(recordDecisionAction, null);

  if (state?.ok) {
    return (
      <p className="mt-2 rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok" role="status">
        تم حفظ القرار.
        {state.nextDate ? <> الجلسة القادمة: <span className="num font-semibold">{formatDmy(state.nextDate)}</span></> : null}
      </p>
    );
  }

  if (!open) {
    return (
      <Button type="button" variant={compact ? "ghost" : "secondary"} size="sm" className={compact ? "-ms-2 mt-1" : "mt-2"} onClick={() => setOpen(true)}>
        تسجيل القرار
      </Button>
    );
  }

  const err = state && !state.ok ? state : null;
  const postponed = decision === "postponed";
  return (
    <form action={action} className="mt-2 space-y-2 rounded-lg border border-line bg-surface-2 p-3">
      <input type="hidden" name="hearing_id" value={hearingId} />
      <input type="hidden" name="case_id" value={caseId} />
      <input type="hidden" name="hearing_date" value={hearingDate} />
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <label className="block">
          <span className="mb-1 block text-xs text-ink-2">القرار</span>
          <select name="decision" required value={decision} onChange={(e) => setDecision(e.target.value)} className={cx(input, err?.field === "decision" && "border-danger")}>
            <option value="" disabled>اختر…</option>
            {Object.entries(DECISION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-2">نص القرار</span>
          <input name="decision_text" className={input} placeholder="مثال: أجلت لتقديم المستندات" autoComplete="off" />
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <label className="block">
          <span className="mb-1 block text-xs text-ink-2">الجلسة القادمة{postponed ? " (مطلوب)" : ""}</span>
          <input name="next_date" inputMode="numeric" dir="ltr" placeholder="ي/ش/سنة" autoComplete="off"
            aria-invalid={err?.field === "next_date" || undefined}
            className={cx(input, "num text-start", err?.field === "next_date" && "border-danger")} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-2">المطلوب للجلسة القادمة</span>
          <input name="next_requirements" className={input} placeholder="مثال: إعلان الخصم، تقديم أصل العقد" autoComplete="off" />
        </label>
      </div>
      {err ? <p className="text-sm text-danger" role="alert">{err.error}</p> : null}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? "جارٍ الحفظ…" : "حفظ القرار"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>إلغاء</Button>
      </div>
    </form>
  );
}
