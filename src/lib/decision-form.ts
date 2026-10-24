/**
 * The rules of the decision form, in one place for the form (what it shows), the server action (what it accepts) and the tests.
 * No server-only import and no hooks, so it runs on either side.
 *
 *  - The agenda's «محتاجة قرار» row offers five decisions: تأجيل / حجز للحكم / حكم / شطب / غير ذلك.
 *  - The next hearing date is asked (and required) only for تأجيل and حجز للحكم. It is what the lawyer types, in d/m/yyyy: an unclear date is refused
 *    with the reason, never guessed, and it must come after the date of the hearing being decided.
 *  - For the other decisions a date that was typed anyway is still checked the same way (the case-file forms offer the field for every decision).
 */
import { parseDmy } from "@/lib/dates";
import type { Database } from "@/lib/db/types";

type Decision = Database["public"]["Enums"]["hearing_decision"];

/** the choices of the agenda's inline form, in the order they are shown */
export const ROW_DECISIONS = ["postponed", "reserved_for_judgment", "judgment", "struck_off", "other"] as const satisfies readonly Decision[];
export type RowDecision = (typeof ROW_DECISIONS)[number];

/** their words in that form («غير ذلك», where the rest of the app says «قرار آخر») */
export const ROW_DECISION_LABEL: Record<RowDecision, string> = {
  postponed: "تأجيل",
  reserved_for_judgment: "حجز للحكم",
  judgment: "حكم",
  struck_off: "شطب",
  other: "غير ذلك",
};

/** the decisions that need the date of the next hearing (for a حجز it is the day the judgment is said) */
export const NEEDS_NEXT_DATE: readonly string[] = ["postponed", "reserved_for_judgment"];
export const needsNextDate = (decision: string) => NEEDS_NEXT_DATE.includes(decision);

export type DecisionCheck =
  | { ok: true; /** the next hearing date as typed, checked (ISO), or null when none was given */ next: string | null }
  | { ok: false; error: string; field: "decision" | "next_date" };

/**
 * Checks what the lawyer chose and typed before anything is saved.
 * `valid`: the decisions the caller accepts. `hearingDate`: the ISO date of the hearing being decided (the next one must be later).
 */
export function checkDecision(input: { decision?: string; nextRaw?: string; hearingDate?: string }, valid: readonly string[]): DecisionCheck {
  const { decision, nextRaw, hearingDate } = input;
  if (!decision || !valid.includes(decision)) return { ok: false, error: "اختر القرار", field: "decision" };
  let next: string | null = null;
  if (nextRaw) {
    const p = parseDmy(nextRaw);
    if (!p || p.precision !== "day") return { ok: false, error: "اكتب تاريخ الجلسة القادمة كاملًا بصيغة يوم/شهر/سنة، مثل 5/11/2026", field: "next_date" };
    if (hearingDate && p.iso <= hearingDate) return { ok: false, error: "تاريخ الجلسة القادمة يجب أن يكون بعد تاريخ هذه الجلسة", field: "next_date" };
    next = p.iso;
  }
  if (needsNextDate(decision) && !next) {
    return { ok: false, error: decision === "postponed" ? "التأجيل يحتاج تاريخ الجلسة القادمة" : "الحجز للحكم يحتاج تاريخ الجلسة القادمة", field: "next_date" };
  }
  return { ok: true, next };
}
