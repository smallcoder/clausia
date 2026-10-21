import "server-only";
/** Case queries for the list, search and case header. All take an RLS-bound `db` (no cookies here). */
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";
import { addDaysIso, normalizeDigits, todayIso } from "@/lib/dates";
import { weekStart } from "@/lib/hearings";
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

export async function listCases(db: Db, opts: { q?: string; stage?: string; status?: string; review?: boolean; decision?: boolean } = {}): Promise<CaseRow[]> {
  let query = db.from("cases").select(CASE_COLS).neq("review_status", "rejected").order("updated_at", { ascending: false }).limit(200);
  // ?review=1: only the cases that need the lawyer's review (the same set as the «محتاجة مراجعة» tile)
  if (opts.review) {
    const ids = [...(await casesNeedingReview(db))];
    if (!ids.length) return [];
    query = query.in("id", ids);
  }
  // ?decision=1: only the cases with a past hearing and no decision (the same set as the «محتاجة قرار» stat)
  if (opts.decision) {
    const ids = [...(await casesNeedingDecision(db))];
    if (!ids.length) return [];
    query = query.in("id", ids);
  }
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

/** Tables whose rows Clausia saves as `suggested` until the lawyer confirms them. */
const REVIEW_TABLES = ["case_parties", "case_facts", "case_requests", "case_arguments", "judgments", "hearings", "documents"] as const;

/**
 * Cases that need the lawyer's review: the case itself or any of its items is still `suggested`
 * (saved by Clausia, not yet confirmed), or it has a past hearing with no decision recorded
 * (same rule as `undecidedPastHearings`). One definition for the cases-list tile, filter and row chip.
 */
export async function casesNeedingReview(db: Db): Promise<Set<string>> {
  const [own, undecided, ...items] = await Promise.all([
    db.from("cases").select("id").eq("review_status", "suggested"),
    db.from("hearings").select("case_id").lt("hearing_date", todayIso()).is("decision_type", null).neq("review_status", "rejected"),
    ...REVIEW_TABLES.map((t) => db.from(t).select("case_id").eq("review_status", "suggested")),
  ]);
  const ids = new Set<string>((own.data ?? []).map((c) => c.id));
  for (const r of [undecided, ...items]) for (const row of (r.data ?? []) as { case_id: string | null }[]) if (row.case_id) ids.add(row.case_id);
  return listedOnly(db, ids);
}

/** Of `ids`, the cases the list shows (not rejected), so a tile's count equals its filter's row count. */
async function listedOnly(db: Db, ids: Set<string>): Promise<Set<string>> {
  if (!ids.size) return ids;
  const { data } = await db.from("cases").select("id").in("id", [...ids]).neq("review_status", "rejected");
  return new Set((data ?? []).map((c) => c.id));
}

/** Office-wide case counts per status and stage (cases-list chips; not affected by the current filter). */
export async function officeCaseCounts(db: Db) {
  const { data, error } = await db.from("cases").select("status, stage").neq("review_status", "rejected");
  if (error) throw new Error(error.message);
  const status = Object.fromEntries(Object.keys(CASE_STATUS).map((k) => [k, 0])) as Record<E["case_status"], number>;
  const stage = Object.fromEntries(Object.keys(STAGE).map((k) => [k, 0])) as Record<E["case_stage"], number>;
  for (const r of data ?? []) { status[r.status]++; stage[r.stage]++; }
  return { total: (data ?? []).length, status, stage };
}

/** Hearings in the current Sat–Fri week (Cairo), counted like the roll's `?view=week`. */
export async function weekHearingsCount(db: Db): Promise<number> {
  const from = weekStart(todayIso());
  const { count } = await db.from("hearings").select("id", { count: "exact", head: true })
    .gte("hearing_date", from).lte("hearing_date", addDaysIso(from, 6)).neq("review_status", "rejected");
  return count ?? 0;
}

/**
 * Cases with a hearing before today (Cairo) and no decision recorded: the cases-list «محتاجة قرار» stat,
 * its `?decision=1` filter and the row marker. Same rule as `undecidedPastHearings`; a subset of `casesNeedingReview`.
 */
export async function casesNeedingDecision(db: Db): Promise<Set<string>> {
  const { data } = await db.from("hearings").select("case_id").lt("hearing_date", todayIso()).is("decision_type", null).neq("review_status", "rejected");
  return listedOnly(db, new Set((data ?? []).map((h) => h.case_id)));
}

/** Of `caseIds`, the cases whose latest judgment (not rejected) has outcome `against_us`. */
export async function judgedAgainstUs(db: Db, caseIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!caseIds.length) return out;
  const { data } = await db.from("judgments").select("case_id, outcome").in("case_id", caseIds).neq("review_status", "rejected")
    .order("judgment_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  const seen = new Set<string>();
  for (const j of data ?? []) {
    if (seen.has(j.case_id)) continue;
    seen.add(j.case_id);
    if (j.outcome === "against_us") out.add(j.case_id);
  }
  return out;
}
