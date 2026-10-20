"use server";
/** Server actions for the chat UI and the confirmation card (RLS-bound client; the lawyer's own session). */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { decideProposal, type Proposal } from "@/lib/proposals";
import { createClient, getSession } from "@/lib/supabase/server";
import { createGeneralThread } from "@/lib/threads";
import { runAssistantTurn } from "./turn";

export async function sendMessageAction(threadId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const db = await createClient();
  const s = await getSession(db);
  if (!s) return { ok: false, error: "انتهت الجلسة، سجّل الدخول من جديد" };
  if (!text.trim()) return { ok: false, error: "الرسالة فارغة" };
  if (text.length > 8000) return { ok: false, error: "الرسالة طويلة جدًا" };
  try {
    const r = await runAssistantTurn(db, { threadId, userText: text, userId: s.user.id, officeId: s.officeId });
    revalidatePath(`/chat/${threadId}`);
    return r.error ? { ok: false, error: "تعذّر رد المساعد" } : { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "تعذّر الإرسال" };
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
