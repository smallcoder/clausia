"use client";
/**
 * «تسجيل القرار». Open at once, two layouts of the same form; saving goes through recordDecisionAction → applyOp('record_decision'), MANUAL provenance.
 *  - "sheet" (the roll sheet): all the decisions as chips, the decision text, the next date, what is required.
 *  - "row" (the agenda's «محتاجة قرار» rows): five decisions (تأجيل / حجز للحكم / حكم / شطب / غير ذلك); the next date only for تأجيل and حجز للحكم, and
 *    it is required there; what is required next; the decision text only for «غير ذلك».
 * The date is what the lawyer types (d/m/yyyy); an unclear one is refused on the server with the reason, never guessed (src/lib/decision-form.ts).
 * `onSaved` tells the surrounding list; nothing is saved without the tap on «حفظ القرار».
 */
import { useActionState, useState } from "react";
import { cx } from "@/components/ui";
import { needsNextDate, ROW_DECISION_LABEL, ROW_DECISIONS } from "@/lib/decision-form";
import { DECISION } from "@/lib/labels";
import { recordDecisionAction, type HearingFormState } from "./actions";

const sheetInput = "h-11 w-full rounded-md border border-border bg-field px-3 text-md text-text placeholder:text-text-4";

export function RecordDecision({ hearingId, caseId, hearingDate, label, layout = "sheet", cancelLabel = "إلغاء", onSaved, onCancel }: {
  hearingId: string;
  caseId: string;
  hearingDate: string;
  label: string;
  layout?: "sheet" | "row";
  /** the text of the button next to «حفظ القرار» */
  cancelLabel?: string;
  onSaved: (r: { label: string; nextDate: string | null; decision: string }) => void;
  onCancel?: () => void;
}) {
  const row = layout === "row";
  // controlled, so a refused save keeps what the lawyer typed (React resets uncontrolled fields after an action)
  const [decision, setDecision] = useState("");
  const [text, setText] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [needed, setNeeded] = useState("");
  const [state, action, pending] = useActionState<HearingFormState, FormData>(async (prev, fd) => {
    const r = await recordDecisionAction(prev, fd);
    if (r?.ok) onSaved({ label, nextDate: r.nextDate, decision: String(fd.get("decision") ?? "") });
    return r;
  }, null);

  if (state?.ok) return null; // the list that listens (onSaved) shows the result

  const err = state && !state.ok ? state : null;
  const askDate = row ? needsNextDate(decision) : true;
  const dateRequired = needsNextDate(decision);
  const choices: [string, string][] = row ? ROW_DECISIONS.map((k) => [k, ROW_DECISION_LABEL[k]]) : Object.entries(DECISION);
  const showText = row ? decision === "other" : true;
  const chip = row ? "h-chip px-3.5 text-sm" : "h-11 px-4 text-base";

  return (
    <form action={action} className={row ? "space-y-3.5" : "space-y-4"}>
      <input type="hidden" name="hearing_id" value={hearingId} />
      <input type="hidden" name="case_id" value={caseId} />
      <input type="hidden" name="hearing_date" value={hearingDate} />
      <input type="hidden" name="decision" value={decision} />
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-text-3">القرار</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-invalid={err?.field === "decision" || undefined}>
          {choices.map(([k, v]) => {
            const on = decision === k;
            return (
              <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setDecision(k)}
                className={cx("rounded-full transition", chip,
                  on ? "pill-on" : "border border-border bg-chip text-text-2 shadow-soft hover:text-text",
                  !on && err?.field === "decision" && "border-bad")}>
                {v}
              </button>
            );
          })}
        </div>
      </fieldset>
      {showText ? (
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-text-3">{row ? "نص القرار (اختياري)" : "نص القرار"}</span>
          <input name="decision_text" value={text} onChange={(e) => setText(e.target.value)} className={sheetInput} placeholder="زي ما سمعته في الجلسة، مثلاً: أجلت لتقديم المستندات" autoComplete="off" />
        </label>
      ) : null}
      <div className={cx(row && askDate && "grid gap-3.5 sm:grid-cols-2")}>
        {askDate ? (
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-text-3">الجلسة القادمة{dateRequired ? " (مطلوب)" : ""}</span>
            <input name="next_date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} dir="ltr" inputMode="numeric" placeholder="يوم/شهر/سنة" autoComplete="off"
              aria-invalid={err?.field === "next_date" || undefined}
              className={cx(sheetInput, "num text-start", err?.field === "next_date" && "border-bad")} />
          </label>
        ) : null}
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-text-3">المطلوب للجلسة القادمة</span>
          <input name="next_requirements" value={needed} onChange={(e) => setNeeded(e.target.value)} className={sheetInput} placeholder="مثلاً: إعلان الخصم، تقديم أصل العقد" autoComplete="off" />
        </label>
      </div>
      {err ? <p className="rounded-md bg-bad-bg px-3 py-2 text-base text-bad" role="alert">{err.error}</p> : null}
      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={pending} className={cx("bg-primary-fill inline-flex h-11 items-center justify-center rounded-full px-5 text-md font-bold transition disabled:opacity-60", !row && "flex-1")}>
          {pending ? "جارٍ الحفظ…" : "حفظ القرار"}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} disabled={pending} className="inline-flex h-11 items-center rounded-full border border-border bg-card-2 px-5 text-md text-text-2">
            {cancelLabel}
          </button>
        ) : null}
      </div>
    </form>
  );
}
