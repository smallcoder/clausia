import "server-only";
/**
 * The reads behind the edit highlights (split layout, PR 2). RLS-bound client only; nothing is written here.
 *  - `loadPendingEdits`: the case page — the open proposals of THIS case, mapped to the places of the page (src/lib/edits.ts).
 *  - `loadCardRows`: the chat card — the «old ← new» lines of each open change op, from what is saved now.
 */
import { buildPendingEdits, diffRows, isChangeOp, isOpenOp, type EditRow, type PendingEdits, type SavedCase, type SavedHearing } from "@/lib/edits";
import type { CaseFile } from "@/lib/case-file";
import type { Proposal } from "@/lib/proposals";
import type { Db } from "@/lib/supabase/server";

type HearingRow = CaseFile["hearings"][number];

/** The open edits of one case, for its page. The proposals are read through RLS and filtered to this case. */
export async function loadPendingEdits(db: Db, caseId: string, cf: CaseFile): Promise<PendingEdits> {
  const { data } = await db.from("proposals").select("*").eq("case_id", caseId).in("status", ["pending", "partially_confirmed"]).order("created_at");
  const proposals = (data ?? []) as unknown as Proposal[];
  const hearings: HearingRow[] = [...cf.hearings, ...cf.pending_suggestions.filter((p) => p.table === "hearings").map((p) => p.item as HearingRow)];
  const dateOf = new Map(hearings.map((h) => [h.id, h.date]));
  return buildPendingEdits(caseId, {
    case: cf.case as SavedCase,
    hearings: hearings.map((h) => ({ id: h.id, hearing_date: h.date, decision_type: h.decision_type, decision_text: h.decision_text, next_hearing_id: h.next_hearing_id, location: h.location, nextDate: h.next_hearing_id ? dateOf.get(h.next_hearing_id) ?? null : null })),
  }, proposals);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** «old ← new» lines for the open change ops of these cards, by `proposalId:opId`. Old = what is saved now. */
export async function loadCardRows(db: Db, proposals: Proposal[]): Promise<Record<string, EditRow[]>> {
  const ops = proposals.flatMap((p) => p.ops.filter((o) => isOpenOp(o) && isChangeOp(o)).map((o) => ({ p, o })));
  if (!ops.length) return {};
  const ids = (k: "case" | "hearing") => [...new Set(ops.map((x) => x.o.args[k]).filter((v): v is string => typeof v === "string" && UUID.test(v)))];
  const caseIds = ids("case");
  const hearingIds = ids("hearing");
  const [cases, hearings] = await Promise.all([
    caseIds.length ? db.from("cases").select("id, case_number, case_year, court, circuit, case_type, title, stage, status, client_role, summary, facts_date, facts_date_precision").in("id", caseIds).then((r) => r.data ?? []) : [],
    hearingIds.length ? db.from("hearings").select("id, hearing_date, decision_type, decision_text, next_hearing_id, location").in("id", hearingIds).then((r) => r.data ?? []) : [],
  ]);
  const nextIds = hearings.map((h) => h.next_hearing_id).filter((x): x is string => !!x);
  const nexts = nextIds.length ? (await db.from("hearings").select("id, hearing_date").in("id", nextIds)).data ?? [] : [];
  const out: Record<string, EditRow[]> = {};
  for (const { p, o } of ops) {
    const c = cases.find((x) => x.id === o.args.case);
    const h = hearings.find((x) => x.id === o.args.hearing) as SavedHearing | undefined;
    const nextDate = h?.next_hearing_id ? nexts.find((n) => n.id === h.next_hearing_id)?.hearing_date ?? null : null;
    out[`${p.id}:${o.op_id}`] = diffRows(o, { case: c as SavedCase | undefined, hearing: h, nextDate });
  }
  return out;
}
