"use server";
/**
 * Lawyer's own inline edits on hearings. Always through applyOp with MANUAL provenance (RLS-bound client).
 * Plus one read: hearingsRangeAction, the roll day strip's loader.
 */
import { revalidatePath } from "next/cache";
import { applyOp, MANUAL } from "@/lib/tools/apply";
import { parseDmy } from "@/lib/dates";
import { deadlinesInRange } from "@/lib/deadlines/roll";
import type { RollDeadline } from "@/lib/deadlines/types";
import { hearingsInRange, type HearingWithCase } from "@/lib/hearings";
import { friendly, saveDecision } from "@/lib/hearing-decision";
import { createClient } from "@/lib/supabase/server";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** The day strip asks for a few weeks at a time; anything wider is refused. */
const MAX_RANGE_DAYS = 70;

/**
 * Hearings with from ≤ date ≤ to (ISO), the same rows as the roll's first render, for the day strip's client cache.
 * Read-only and RLS-bound (a lawyer only gets their own office's hearings). A bad or too-wide range is refused.
 */
export async function hearingsRangeAction(from: string, to: string): Promise<{ hearings: HearingWithCase[]; deadlines: RollDeadline[] }> {
  const a = typeof from === "string" && ISO_DAY.test(from) ? parseDmy(from) : null;
  const b = typeof to === "string" && ISO_DAY.test(to) ? parseDmy(to) : null;
  if (!a || !b || a.iso > b.iso) throw new Error("bad range");
  if ((Date.parse(b.iso) - Date.parse(a.iso)) / 86_400_000 > MAX_RANGE_DAYS) throw new Error("range too wide");
  const db = await createClient();
  // the saved appeal deadlines (last days and reminders) ride along; none with the flag off
  const [hearings, deadlines] = await Promise.all([hearingsInRange(db, a.iso, b.iso), deadlinesInRange(db, a.iso, b.iso)]);
  return { hearings, deadlines };
}

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
  revalidatePath("/agenda");
  if (caseId) revalidatePath(`/cases/${caseId}`);
}

export async function recordDecisionAction(_prev: HearingFormState, fd: FormData): Promise<HearingFormState> {
  const caseId = str(fd, "case_id");
  const db = await createClient();
  // the rules (which decision needs a date, an unclear date refused) and the one write (applyOp, MANUAL) are in src/lib/hearing-decision.ts
  const r = await saveDecision(db, {
    hearing: str(fd, "hearing_id"), decision: str(fd, "decision"), decisionText: str(fd, "decision_text"),
    nextRaw: str(fd, "next_date"), nextRequirements: str(fd, "next_requirements"), hearingDate: str(fd, "hearing_date"),
  });
  if (!r.ok) return r;
  revalidate(caseId);
  revalidatePath("/", "layout"); // the sidebar's badge counts the hearings without a decision
  return { ok: true, nextDate: r.nextDate, at: Date.now() };
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
