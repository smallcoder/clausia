import "server-only";
/**
 * The lawyer's own «تسجيل القرار»: checks the form (src/lib/decision-form.ts) and saves through applyOp('record_decision') with MANUAL provenance.
 * The one write path of every decision form (the agenda's «محتاجة قرار» rows, the roll sheet); recordDecisionAction only reads the form data and
 * calls this with the RLS-bound client. It takes `db` so the tests can give it a fake. Nothing is saved when the check refuses.
 */
import { checkDecision } from "@/lib/decision-form";
import type { Db } from "@/lib/supabase/server";
import { applyOp, MANUAL } from "@/lib/tools/apply";
import { DECISIONS } from "@/lib/tools/registry";

export type SaveDecisionResult =
  | { ok: false; error: string; field?: "decision" | "next_date" }
  | { ok: true; nextDate: string | null };

const DB_ERRORS: [RegExp, string][] = [
  [/needs the next hearing date/, "التأجيل يحتاج تاريخ الجلسة القادمة"],
  [/must be after the hearing date/, "تاريخ الجلسة القادمة يجب أن يكون بعد تاريخ هذه الجلسة"],
  [/hearing not found/, "الجلسة غير موجودة أو لا تملك صلاحية عليها"],
];
export const friendly = (m: string) => DB_ERRORS.find(([re]) => re.test(m))?.[1] ?? `تعذر الحفظ: ${m}`;

export async function saveDecision(db: Db, input: {
  hearing?: string;
  decision?: string;
  decisionText?: string;
  /** the next hearing's date as the lawyer typed it (d/m/yyyy) */
  nextRaw?: string;
  nextRequirements?: string;
  /** ISO date of the hearing being decided, to check the next one comes after it */
  hearingDate?: string;
}): Promise<SaveDecisionResult> {
  if (!input.hearing) return { ok: false, error: "الجلسة غير محددة" };
  const check = checkDecision(input, DECISIONS);
  if (!check.ok) return check;
  const { decisionText, nextRaw, nextRequirements: nextReq } = input;
  try {
    await applyOp(db, "record_decision", {
      hearing: input.hearing, decision: input.decision, decision_text: decisionText, next_date: nextRaw, next_requirements: nextReq,
      quote: decisionText ?? nextReq ?? "قرار سجله المحامي يدويًا",
    }, { ...MANUAL, source_quote: decisionText ?? null });
  } catch (e) {
    return { ok: false, error: friendly((e as Error).message) };
  }
  return { ok: true, nextDate: check.next };
}
