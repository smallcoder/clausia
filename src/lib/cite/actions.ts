"use server";
/**
 * «Source to the sentence»: the text of a paper's pages for the side panel. RLS-bound client (the lawyer's own
 * session): a paper of another office, or a made-up id, is simply not found. The span is NOT looked up here — the
 * panel uses the stored span, or finds the quote with the code matcher (src/lib/quote-match.ts); no model is called.
 */
import { createClient, getSession } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CitePaper {
  fileName: string;
  image: boolean;
  /** index 0 = page 1; a page that was not read is "" */
  pages: string[];
}

export async function loadCitePaper(documentId: string): Promise<{ ok: true; paper: CitePaper } | { ok: false; error: string }> {
  if (!UUID.test(documentId)) return { ok: false, error: "الورقة مش موجودة" };
  const db = await createClient();
  const s = await getSession(db);
  if (!s) return { ok: false, error: "انتهت الجلسة، سجّل الدخول من جديد" };
  const { data: doc } = await db.from("documents").select("id, file_name, mime_type, page_count").eq("id", documentId).maybeSingle();
  if (!doc) return { ok: false, error: "الورقة مش موجودة" };
  const { data: rows, error } = await db.from("document_pages").select("page_no, text").eq("document_id", documentId).order("page_no");
  if (error) return { ok: false, error: "تعذّر فتح الورقة" };
  const total = Math.max(doc.page_count ?? 0, ...(rows ?? []).map((r) => r.page_no));
  const pages = Array.from({ length: total }, () => "");
  for (const r of rows ?? []) if (r.page_no >= 1) pages[r.page_no - 1] = r.text;
  return { ok: true, paper: { fileName: doc.file_name, image: doc.mime_type.startsWith("image/"), pages } };
}
