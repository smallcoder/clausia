"use server";
/** Lawyer's own inline edits on hearings. Always through applyOp with MANUAL provenance (RLS-bound client). */
import { revalidatePath } from "next/cache";
import { DECISIONS } from "@/lib/tools/registry";
import { applyOp, MANUAL } from "@/lib/tools/apply";
import { parseDmy } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export type HearingFormState =
  | null
  | { ok: false; error: string; field?: "decision" | "next_date" | "date" }
  | { ok: true; nextDate: string | null; at: number };

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};

function revalidate(caseId?: string) {
  revalidatePath("/");
  revalidatePath("/hearings");
  if (caseId) revalidatePath(`/cases/${caseId}`);
}

const DB_ERRORS: [RegExp, string][] = [
  [/needs the next hearing date/, "التأجيل يحتاج تاريخ الجلسة القادمة"],
  [/must be after the hearing date/, "تاريخ الجلسة القادمة يجب أن يكون بعد تاريخ هذه الجلسة"],
  [/hearing not found/, "الجلسة غير موجودة أو لا تملك صلاحية عليها"],
];
const friendly = (m: string) => DB_ERRORS.find(([re]) => re.test(m))?.[1] ?? `تعذر الحفظ: ${m}`;

export async function recordDecisionAction(_prev: HearingFormState, fd: FormData): Promise<HearingFormState> {
  const hearing = str(fd, "hearing_id");
  const caseId = str(fd, "case_id");
  const hearingDate = str(fd, "hearing_date");
  const decision = str(fd, "decision");
  const decisionText = str(fd, "decision_text");
  const nextRaw = str(fd, "next_date");
  const nextReq = str(fd, "next_requirements");
  if (!hearing) return { ok: false, error: "الجلسة غير محددة" };
  if (!decision || !(DECISIONS as readonly string[]).includes(decision)) return { ok: false, error: "اختر القرار", field: "decision" };

  // Never guess a date: an unclear one is refused here, with the reason, before anything is saved.
  let next: ReturnType<typeof parseDmy> = null;
  if (nextRaw) {
    next = parseDmy(nextRaw);
    if (!next || next.precision !== "day") return { ok: false, error: "اكتب تاريخ الجلسة القادمة كاملًا بصيغة يوم/شهر/سنة، مثل 5/11/2026", field: "next_date" };
    if (hearingDate && next.iso <= hearingDate) return { ok: false, error: "تاريخ الجلسة القادمة يجب أن يكون بعد تاريخ هذه الجلسة", field: "next_date" };
  }
  if (decision === "postponed" && !next) return { ok: false, error: "التأجيل يحتاج تاريخ الجلسة القادمة", field: "next_date" };

  try {
    const db = await createClient();
    await applyOp(db, "record_decision", {
      hearing, decision, decision_text: decisionText, next_date: nextRaw, next_requirements: nextReq,
      quote: decisionText ?? nextReq ?? "قرار سجله المحامي يدويًا",
    }, { ...MANUAL, source_quote: decisionText ?? null });
  } catch (e) {
    return { ok: false, error: friendly((e as Error).message) };
  }
  revalidate(caseId);
  return { ok: true, nextDate: next?.iso ?? null, at: Date.now() };
}

export async function addHearingAction(_prev: HearingFormState, fd: FormData): Promise<HearingFormState> {
  const caseId = str(fd, "case_id");
  const raw = str(fd, "date");
  const purpose = str(fd, "purpose");
  if (!caseId) return { ok: false, error: "الدعوى غير محددة" };
  const d = parseDmy(raw);
  if (!raw || !d || d.precision !== "day") return { ok: false, error: "اكتب تاريخ الجلسة كاملًا بصيغة يوم/شهر/سنة، مثل 5/11/2026", field: "date" };
  try {
    const db = await createClient();
    await applyOp(db, "add_hearing", { case: caseId, date: raw, purpose, quote: purpose ?? `جلسة ${raw}` }, { ...MANUAL, source_quote: purpose ?? null });
  } catch (e) {
    return { ok: false, error: friendly((e as Error).message) };
  }
  revalidate(caseId);
  return { ok: true, nextDate: d.iso, at: Date.now() };
}
