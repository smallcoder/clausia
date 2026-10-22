/**
 * The lawyer's own edits of the documents table's custom columns (issue #61). Direct actions from the screen, not model
 * proposals: the model never calls these. Each takes `db`, the lawyer's RLS-bound client, so a column or a cell of another
 * office is simply not found (RLS hides it), and scripts can call them. The server actions in ./actions.ts are thin wrappers.
 *
 *   renameColumn  the column's title (the question it was asked with stays as it was)
 *   editCell      the wording of a cell's answer. The cell becomes the lawyer's (created_by_kind 'lawyer', confirmed); its page,
 *                 quote and span are kept. Only a cell that has an answer: an answer needs a page and a quote (table check
 *                 doc_column_cells_answer_source_ck), and a «مش مذكور» cell has none.
 *   confirmCell   a suggested cell becomes confirmed (one tap). When no cell of a suggested column is left suggested, the column
 *                 is confirmed too (its «مقترح» mark goes)
 *   removeColumn  deletes the column; its cells go with it (on delete cascade). Refused unless `confirmed` is true: the screen
 *                 sets it only from the confirm step's button.
 */
import type { Db } from "@/lib/supabase/server";

export type EditResult = { ok: true; caseId: string } | { ok: false; error: string };
const fail = (error: string): EditResult => ({ ok: false, error });

export const MAX_TITLE = 80;
export const MAX_CELL_ANSWER = 600;
const NO_COLUMN = "العمود مش موجود";
const NO_CELL = "الخانة مش موجودة";
const SAVE_FAILED = "تعذر الحفظ";

/** the column's case, or null when the column is not there for this lawyer (not found, or another office's) */
async function columnCase(db: Db, columnId: string): Promise<string | null> {
  const { data } = await db.from("doc_columns").select("case_id").eq("id", columnId).maybeSingle();
  return data?.case_id ?? null;
}

/** the cell's column, case and whether it has an answer, or null when the cell is not there for this lawyer */
async function cell(db: Db, cellId: string): Promise<{ columnId: string; caseId: string; hasAnswer: boolean } | null> {
  const { data } = await db.from("doc_column_cells").select("column_id, answer, doc_columns(case_id)").eq("id", cellId).maybeSingle();
  const col = Array.isArray(data?.doc_columns) ? data?.doc_columns[0] : data?.doc_columns;
  return data && col ? { columnId: data.column_id, caseId: col.case_id, hasAnswer: data.answer !== null } : null;
}

/** a column saved as suggestions becomes confirmed when none of its cells is still suggested (its «مقترح» mark goes) */
async function settleColumn(db: Db, columnId: string): Promise<void> {
  const { data } = await db.from("doc_column_cells").select("id").eq("column_id", columnId).eq("review_status", "suggested").limit(1);
  if (!data?.length) await db.from("doc_columns").update({ review_status: "confirmed" }).eq("id", columnId).eq("review_status", "suggested");
}

export async function renameColumn(db: Db, columnId: string, title: string): Promise<EditResult> {
  const t = title.replace(/\s+/g, " ").trim();
  if (!t) return fail("اكتب اسم العمود");
  if (t.length > MAX_TITLE) return fail("الاسم طويل، اختصره");
  const caseId = await columnCase(db, columnId);
  if (!caseId) return fail(NO_COLUMN);
  const { error, data } = await db.from("doc_columns").update({ title: t }).eq("id", columnId).select("id");
  return error || !data?.length ? fail(SAVE_FAILED) : { ok: true, caseId };
}

export async function editCell(db: Db, cellId: string, answer: string): Promise<EditResult> {
  const a = answer.trim();
  if (!a) return fail("اكتب الإجابة");
  if (a.length > MAX_CELL_ANSWER) return fail("الإجابة طويلة، اختصرها");
  const c = await cell(db, cellId);
  if (!c) return fail(NO_CELL);
  if (!c.hasAnswer) return fail("الخانة دي «مش مذكور»، ومفيش جملة من الورقة تسند إجابة جديدة");
  // the lawyer's wording; the page, quote and span stay (they are where the paper says it)
  const { error, data } = await db.from("doc_column_cells")
    .update({ answer: a, created_by_kind: "lawyer", review_status: "confirmed" }).eq("id", cellId).not("answer", "is", null).select("id");
  if (error || !data?.length) return fail(SAVE_FAILED);
  await settleColumn(db, c.columnId);
  return { ok: true, caseId: c.caseId };
}

export async function confirmCell(db: Db, cellId: string): Promise<EditResult> {
  const c = await cell(db, cellId);
  if (!c) return fail(NO_CELL);
  const { error } = await db.from("doc_column_cells").update({ review_status: "confirmed" }).eq("id", cellId).eq("review_status", "suggested");
  if (error) return fail(SAVE_FAILED);
  await settleColumn(db, c.columnId);
  return { ok: true, caseId: c.caseId };
}

export async function removeColumn(db: Db, columnId: string, confirmed: boolean): Promise<EditResult> {
  if (confirmed !== true) return fail("لازم تأكد قبل ما تمسح العمود");
  const caseId = await columnCase(db, columnId);
  if (!caseId) return fail(NO_COLUMN);
  const { error, data } = await db.from("doc_columns").delete().eq("id", columnId).select("id");
  return error || !data?.length ? fail("تعذر المسح") : { ok: true, caseId };
}
