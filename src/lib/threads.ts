import "server-only";
/** Chat threads: one per case (case_id set) plus general threads (case_id null) for new clients / cases. */
import type { Db } from "@/lib/supabase/server";

export async function getOrCreateCaseThread(db: Db, caseId: string): Promise<string> {
  const { data: found } = await db.from("chat_threads").select("id").eq("case_id", caseId).order("created_at").limit(1).maybeSingle();
  if (found) return found.id;
  const { data: c } = await db.from("cases").select("title, case_number, case_year").eq("id", caseId).single();
  const title = c?.case_number ? `الدعوى ${c.case_number}${c.case_year ? ` لسنة ${c.case_year}` : ""}` : c?.title ?? null;
  const { data, error } = await db.from("chat_threads").insert({ case_id: caseId, title }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function createGeneralThread(db: Db, title?: string | null): Promise<string> {
  const { data, error } = await db.from("chat_threads").insert({ case_id: null, title: title ?? "محادثة جديدة" }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}
