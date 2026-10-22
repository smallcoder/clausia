/**
 * Hearings reads for the home screen, the roll (رول الجلسات) and the case hearings tab.
 * Every function takes the caller's RLS-bound `db`, so scripts can call them and a lawyer only sees their office.
 * Writes go through applyOp('add_hearing' | 'record_decision') — see src/components/hearings/actions.ts.
 */
import { todayIso } from "@/lib/dates";
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";

type E = Database["public"]["Enums"];

export interface HearingCase {
  id: string;
  case_number: string | null;
  case_year: number | null;
  title: string | null;
  court: string | null;
  circuit: string | null;
  client_role: E["party_role"] | null;
  status: E["case_status"];
  client_name: string | null;
  /** «مدني» / «عمال» … free text, shown after the case number in the roll */
  case_type: string | null;
}

export interface HearingRow {
  id: string;
  case_id: string;
  hearing_date: string;
  purpose: string | null;
  location: string | null;
  decision_type: E["hearing_decision"] | null;
  decision_text: string | null;
  next_requirements: string | null;
  previous_hearing_id: string | null;
  next_hearing_id: string | null;
  review_status: E["item_status"];
  created_by_kind: E["actor_kind"];
  source_kind: E["source_kind"];
  source_page: number | null;
  /** the paper the hearing came from, the sentence and where it sits in the page (null for older rows) */
  source_document_id: string | null;
  source_quote: string | null;
  source_char_start: number | null;
  source_char_end: number | null;
  /** the same for the DECISION, which has its own source (a hearing can be created by one paper and decided by another) */
  decision_source_kind: E["source_kind"] | null;
  decision_source_document_id: string | null;
  decision_source_page: number | null;
  decision_source_quote: string | null;
  decision_source_char_start: number | null;
  decision_source_char_end: number | null;
}

export interface HearingWithCase extends HearingRow {
  case: HearingCase;
  /** date of the next hearing, when this one was postponed */
  next_date: string | null;
}

const HEARING_COLS =
  "id, case_id, hearing_date, purpose, location, decision_type, decision_text, next_requirements, previous_hearing_id, next_hearing_id, review_status, created_by_kind, source_kind, source_page, source_document_id, source_quote, source_char_start, source_char_end, decision_source_kind, decision_source_document_id, decision_source_page, decision_source_quote, decision_source_char_start, decision_source_char_end";
const WITH_CASE = `${HEARING_COLS}, cases!inner(id, case_number, case_year, title, court, circuit, client_role, status, case_type, clients(name))`;

type RawCase = Omit<HearingCase, "client_name"> & { clients: { name: string } | null };
type Raw = HearingRow & { cases: RawCase };

/** Flatten the join and fill `next_date` (one extra query for the linked next hearings). */
async function shape(db: Db, raw: Raw[]): Promise<HearingWithCase[]> {
  const nextIds = [...new Set(raw.map((r) => r.next_hearing_id).filter((x): x is string => !!x))];
  const dates = new Map<string, string>();
  if (nextIds.length) {
    const rows = must(await db.from("hearings").select("id, hearing_date").in("id", nextIds));
    for (const r of rows) dates.set(r.id, r.hearing_date);
  }
  return raw.map(({ cases, ...h }) => {
    const { clients, ...c } = cases;
    return { ...h, case: { ...c, client_name: clients?.name ?? null }, next_date: h.next_hearing_id ? dates.get(h.next_hearing_id) ?? null : null };
  });
}

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as T;
}

/** Hearings with from ≤ date ≤ to (ISO), with their case and client, ordered by date then court. */
export async function hearingsInRange(db: Db, from: string, to: string): Promise<HearingWithCase[]> {
  const rows = must(await db.from("hearings").select(WITH_CASE).gte("hearing_date", from).lte("hearing_date", to).neq("review_status", "rejected").order("hearing_date"));
  return (await shape(db, rows as unknown as Raw[])).sort(byDateCourt);
}

/** Past hearings (before today in Cairo) with no decision recorded yet, oldest first. */
export async function undecidedPastHearings(db: Db, limit = 50): Promise<HearingWithCase[]> {
  const rows = must(await db.from("hearings").select(WITH_CASE).lt("hearing_date", todayIso()).is("decision_type", null).neq("review_status", "rejected").order("hearing_date", { ascending: true }).limit(limit));
  return shape(db, rows as unknown as Raw[]);
}

/** One case's hearings, oldest first. previous/next links are on each row (ids); `next_date` is filled in. */
export async function caseHearings(db: Db, caseId: string): Promise<(HearingRow & { next_date: string | null; previous_date: string | null })[]> {
  const rows = must(await db.from("hearings").select(HEARING_COLS).eq("case_id", caseId).neq("review_status", "rejected").order("hearing_date").order("created_at")) as unknown as HearingRow[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return rows.map((r) => ({
    ...r,
    next_date: r.next_hearing_id ? byId.get(r.next_hearing_id)?.hearing_date ?? null : null,
    previous_date: r.previous_hearing_id ? byId.get(r.previous_hearing_id)?.hearing_date ?? null : null,
  }));
}

function byDateCourt(a: HearingWithCase, b: HearingWithCase) {
  return a.hearing_date.localeCompare(b.hearing_date) || (a.case.court ?? "").localeCompare(b.case.court ?? "", "ar") || (a.case.circuit ?? "").localeCompare(b.case.circuit ?? "", "ar");
}

/** Group keeping first-seen order. */
export function groupBy<T>(items: T[], key: (t: T) => string): { key: string; items: T[] }[] {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return [...m].map(([k, v]) => ({ key: k, items: v }));
}

export const NO_COURT = "محكمة غير محددة";
export const NO_CIRCUIT = "دائرة غير محددة";
export const courtOf = (h: HearingWithCase) => h.case.court?.trim() || NO_COURT;
export const circuitOf = (h: HearingWithCase) => h.case.circuit?.trim() || NO_CIRCUIT;

/** How many past hearings (before today in Cairo) still have no decision — the roll's «محتاجة قرار» tile. */
export async function undecidedPastCount(db: Db): Promise<number> {
  const r = await db.from("hearings").select("id", { count: "exact", head: true }).lt("hearing_date", todayIso()).is("decision_type", null).neq("review_status", "rejected");
  if (r.error) throw new Error(r.error.message);
  return r.count ?? 0;
}

/** Short circuit label for the roll's circuit tile: the first number in «الدائرة 7 مدني» → «7»; otherwise null. */
export function circuitNumber(h: HearingWithCase): string | null {
  const c = h.case.circuit?.trim();
  if (!c) return null;
  const n = c.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).match(/\d+/);
  return n ? n[0] : null;
}

/** Saturday-start week (Egyptian courts work Sat–Thu) containing iso. */
export function weekStart(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun … 6 Sat
  const back = (wd + 1) % 7; // days since Saturday
  const dt = new Date(Date.UTC(y, m - 1, d - back));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/**
 * The roll's «الجلسة الجاية»: the first hearing in `rows` (display order) with no decision yet, with its
 * 1-based position and the total. null when every hearing in `rows` is decided (or there are none).
 */
export function nextUndecided(rows: HearingWithCase[]): { h: HearingWithCase; index: number; total: number } | null {
  const i = rows.findIndex((h) => !h.decision_type);
  return i < 0 ? null : { h: rows[i], index: i + 1, total: rows.length };
}
