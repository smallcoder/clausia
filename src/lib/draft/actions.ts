"use server";
/**
 * The draft editor's server actions (PR 7). The lawyer's own session (RLS-bound client); each one is the lawyer's act, saved through applyOp with MANUAL
 * provenance (src/lib/draft/save.ts): his save, an old version made current again, a Word file opened as a draft. Nothing here calls the model.
 */
import { revalidatePath } from "next/cache";
import type { DraftBody } from "@/lib/library/types";
import { createClient, getSession } from "@/lib/supabase/server";
import { applyOp, MANUAL } from "@/lib/tools/apply";
import { importWordDraft } from "@/lib/word/import";
import { getVersionBody } from "./store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_SESSION = "انتهت الجلسة، سجّل الدخول من جديد";

export type SaveResult = { ok: true; updatedAt: string; unchanged?: boolean } | { ok: false; error: string };

/** The editor's save (autosave or the button). `expected`: the `updated_at` the editor opened; a draft changed since is refused, never overwritten. */
export async function saveDraftAction(draftId: string, body: DraftBody, expected: string | null): Promise<SaveResult> {
  if (!UUID.test(draftId)) return { ok: false, error: "المسودة غير موجودة" };
  const db = await createClient();
  if (!(await getSession(db))) return { ok: false, error: NO_SESSION };
  try {
    const r = await applyOp(db, "save_draft", { draft: draftId, body, expected }, MANUAL);
    return { ok: true, updatedAt: String(r.extra?.updated_at ?? ""), ...(r.extra?.unchanged ? { unchanged: true } : {}) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "تعذّر الحفظ" };
  }
}

/** An old version made current again, as a NEW version. */
export async function restoreVersionAction(draftId: string, versionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!UUID.test(draftId) || !UUID.test(versionId)) return { ok: false, error: "النسخة دي مش موجودة" };
  const db = await createClient();
  if (!(await getSession(db))) return { ok: false, error: NO_SESSION };
  try {
    await applyOp(db, "restore_draft_version", { draft: draftId, version: versionId }, MANUAL);
    revalidatePath("/cases", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "تعذّر الاسترجاع" };
  }
}

/** One old version's body, to look at it (read only). */
export async function loadVersionAction(draftId: string, versionId: string): Promise<{ ok: true; body: DraftBody } | { ok: false; error: string }> {
  if (!UUID.test(draftId) || !UUID.test(versionId)) return { ok: false, error: "النسخة دي مش موجودة" };
  const db = await createClient();
  if (!(await getSession(db))) return { ok: false, error: NO_SESSION };
  try {
    const body = await getVersionBody(db, draftId, versionId);
    return body ? { ok: true, body } : { ok: false, error: "النسخة دي مش موجودة" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "تعذّر فتح النسخة" };
  }
}

export type ImportState = { ok?: boolean; error?: string; draftId?: string; caseId?: string } | null;

/** «افتح ملف Word كمسودة»: the file in the form, the case in `caseId`. */
export async function importWordAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  const caseId = String(form.get("caseId") ?? "");
  if (!UUID.test(caseId)) return { error: "الدعوى غير موجودة" };
  const db = await createClient();
  if (!(await getSession(db))) return { error: NO_SESSION };
  const r = await importWordDraft(db, caseId, form);
  if (!r.ok) return { error: r.error };
  revalidatePath("/cases", "layout");
  return { ok: true, draftId: r.draftId, caseId };
}
