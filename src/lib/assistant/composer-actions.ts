"use server";
/**
 * The composer on every screen. A target says which conversation the message goes to:
 * - new:    a new general conversation (new client / case, or a question)
 * - case:   that case's own conversation
 * - thread: an existing conversation
 * The model still only proposes; nothing is saved before the lawyer confirms a card.
 */
import { revalidatePath } from "next/cache";
import { uploadDocumentAction } from "@/lib/documents/actions";
import { createClient, getSession } from "@/lib/supabase/server";
import { createGeneralThread, dropIfEmpty, getOrCreateCaseThread } from "@/lib/threads";
import { runAssistantTurn } from "./turn";

export type ComposerTarget = { kind: "new" } | { kind: "case"; caseId: string } | { kind: "thread"; threadId: string };

async function resolve(db: Awaited<ReturnType<typeof createClient>>, t: ComposerTarget, title: string) {
  if (t.kind === "thread") return t.threadId;
  if (t.kind === "case") return getOrCreateCaseThread(db, t.caseId);
  return createGeneralThread(db, title.replace(/\s+/g, " ").slice(0, 60) || "محادثة جديدة");
}

export async function composerSendAction(target: ComposerTarget, text: string): Promise<{ threadId?: string; error?: string }> {
  const msg = text.trim();
  if (!msg) return { error: "اكتب رسالتك أولًا" };
  if (msg.length > 8000) return { error: "الرسالة طويلة جدًا" };
  const db = await createClient();
  const s = await getSession(db);
  if (!s) return { error: "انتهت الجلسة، سجّل الدخول من جديد" };
  const threadId = await resolve(db, target, msg);
  try {
    await runAssistantTurn(db, { threadId, userText: msg, userId: s.user.id, officeId: s.officeId });
  } catch (e) {
    // the message never got in: no empty new thread; the composer keeps the text
    if (target.kind === "new" && (await dropIfEmpty(db, threadId))) return { error: e instanceof Error ? e.message : "تعذّر الإرسال" };
    // otherwise the lawyer's message is saved; the thread shows it and lets them retry
  }
  revalidatePath(`/chat/${threadId}`);
  return { threadId };
}

export async function composerUploadAction(target: ComposerTarget, form: FormData): Promise<{ threadId?: string; error?: string }> {
  const db = await createClient();
  const s = await getSession(db);
  if (!s) return { error: "انتهت الجلسة، سجّل الدخول من جديد" };
  const file = form.get("file");
  const threadId = await resolve(db, target, file instanceof File ? file.name : "مستند جديد");
  form.set("threadId", threadId);
  if (target.kind === "case") form.set("caseId", target.caseId);
  const r = await uploadDocumentAction(form);
  if (!r.ok && !r.warning) {
    // a failed upload into a brand-new conversation must not leave an empty thread behind
    if (target.kind === "new" && (await dropIfEmpty(db, threadId))) return { error: r.error ?? "تعذّر رفع الملف" };
    return { threadId, error: r.error };
  }
  revalidatePath(`/chat/${threadId}`);
  return { threadId };
}
