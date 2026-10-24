"use server";
// «+ ارفع صيغة مكتبك»: the lawyer uploads a Word file with {{placeholders}} as one of the office's own templates. RLS-bound; see src/lib/word/upload.ts.
import { revalidatePath } from "next/cache";
import { createClient, getSession } from "@/lib/supabase/server";
import { saveOfficeTemplate } from "@/lib/word/upload";

export type TemplateUploadState = { ok?: boolean; error?: string; note?: string } | null;

export async function uploadTemplateAction(_prev: TemplateUploadState, form: FormData): Promise<TemplateUploadState> {
  const db = await createClient();
  const session = await getSession(db);
  if (!session) return { error: "انتهت الجلسة، سجّل الدخول مرة أخرى" };
  const r = await saveOfficeTemplate(db, session.officeId, form);
  if (!r.ok) return { error: r.error };
  revalidatePath("/library");
  return { ok: true, note: r.note };
}
