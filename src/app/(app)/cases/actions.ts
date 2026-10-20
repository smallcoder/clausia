"use server";
// Lawyer actions on the case pages: confirm / reject a suggested item, small inline edits.
// RLS-bound client only; every write is the lawyer's own tap (not the model's).
import { revalidatePath } from "next/cache";
import { parseDmy } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

const ITEM_TABLES = ["case_parties", "case_facts", "case_requests", "case_arguments", "judgments", "hearings"] as const;
type ItemTable = (typeof ITEM_TABLES)[number];
const TEXT_TABLES = ["case_facts", "case_requests", "case_arguments"] as const;
type TextTable = (typeof TEXT_TABLES)[number];

export type EditState = { ok?: boolean; error?: string } | null;

function str(f: FormData, k: string) {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
}

/** Confirm or reject a suggested item. */
export async function reviewItem(form: FormData): Promise<void> {
  const table = str(form, "table") as ItemTable;
  const id = str(form, "id");
  const status = str(form, "status");
  const caseId = str(form, "case_id");
  if (!ITEM_TABLES.includes(table) || !id || (status !== "confirmed" && status !== "rejected")) return;
  const db = await createClient();
  await db.from(table).update({ review_status: status }).eq("id", id).eq("review_status", "suggested");
  revalidatePath(`/cases/${caseId}`);
}

/** Edit the text of a fact / request / argument. Provenance stays; an edited suggested item stays suggested until confirmed. */
export async function editItemText(_prev: EditState, form: FormData): Promise<EditState> {
  const table = str(form, "table") as TextTable;
  const id = str(form, "id");
  const text = str(form, "value");
  const caseId = str(form, "case_id");
  if (!TEXT_TABLES.includes(table) || !id) return { error: "طلب غير صالح" };
  if (!text) return { error: "النص لا يمكن أن يكون فارغًا" };
  const db = await createClient();
  const { error, data } = await db.from(table).update({ text }).eq("id", id).select("id");
  if (error || !data?.length) return { error: "تعذر الحفظ" };
  revalidatePath(`/cases/${caseId}`);
  return { ok: true };
}

const STATUSES = ["active", "reserved_for_judgment", "judged", "suspended", "closed"] as const;

/** Small inline edit of one case field. facts_date is written as d/m/yyyy, m/yyyy or yyyy; unclear → refused, never guessed. */
export async function editCaseField(_prev: EditState, form: FormData): Promise<EditState> {
  const caseId = str(form, "case_id");
  const field = str(form, "field");
  const value = str(form, "value");
  if (!caseId) return { error: "طلب غير صالح" };
  const db = await createClient();
  let patch: { status?: (typeof STATUSES)[number]; circuit?: string | null; case_type?: string | null; facts_date?: string | null; facts_date_precision?: "day" | "month" | "year" | "unknown" };
  switch (field) {
    case "status":
      if (!(STATUSES as readonly string[]).includes(value)) return { error: "حالة غير معروفة" };
      patch = { status: value as (typeof STATUSES)[number] };
      break;
    case "circuit":
      patch = { circuit: value || null };
      break;
    case "case_type":
      patch = { case_type: value || null };
      break;
    case "facts_date": {
      if (!value) { patch = { facts_date: null, facts_date_precision: "unknown" }; break; }
      const p = parseDmy(value);
      if (!p) return { error: "اكتب التاريخ بصيغة يوم/شهر/سنة، أو شهر/سنة، أو السنة فقط" };
      patch = { facts_date: p.iso, facts_date_precision: p.precision };
      break;
    }
    default:
      return { error: "حقل غير قابل للتعديل" };
  }
  const { error, data } = await db.from("cases").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", caseId).select("id");
  if (error || !data?.length) return { error: "تعذر الحفظ" };
  revalidatePath(`/cases/${caseId}`);
  return { ok: true };
}
