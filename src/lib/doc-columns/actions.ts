"use server";
/** «+ عمود جديد»: the lawyer's question, asked of every paper of the case. RLS-bound client (the lawyer's own session). */
import { revalidatePath } from "next/cache";
import { docsTableEnabled } from "@/lib/flags";
import { LlmUnavailableError, SpendCapError } from "@/lib/llm";
import { UNAVAILABLE_TEXT } from "@/lib/llm/unavailable";
import { createClient, getSession } from "@/lib/supabase/server";
import type { EditState } from "@/app/(app)/cases/actions";
import { confirmCell, editCell, removeColumn, renameColumn, type EditResult } from "./edit";
import { ColumnError, proposeDocColumn } from "./run";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `failed`: how many papers could not be asked (they get no cell). The card itself is read from the page. */
export async function askColumnAction(caseId: string, question: string): Promise<{ ok: boolean; error?: string; failed?: number }> {
  if (!docsTableEnabled()) return { ok: false, error: "الميزة دي لسه مش متاحة" }; // behind the flag (src/lib/flags.ts)
  if (!UUID.test(caseId)) return { ok: false, error: "الدعوى مش موجودة" };
  const db = await createClient();
  const s = await getSession(db);
  if (!s) return { ok: false, error: "انتهت الجلسة، سجّل الدخول من جديد" };
  const { data: c } = await db.from("cases").select("id").eq("id", caseId).maybeSingle();
  if (!c) return { ok: false, error: "الدعوى مش موجودة" };
  try {
    const r = await proposeDocColumn(db, { caseId, question, userId: s.user.id, officeId: s.officeId });
    revalidatePath(`/cases/${caseId}`);
    return { ok: true, failed: r.failed.length };
  } catch (e) {
    if (e instanceof ColumnError) return { ok: false, error: e.message };
    if (e instanceof SpendCapError) return { ok: false, error: "مش هقدر أرد دلوقتي: وصلنا لحد الصرف التجريبي." };
    if (e instanceof LlmUnavailableError) return { ok: false, error: UNAVAILABLE_TEXT };
    console.error(`[doc-columns] ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, error: "حصلت مشكلة وأنا بجهّز العمود. جرّب تاني." };
  }
}

// ---------- the lawyer's own edits of a saved column (issue #61): direct taps, RLS client, never the model ----------

function str(f: FormData, k: string) {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
}

/** run one edit with the lawyer's own session, then refresh the case page */
async function run(id: string, edit: (db: Awaited<ReturnType<typeof createClient>>) => Promise<EditResult>): Promise<EditState> {
  if (!UUID.test(id)) return { error: "طلب غير صالح" };
  const db = await createClient();
  if (!(await getSession(db))) return { error: "انتهت الجلسة، سجّل الدخول من جديد" };
  const r = await edit(db);
  if (!r.ok) return { error: r.error };
  revalidatePath(`/cases/${r.caseId}`);
  return { ok: true };
}

/** the column's title (form: column_id, value) */
export async function renameColumnAction(_prev: EditState, form: FormData): Promise<EditState> {
  const id = str(form, "column_id");
  return run(id, (db) => renameColumn(db, id, str(form, "value")));
}

/** a cell's answer wording (form: cell_id, value); the cell becomes the lawyer's */
export async function editCellAction(_prev: EditState, form: FormData): Promise<EditState> {
  const id = str(form, "cell_id");
  return run(id, (db) => editCell(db, id, str(form, "value")));
}

/** one tap on a suggested cell (form: cell_id) */
export async function confirmCellAction(form: FormData): Promise<void> {
  const id = str(form, "cell_id");
  await run(id, (db) => confirmCell(db, id));
}

/** the confirm step's button (form: column_id, confirm = "yes"): without the «yes» nothing is deleted */
export async function removeColumnAction(_prev: EditState, form: FormData): Promise<EditState> {
  const id = str(form, "column_id");
  return run(id, (db) => removeColumn(db, id, str(form, "confirm") === "yes"));
}
