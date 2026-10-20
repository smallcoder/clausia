import "server-only";
/** Case queries for the list, search and case header. All take an RLS-bound `db` (no cookies here). */
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";
import { normalizeDigits, todayIso } from "@/lib/dates";
import { CASE_STATUS, STAGE } from "@/lib/labels";

type E = Database["public"]["Enums"];

export interface CaseRow {
  id: string;
  title: string | null;
  case_number: string | null;
  case_year: number | null;
  court: string | null;
  circuit: string | null;
  case_type: string | null;
  stage: E["case_stage"];
  status: E["case_status"];
  client_role: E["party_role"] | null;
  client: { id: string; name: string } | null;
  next_hearing: string | null; // ISO date, today or later
}

const CASE_COLS = "id, title, case_number, case_year, court, circuit, case_type, stage, status, client_role, updated_at, client:clients(id, name)";

/** Own-key check (not `in`: `?stage=toString` must not pass). */
export function isKey(rec: object, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(rec, k);
}

/** Max ids inlined per `in.(…)` list in the search filter (~3.7 KB of UUIDs each). */
const MAX_INLINE_IDS = 100;

/** Strip characters that would break a PostgREST `or=(...)` filter. */
function safeTerm(s: string) {
  return s.replace(/[,()*%\\"]/g, " ").replace(/\s+/g, " ").trim();
}

/** Next hearing (today or later, Cairo date) per case id. */
export async function nextHearings(db: Db, caseIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!caseIds.length) return out;
  const { data } = await db.from("hearings").select("case_id, hearing_date").in("case_id", caseIds).neq("review_status", "rejected").gte("hearing_date", todayIso()).order("hearing_date");
  for (const h of data ?? []) if (!out.has(h.case_id)) out.set(h.case_id, h.hearing_date);
  return out;
}

export async function listCases(db: Db, opts: { q?: string; stage?: string; status?: string } = {}): Promise<CaseRow[]> {
  let query = db.from("cases").select(CASE_COLS).neq("review_status", "rejected").order("updated_at", { ascending: false }).limit(200);
  // URL params: only known enum values filter; anything else is ignored (an unknown value would make PostgREST error)
  if (opts.stage && isKey(STAGE, opts.stage)) query = query.eq("stage", opts.stage as E["case_stage"]);
  if (opts.status && isKey(CASE_STATUS, opts.status)) query = query.eq("status", opts.status as E["case_status"]);

  const q = safeTerm(normalizeDigits(opts.q ?? ""));
  if (q) {
    const like = `%${q}%`;
    const ql = `"${like}"`; // quoted: the term may contain spaces
    // client name and party name live in other tables: collect matching case ids first.
    // The ids are inlined in the GET `or=` filter, so each list is capped to keep the URL short.
    const [{ data: clients }, { data: parties }] = await Promise.all([
      db.from("clients").select("id").ilike("name", like).limit(MAX_INLINE_IDS),
      db.from("case_parties").select("case_id").ilike("name", like).neq("review_status", "rejected").limit(300),
    ]);
    const ors = [`title.ilike.${ql}`, `case_number.ilike.${ql}`, `court.ilike.${ql}`, `circuit.ilike.${ql}`];
    // «1234/2024» or «1234 لسنة 2024» → number + year
    const ny = /^(\S+?)\s*(?:\/|لسنة)\s*(\d{4})$/.exec(q);
    if (ny) ors.push(`and(case_number.eq."${ny[1]}",case_year.eq.${ny[2]})`);
    if (/^\d{4}$/.test(q)) ors.push(`case_year.eq.${q}`);
    const clientIds = (clients ?? []).map((c) => c.id);
    if (clientIds.length) ors.push(`client_id.in.(${clientIds.join(",")})`);
    const partyCaseIds = [...new Set((parties ?? []).map((p) => p.case_id))].slice(0, MAX_INLINE_IDS);
    if (partyCaseIds.length) ors.push(`id.in.(${partyCaseIds.join(",")})`);
    query = query.or(ors.join(","));
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const next = await nextHearings(db, rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id, title: r.title, case_number: r.case_number, case_year: r.case_year, court: r.court, circuit: r.circuit,
    case_type: r.case_type, stage: r.stage, status: r.status, client_role: r.client_role,
    client: r.client ? { id: r.client.id, name: r.client.name } : null,
    next_hearing: next.get(r.id) ?? null,
  }));
}

export interface CaseHeader extends CaseRow {
  facts_date: string | null;
  facts_date_precision: E["date_precision"];
  summary: string | null;
  previous_stage_case_id: string | null;
}

export async function getCaseHeader(db: Db, caseId: string): Promise<CaseHeader | null> {
  const { data: c } = await db.from("cases")
    .select(`${CASE_COLS}, facts_date, facts_date_precision, summary, previous_stage_case_id`)
    .eq("id", caseId).maybeSingle();
  if (!c) return null;
  const next = await nextHearings(db, [c.id]);
  return {
    id: c.id, title: c.title, case_number: c.case_number, case_year: c.case_year, court: c.court, circuit: c.circuit,
    case_type: c.case_type, stage: c.stage, status: c.status, client_role: c.client_role,
    client: c.client ? { id: c.client.id, name: c.client.name } : null,
    next_hearing: next.get(c.id) ?? null,
    facts_date: c.facts_date, facts_date_precision: c.facts_date_precision, summary: c.summary,
    previous_stage_case_id: c.previous_stage_case_id,
  };
}

/** Earlier stage (one) and later stages (cases that point back at this one). */
export async function stageLinks(db: Db, caseId: string, previousId: string | null) {
  const [prev, later] = await Promise.all([
    previousId ? db.from("cases").select("id, case_number, case_year, title, stage").eq("id", previousId).maybeSingle() : Promise.resolve({ data: null }),
    db.from("cases").select("id, case_number, case_year, title, stage").eq("previous_stage_case_id", caseId).order("created_at"),
  ]);
  return { previous: prev.data ?? null, later: later.data ?? [] };
}

export async function caseCounts(db: Db, caseId: string) {
  const count = async (t: "case_facts" | "case_parties" | "hearings" | "documents" | "case_requests" | "case_arguments" | "judgments") => {
    const { count } = await db.from(t).select("id", { count: "exact", head: true }).eq("case_id", caseId).neq("review_status", "rejected");
    return count ?? 0;
  };
  const [facts, parties, hearings, documents, requests, args, judgments] = await Promise.all([
    count("case_facts"), count("case_parties"), count("hearings"), count("documents"), count("case_requests"), count("case_arguments"), count("judgments"),
  ]);
  return { facts, parties, hearings, documents, requests, arguments: args, judgments };
}
