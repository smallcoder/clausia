"use server";
/**
 * Server actions of the deadlines card: ONE read («احسب», no write). Saving goes through decideProposalAction → applyOp('add_deadline'),
 * which recomputes everything again. The case, the judgment and the kind come from the stored proposal, never from the browser.
 */
import { deadlinesEnabled } from "@/lib/flags";
import { getProposal } from "@/lib/proposals";
import { createClient, getSession } from "@/lib/supabase/server";
import type { DeadlineArgs } from "./cards";
import { buildDeadlines, DeadlineError } from "./service";
import type { DeadlineCardData, StartBasis } from "./types";

export async function previewDeadlinesAction(
  proposalId: string, input: { basis: StartBasis; serviceDate?: string; urgent: boolean; reminders: number[] },
): Promise<{ ok: true; card: DeadlineCardData } | { ok: false; error: string }> {
  if (!deadlinesEnabled()) return { ok: false, error: "الميزة دي لسه مش متاحة" };
  const db = await createClient();
  if (!(await getSession(db))) return { ok: false, error: "انتهت الجلسة، سجّل الدخول من جديد" };
  const p = await getProposal(db, proposalId);
  const op = p?.ops.find((o) => o.tool === "add_deadline" && o.status === "pending");
  if (!p || !op) return { ok: false, error: "البطاقة مش موجودة أو اتقفلت" };
  const a = op.args as unknown as DeadlineArgs;
  try {
    const { card } = await buildDeadlines(db, {
      caseId: a.case, judgmentId: a.judgment, kind: a.kind,
      startBasis: input.basis === "service_date" ? "service_date" : "judgment_date",
      serviceDate: typeof input.serviceDate === "string" ? input.serviceDate.slice(0, 40) : null,
      urgent: !!input.urgent, reminders: Array.isArray(input.reminders) ? input.reminders : [],
    });
    return { ok: true, card };
  } catch (e) {
    return { ok: false, error: e instanceof DeadlineError ? e.message : "ماقدرتش أحسب المواعيد دلوقتي" };
  }
}
