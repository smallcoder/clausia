"use server";
// «ورق المكتب»: the lawyer uploads any Word file from his work (first time, or to replace the old one). RLS-bound; see src/lib/word/upload.ts.
import { revalidatePath } from "next/cache";
import { createClient, getSession } from "@/lib/supabase/server";
import { saveOfficeStyle } from "@/lib/word/upload";

export type UploadState = { ok?: boolean; error?: string; note?: string } | null;

export async function uploadOfficeStyleAction(_prev: UploadState, form: FormData): Promise<UploadState> {
  const db = await createClient();
  const session = await getSession(db);
  if (!session) return { error: "انتهت الجلسة، سجّل الدخول مرة أخرى" };
  const r = await saveOfficeStyle(db, session.officeId, form);
  if (!r.ok) return { error: r.error };
  revalidatePath("/settings/office-style");
  revalidatePath("/cases", "layout");
  revalidatePath("/receipts", "layout");
  return { ok: true, note: r.note };
}
