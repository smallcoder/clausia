"use server";
/** Server actions for the chat UI and the confirmation card (RLS-bound client; the lawyer's own session). */
import { revalidatePath } from "next/cache";
import { caseLabel } from "@/lib/labels";
import { decideProposal, type Proposal } from "@/lib/proposals";
import { createClient, getSession } from "@/lib/supabase/server";
import { listSessions, moveThreadToCase, type Session } from "@/lib/threads";
import { parseMode } from "./modes";
import { runAssistantTurn, TurnError } from "./turn";

/** `saved`: the lawyer's message is in the thread (so the UI must not put it back in the composer). */
export async function sendMessageAction(threadId: string, text: string, mode?: string): Promise<{ ok: boolean; error?: string; saved?: boolean }> {
  const db = await createClient();
  const s = await getSession(db);
  if (!s) return { ok: false, error: "انتهت الجلسة، سجّل الدخول من جديد" };
  if (!text.trim()) return { ok: false, error: "الرسالة فارغة" };
  if (text.length > 8000) return { ok: false, error: "الرسالة طويلة جدًا" };
  try {
    const r = await runAssistantTurn(db, { threadId, userText: text, userId: s.user.id, officeId: s.officeId, mode: parseMode(mode) });
    revalidatePath("/", "layout");
    // an LLM failure already left a friendly assistant message in the thread: no second error in the composer
    if (r.error && !r.assistantMessageIds.length) return { ok: false, error: "تعذّر رد Clausia", saved: true };
    return { ok: true, saved: true };
  } catch (e) {
    const saved = e instanceof TurnError && e.userMessageSaved;
    if (saved) revalidatePath("/", "layout");
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

/** «انقل المحادثة دي لقضية X»: the lawyer moves a general session to a case (RLS client; the case must be one of theirs). */
export async function moveThreadAction(threadId: string, caseId: string): Promise<{ ok: boolean; error?: string }> {
  const db = await createClient();
  const s = await getSession(db);
  if (!s) return { ok: false, error: "انتهت الجلسة، سجّل الدخول من جديد" };
  try {
    await moveThreadToCase(db, threadId, caseId);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "تعذّر النقل" };
  }
}

/** The phone's context picker, step 1: the cases to choose from (recent first). */
export async function pickerCasesAction(): Promise<{ id: string; label: string; client: string | null }[]> {
  const db = await createClient();
  const { data } = await db.from("cases").select("id, case_number, case_year, title, clients(name)").order("updated_at", { ascending: false }).limit(60);
  return (data ?? []).map((c) => ({ id: c.id, label: caseLabel(c), client: c.clients?.name ?? null }));
}

/** Step 2: the sessions of the chosen context (null = the general one). */
export async function pickerSessionsAction(caseId: string | null): Promise<Session[]> {
  const db = await createClient();
  return listSessions(db, caseId);
}
