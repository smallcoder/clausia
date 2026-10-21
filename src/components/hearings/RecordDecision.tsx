"use client";
/**
 * «تسجيل القرار». Inline (case hearings timeline): closed by default, opens into the same form as the sheet,
 * inside a quiet box under the hearing. Sheet (roll): open at once; `onSaved` lets the sheet show the result.
 * Both: the decision as chips, the fields stacked. Saving goes through recordDecisionAction → applyOp('record_decision').
 * The next date is parsed with parseDmy on the server and is required when the hearing was postponed — never guessed.
 */
import { useActionState, useState } from "react";
import { cx } from "@/components/ui";
import { formatDmy } from "@/lib/dates";
import { DECISION } from "@/lib/labels";
import { recordDecisionAction, type HearingFormState } from "./actions";
import { useDecisionNotice } from "./DecisionNotices";

const sheetInput = "h-11 w-full rounded-md border border-border bg-field px-3 text-md text-text placeholder:text-text-4 focus:border-gold focus:outline-none";

export function RecordDecision({ hearingId, caseId, hearingDate, label, compact = false, layout = "inline", onSaved, onCancel }: {
  hearingId: string;
  caseId: string;
  hearingDate: string;
  label: string;
  compact?: boolean;
  /** "sheet": open at once, larger stacked fields (the roll's decision sheet / panel) */
  layout?: "inline" | "sheet";
  onSaved?: (r: { label: string; nextDate: string | null; decision: string }) => void;
  onCancel?: () => void;
}) {
  const sheet = layout === "sheet";
  const [open, setOpen] = useState(sheet);
  // controlled, so a refused save keeps what the lawyer typed (React resets uncontrolled fields after an action)
  const [decision, setDecision] = useState("");
  const [text, setText] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [needed, setNeeded] = useState("");
  const notify = useDecisionNotice();
  const [state, action, pending] = useActionState<HearingFormState, FormData>(async (prev, fd) => {
    const r = await recordDecisionAction(prev, fd);
    // the page refreshes after saving and this row may leave the list: report to the surrounding <DecisionNotices>
    if (r?.ok) {
      if (onSaved) onSaved({ label, nextDate: r.nextDate, decision: String(fd.get("decision") ?? "") });
      else notify?.({ label, nextDate: r.nextDate });
    }
    return r;
  }, null);

  if (state?.ok) {
    if (notify || onSaved) return null;
    return (
      <p className="mt-2 rounded-md bg-good-bg px-4 py-2.5 text-base text-good" role="status">
        تم حفظ القرار.
        {state.nextDate ? <> الجلسة القادمة: <span className="num font-num font-bold">{formatDmy(state.nextDate)}</span></> : null}
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className={cx("inline-flex h-11 items-center rounded-full px-5 text-base font-bold transition",
          compact ? "-ms-1 mt-1 border border-border bg-chip text-text-2 shadow-soft hover:text-text" : "bg-primary-fill mt-3")}>
        سجّل القرار
      </button>
    );
  }

  const err = state && !state.ok ? state : null;
  const postponed = decision === "postponed";
  const hidden = (
    <>
      <input type="hidden" name="hearing_id" value={hearingId} />
      <input type="hidden" name="case_id" value={caseId} />
      <input type="hidden" name="hearing_date" value={hearingDate} />
    </>
  );

  const form = (cancel?: () => void) => (
      <form action={action} className="space-y-4">
        {hidden}
        <input type="hidden" name="decision" value={decision} />
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-text-3">القرار</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-invalid={err?.field === "decision" || undefined}>
            {Object.entries(DECISION).map(([k, v]) => {
              const on = decision === k;
              return (
                <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setDecision(k)}
                  className={cx("h-11 rounded-full px-4 text-base transition",
                    on ? "bg-primary-fill font-bold" : "border border-border bg-chip text-text-2 shadow-soft hover:text-text",
                    !on && err?.field === "decision" && "border-bad")}>
                  {v}
                </button>
              );
            })}
          </div>
        </fieldset>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-text-3">نص القرار</span>
          <input name="decision_text" value={text} onChange={(e) => setText(e.target.value)} className={sheetInput} placeholder="زي ما سمعته في الجلسة، مثلاً: أجلت لتقديم المستندات" autoComplete="off" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-text-3">الجلسة القادمة{postponed ? " (مطلوب مع التأجيل)" : ""}</span>
          <input name="next_date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} dir="ltr" inputMode="numeric" placeholder="يوم/شهر/سنة" autoComplete="off"
            aria-invalid={err?.field === "next_date" || undefined}
            className={cx(sheetInput, "num text-start", err?.field === "next_date" && "border-bad")} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-text-3">المطلوب للجلسة القادمة</span>
          <input name="next_requirements" value={needed} onChange={(e) => setNeeded(e.target.value)} className={sheetInput} placeholder="مثلاً: إعلان الخصم، تقديم أصل العقد" autoComplete="off" />
        </label>
        {err ? <p className="rounded-md bg-bad-bg px-3 py-2 text-base text-bad" role="alert">{err.error}</p> : null}
        <div className="flex items-center gap-2 pt-1">
          <button type="submit" disabled={pending} className="bg-primary-fill inline-flex h-11 flex-1 items-center justify-center rounded-full px-5 text-md font-bold transition disabled:opacity-60">
            {pending ? "جارٍ الحفظ…" : "حفظ القرار"}
          </button>
          {cancel ? (
            <button type="button" onClick={cancel} disabled={pending} className="inline-flex h-11 items-center rounded-full border border-border bg-card-2 px-5 text-md text-text-2">
              إلغاء
            </button>
          ) : null}
        </div>
      </form>
  );

  if (sheet) return form(onCancel);
  return <div className="mt-3 rounded-lg border border-border-2 bg-card-2 p-4">{form(() => setOpen(false))}</div>;
}
