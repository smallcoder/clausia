import "server-only";
/**
 * After a judgment is recorded and confirmed, propose ONE deadlines card (made by code, never by the model) in the same
 * thread, or in the case's own thread when the judgment came from a card with no thread (a paper's card).
 * Nothing is saved here: the card becomes rows only when the lawyer taps «حطهم في الرول» (decideProposal → applyOp('add_deadline')).
 * Behind the flag NEXT_PUBLIC_FEATURE_DEADLINES; with it off nothing is proposed.
 */
import { deadlinesEnabled } from "@/lib/flags";
import { createProposal } from "@/lib/proposals";
import type { Db } from "@/lib/supabase/server";
import { DEFAULT_REMINDERS, type DeadlineKind } from "./types";

export type ProposeResult = { proposed: true; proposalId: string } | { proposed: false; why: string };

/** The assistant line above the card (written by code; it says what the card assumes). */
const intro = (kind: DeadlineKind) =>
  `سجّلت الحكم. وحسبت مواعيد ${kind === "appeal" ? "الطعن" : "الطعن بالنقض"} من تاريخ صدوره (م 213)، على أساس إنه حضوري. راجعها، ولو الحكم مش حضوري اضغط «الحكم مش حضوري». ولما توافق هحطها في الرول وأنبّهك قبلها.`;

export async function proposeDeadlinesForJudgment(db: Db, input: { judgmentId: string; threadId?: string | null }): Promise<ProposeResult> {
  if (!deadlinesEnabled()) return { proposed: false, why: "flag off" };
  const { data: j } = await db.from("judgments").select("id, case_id, judgment_date, kind, review_status").eq("id", input.judgmentId).maybeSingle();
  if (!j) return { proposed: false, why: "no judgment" };
  // v1: only a final judgment gets a card (preliminary / interim judgments are left out on purpose: a GitHub issue)
  if (j.kind !== "final" || j.review_status !== "confirmed") return { proposed: false, why: "not a confirmed final judgment" };
  if (!j.judgment_date) return { proposed: false, why: "no judgment date" }; // never guess a date
  const { data: c } = await db.from("cases").select("id, stage").eq("id", j.case_id).maybeSingle();
  if (!c || c.stage === "cassation") return { proposed: false, why: "no further stage" };
  const kind: DeadlineKind = c.stage === "appeal" ? "cassation" : "appeal";

  // not twice: already saved, or a card for this judgment is still waiting
  const [{ data: saved }, { data: open, error: openError }] = await Promise.all([
    db.from("case_deadlines").select("id").eq("judgment_id", j.id).eq("kind", kind).limit(1),
    db.from("proposals").select("ops").eq("case_id", c.id).in("status", ["pending", "partially_confirmed"]).contains("ops", JSON.stringify([{ tool: "add_deadline" }])), // a JSON string: an array here is sent as a Postgres array and fails
  ]);
  if (openError) throw new Error(openError.message);
  if (saved?.length) return { proposed: false, why: "already saved" };
  const waiting = (open ?? []).some((p) => (p.ops as unknown as { tool: string; status: string; args: { judgment?: string } }[]).some((o) => o.tool === "add_deadline" && (o.status === "pending" || o.status === "failed") && o.args.judgment === j.id));
  if (waiting) return { proposed: false, why: "a card is waiting" };

  let threadId = input.threadId ?? null;
  if (!threadId) threadId = (await db.from("chat_threads").select("id").eq("case_id", c.id).order("created_at").limit(1).maybeSingle()).data?.id ?? null;
  if (!threadId) return { proposed: false, why: "no thread" };

  const { data: m, error } = await db.from("chat_messages").insert({ thread_id: threadId, role: "assistant", content: intro(kind) }).select("id").single();
  if (error || !m) throw new Error(error?.message ?? "no message");
  // the line and the card go together: if the card cannot be stored, the line is removed again (no orphan sentence in the thread)
  let proposal;
  try {
    proposal = await createProposal(db, {
      threadId, messageId: m.id, caseId: c.id, sourceTexts: [],
      ops: [{ tool: "add_deadline", args: { case: c.id, judgment: j.id, kind, start_basis: "judgment_date", urgent: false, reminders: [...DEFAULT_REMINDERS] }, source: { kind: "chat" } }],
    });
  } catch (e) {
    await db.from("chat_messages").delete().eq("id", m.id);
    throw e;
  }
  return { proposed: true, proposalId: proposal.id };
}
