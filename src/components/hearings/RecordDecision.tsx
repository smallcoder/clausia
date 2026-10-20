"use client";
/** Compact inline «تسجيل القرار»: closed by default, opens into four small fields. Never a big form. */
import { useActionState, useState } from "react";
import { Button, cx } from "@/components/ui";
import { formatDmy } from "@/lib/dates";
import { DECISION } from "@/lib/labels";
import { recordDecisionAction, type HearingFormState } from "./actions";
import { useDecisionNotice } from "./DecisionNotices";

const input = "h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none";

export function RecordDecision({ hearingId, caseId, hearingDate, label, compact = false }: { hearingId: string; caseId: string; hearingDate: string; label: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  // controlled, so a refused save keeps what the lawyer typed (React resets uncontrolled fields after an action)
  const [decision, setDecision] = useState("");
  const [text, setText] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [needed, setNeeded] = useState("");
  const notify = useDecisionNotice();
  const [state, action, pending] = useActionState<HearingFormState, FormData>(async (prev, fd) => {
    const r = await recordDecisionAction(prev, fd);
    // the page refreshes after saving and this row may leave the list: report to the surrounding <DecisionNotices>
    if (r?.ok) notify?.({ label, nextDate: r.nextDate });
    return r;
  }, null);

  if (state?.ok) {
    if (notify) return null;
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
          <input name="decision_text" value={text} onChange={(e) => setText(e.target.value)} className={input} placeholder="مثال: أجلت لتقديم المستندات" autoComplete="off" />
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <label className="block">
          <span className="mb-1 block text-xs text-ink-2">الجلسة القادمة{postponed ? " (مطلوب)" : ""}</span>
          <input name="next_date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} dir="ltr" placeholder="ي/ش/سنة" autoComplete="off"
            aria-invalid={err?.field === "next_date" || undefined}
            className={cx(input, "num text-start", err?.field === "next_date" && "border-danger")} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-2">المطلوب للجلسة القادمة</span>
          <input name="next_requirements" value={needed} onChange={(e) => setNeeded(e.target.value)} className={input} placeholder="مثال: إعلان الخصم، تقديم أصل العقد" autoComplete="off" />
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
