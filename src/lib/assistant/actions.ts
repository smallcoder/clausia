"use server";
/** Server actions for the chat UI and the confirmation card (RLS-bound client; the lawyer's own session). */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { decideProposal, type Proposal } from "@/lib/proposals";
import { createClient, getSession } from "@/lib/supabase/server";
import { createGeneralThread, dropIfEmpty } from "@/lib/threads";
import { runAssistantTurn, TurnError } from "./turn";

/** `saved`: the lawyer's message is in the thread (so the UI must not put it back in the composer). */
export async function sendMessageAction(threadId: string, text: string): Promise<{ ok: boolean; error?: string; saved?: boolean }> {
  const db = await createClient();
  const s = await getSession(db);
  if (!s) return { ok: false, error: "انتهت الجلسة، سجّل الدخول من جديد" };
  if (!text.trim()) return { ok: false, error: "الرسالة فارغة" };
  if (text.length > 8000) return { ok: false, error: "الرسالة طويلة جدًا" };
  try {
    const r = await runAssistantTurn(db, { threadId, userText: text, userId: s.user.id, officeId: s.officeId });
    revalidatePath(`/chat/${threadId}`);
    // an LLM failure already left a friendly assistant message in the thread: no second error in the composer
    if (r.error && !r.assistantMessageIds.length) return { ok: false, error: "تعذّر رد Clausia", saved: true };
    return { ok: true, saved: true };
  } catch (e) {
    const saved = e instanceof TurnError && e.userMessageSaved;
    if (saved) revalidatePath(`/chat/${threadId}`);
    return { ok: false, error: e instanceof Error ? e.message : "تعذّر الإرسال", saved };
  }
}

export async function decideProposalAction(
  proposalId: string,
  decision: { mode: "confirm" | "suggest" | "reject"; opIds?: string[]; edits?: Record<string, Record<string, unknown>> },
): Promise<{ ok: boolean; proposal?: Proposal; error?: string }> {
  const db = await createClient();
  const s = await getSession(db);
  if (!s) return { ok: false, error: "انتهت الجلسة، سجّل الدخول من جديد" };
  try {
    const proposal = await decideProposal(db, proposalId, decision);
    revalidatePath("/", "layout"); // case pages, hearings, chat all show the saved items
    return { ok: true, proposal };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "تعذّر الحفظ" };
  }
}

export async function newThreadAction() {
  const db = await createClient();
  const id = await createGeneralThread(db);
  redirect(`/chat/${id}`);
}

/** Chat home: the first message starts a new general thread (new client / case), then opens it. */
export async function startChatAction(_: { error?: string } | null, form: FormData): Promise<{ error?: string } | null> {
  const text = String(form.get("text") ?? "").trim();
  if (!text) return { error: "اكتب رسالتك أولًا" };
  const db = await createClient();
  const s = await getSession(db);
  if (!s) return { error: "انتهت الجلسة، سجّل الدخول من جديد" };
  const id = await createGeneralThread(db, text.replace(/\s+/g, " ").slice(0, 60));
  try {
    await runAssistantTurn(db, { threadId: id, userText: text.slice(0, 8000), userId: s.user.id, officeId: s.officeId });
  } catch (e) {
    // the message never got in: no empty thread; the text stays in the composer
    if (await dropIfEmpty(db, id)) return { error: e instanceof Error ? e.message : "تعذّر الإرسال" };
    // otherwise the thread page shows the saved message and lets the lawyer retry
  }
  redirect(`/chat/${id}`);
}

/** Home composer «ارفع ورقة»: a new general thread, then the upload reads the paper and posts its card there. */
export async function startWithFileAction(form: FormData): Promise<{ threadId?: string; error?: string }> {
  const db = await createClient();
  const s = await getSession(db);
  if (!s) return { error: "انتهت الجلسة، سجّل الدخول من جديد" };
  const file = form.get("file");
  const id = await createGeneralThread(db, file instanceof File ? file.name.slice(0, 60) : "مستند جديد");
  form.set("threadId", id);
  const { uploadDocumentAction } = await import("@/lib/documents/actions");
  const r = await uploadDocumentAction(form);
  if (r.ok || r.warning) return { threadId: id };
  return (await dropIfEmpty(db, id)) ? { error: r.error } : { threadId: id, error: r.error };
}
