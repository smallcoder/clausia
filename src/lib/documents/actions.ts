"use server";
/**
 * Document server actions (RLS-bound client only).
 * uploadDocumentAction — from the chat composer or the case Documents tab.
 * setDocumentTypeAction — the lawyer's own inline edit of a document's type (no proposal: it is the lawyer typing).
 */
import { revalidatePath } from "next/cache";
import { createClient, getSession } from "@/lib/supabase/server";
import { createGeneralThread, getOrCreateCaseThread } from "@/lib/threads";
import { DOC_TYPES } from "@/lib/tools/registry";
import { ALLOWED_MIME, MAX_BYTES, safeFileName } from "./files";
import { processDocument } from "./process";

/**
 * Upload one file (PDF or phone photo) from the chat composer or the case Documents tab.
 * FormData: file (File), threadId (string, optional), caseId (string, optional).
 * Saves the file to Storage + a documents row, reads every page (document_pages), then posts ONE assistant
 * message into the thread with a confirmation card (proposal) of the extracted parties/facts/requests/arguments.
 */
export async function uploadDocumentAction(formData: FormData): Promise<{ ok: boolean; documentId?: string; proposalId?: string | null; error?: string }> {
  const db = await createClient();
  const session = await getSession(db);
  if (!session) return { ok: false, error: "انتهت الجلسة، سجّل الدخول مرة أخرى" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "لم يُرفق ملف" };
  if (!ALLOWED_MIME.includes(file.type)) return { ok: false, error: "نوع الملف غير مدعوم. ارفع PDF أو صورة (JPEG / PNG / WebP)" };
  if (file.size > MAX_BYTES) return { ok: false, error: "حجم الملف أكبر من 25 ميجابايت" };

  const fromThread = typeof formData.get("threadId") === "string" && formData.get("threadId") !== "";
  let threadId = fromThread ? String(formData.get("threadId")) : null;
  let caseId = typeof formData.get("caseId") === "string" && formData.get("caseId") !== "" ? String(formData.get("caseId")) : null;

  try {
    if (threadId) {
      const { data: t } = await db.from("chat_threads").select("id, case_id").eq("id", threadId).maybeSingle();
      if (!t) return { ok: false, error: "المحادثة غير موجودة" };
      caseId = caseId ?? t.case_id;
    } else if (caseId) {
      const { data: c } = await db.from("cases").select("id").eq("id", caseId).maybeSingle();
      if (!c) return { ok: false, error: "الدعوى غير موجودة" };
      threadId = await getOrCreateCaseThread(db, caseId);
    } else {
      threadId = await createGeneralThread(db, file.name.slice(0, 80));
    }

    const documentId = crypto.randomUUID();
    const storagePath = `${session.officeId}/${documentId}/${safeFileName(file.name, file.type)}`;
    const up = await db.storage.from("documents").upload(storagePath, file, { contentType: file.type, upsert: false });
    if (up.error) return { ok: false, error: `تعذر رفع الملف: ${up.error.message}` };

    const { data: msg, error: me } = await db.from("chat_messages").insert({
      thread_id: threadId, role: "user", content: `أرفقتُ مستندًا: ${file.name}`,
      attachments: [{ document_id: documentId, file_name: file.name }],
    }).select("id").single();
    if (me) throw new Error(me.message);

    const { error: de } = await db.from("documents").insert({
      id: documentId, thread_id: threadId, case_id: caseId, storage_path: storagePath,
      file_name: file.name, mime_type: file.type, size_bytes: file.size,
      doc_type: "other", read_status: "pending",
      source_kind: fromThread ? "chat" : "manual", source_message_id: msg.id,
    });
    if (de) {
      await db.storage.from("documents").remove([storagePath]);
      throw new Error(de.message);
    }

    const r = await processDocument(db, documentId, { threadId });
    revalidatePath(`/chat/${threadId}`);
    if (caseId) revalidatePath(`/cases/${caseId}`);
    if (r.error && r.pageCount === 0) return { ok: false, documentId, proposalId: null, error: "تعذرت قراءة المستند" };
    return { ok: true, documentId, proposalId: r.proposalId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Inline change of a document's type by the lawyer. */
export async function setDocumentTypeAction(documentId: string, docType: string): Promise<{ ok: boolean; error?: string }> {
  if (!(DOC_TYPES as readonly string[]).includes(docType)) return { ok: false, error: "نوع غير معروف" };
  const db = await createClient();
  const { data, error } = await db.from("documents").update({ doc_type: docType as (typeof DOC_TYPES)[number] }).eq("id", documentId).select("case_id").maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? "المستند غير موجود" };
  if (data.case_id) revalidatePath(`/cases/${data.case_id}`);
  return { ok: true };
}
