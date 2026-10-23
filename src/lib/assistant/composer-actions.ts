"use server";
/**
 * The chat panel's composer, for a session that does not exist yet (the first message makes it).
 * A new session belongs to a context: the general one (no case), a case, or one hearing of a case.
 * Existing sessions send through sendMessageAction (optimistic). The model still only proposes;
 * nothing is saved before the lawyer confirms a card.
 */
import { revalidatePath } from "next/cache";
import { uploadDocumentAction } from "@/lib/documents/actions";
import { createClient, getSession } from "@/lib/supabase/server";
import { createThread, dropNewIfEmpty, titleFrom } from "@/lib/threads";
import { cleanAsk } from "./ask";
import { parseMode } from "./modes";
import { stepRecorder } from "./steps";
import { runAssistantTurn } from "./turn";

export type NewSessionTarget = { caseId?: string | null; hearingId?: string | null };

/** `turnId`: the browser's id for this turn, for the live steps (see sendMessageAction). */
export async function composerSendAction(target: NewSessionTarget, text: string, mode?: string, context?: unknown, turnId?: string): Promise<{ threadId?: string; error?: string }> {
  const msg = text.trim();
  if (!msg) return { error: "اكتب رسالتك أولًا" };
  if (msg.length > 8000) return { error: "الرسالة طويلة جدًا" };
  const db = await createClient();
  const s = await getSession(db);
  if (!s) return { error: "انتهت الجلسة، سجّل الدخول من جديد" };
  let threadId: string;
  try {
    // a hearing's session is labelled by its date; any other new session by the lawyer's first words
    threadId = await createThread(db, { caseId: target.caseId, hearingId: target.hearingId, title: target.hearingId ? null : titleFrom(msg) });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "تعذّر بدء المحادثة" };
  }
  const steps = stepRecorder(db, turnId);
  try {
    await runAssistantTurn(db, { threadId, userText: msg, userId: s.user.id, officeId: s.officeId, mode: parseMode(mode), context: cleanAsk(context) }, { onStep: steps.onStep });
  } catch (e) {
    // the message never got in: no empty session; the composer keeps the text
    if (await dropNewIfEmpty(db, threadId)) return { error: e instanceof Error ? e.message : "تعذّر الإرسال" };
    // otherwise the lawyer's message is saved; the thread shows it and lets them retry
  } finally {
    await steps.finish();
  }
  revalidatePath("/", "layout");
  return { threadId };
}

export async function composerUploadAction(target: NewSessionTarget, form: FormData): Promise<{ threadId?: string; error?: string }> {
  const db = await createClient();
  const s = await getSession(db);
  if (!s) return { error: "انتهت الجلسة، سجّل الدخول من جديد" };
  const file = form.get("file");
  let threadId: string;
  try {
    threadId = await createThread(db, { caseId: target.caseId, hearingId: target.hearingId, title: target.hearingId ? null : file instanceof File ? file.name.slice(0, 40) : "مستند جديد" });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "تعذّر بدء المحادثة" };
  }
  form.set("threadId", threadId);
  if (target.caseId) form.set("caseId", target.caseId);
  const r = await uploadDocumentAction(form);
  if (!r.ok && !r.warning) {
    // a failed upload into a brand-new session must not leave an empty session behind
    if (await dropNewIfEmpty(db, threadId)) return { error: r.error ?? "تعذّر رفع الملف" };
    return { threadId, error: r.error };
  }
  revalidatePath("/", "layout");
  return { threadId };
}
