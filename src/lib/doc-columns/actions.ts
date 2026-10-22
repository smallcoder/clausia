"use server";
/** «+ عمود جديد»: the lawyer's question, asked of every paper of the case. RLS-bound client (the lawyer's own session). */
import { revalidatePath } from "next/cache";
import { docsTableEnabled } from "@/lib/flags";
import { LlmUnavailableError, SpendCapError } from "@/lib/llm";
import { UNAVAILABLE_TEXT } from "@/lib/llm/unavailable";
import { createClient, getSession } from "@/lib/supabase/server";
import { ColumnError, proposeDocColumn } from "./run";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `failed`: how many papers could not be asked (they get no cell). The card itself is read from the page. */
export async function askColumnAction(caseId: string, question: string): Promise<{ ok: boolean; error?: string; failed?: number }> {
  if (!docsTableEnabled()) return { ok: false, error: "الميزة دي لسه مش متاحة" }; // behind the flag until issue #61 is merged
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
