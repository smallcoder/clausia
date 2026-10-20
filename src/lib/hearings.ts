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
}

export interface HearingRow {
  id: string;
  case_id: string;
  hearing_date: string;
  purpose: string | null;
  decision_type: E["hearing_decision"] | null;
  decision_text: string | null;
  next_requirements: string | null;
  previous_hearing_id: string | null;
  next_hearing_id: string | null;
  review_status: E["item_status"];
  created_by_kind: E["actor_kind"];
  source_kind: E["source_kind"];
  source_page: number | null;
}

export interface HearingWithCase extends HearingRow {
  case: HearingCase;
  /** date of the next hearing, when this one was postponed */
  next_date: string | null;
}

const HEARING_COLS =
  "id, case_id, hearing_date, purpose, decision_type, decision_text, next_requirements, previous_hearing_id, next_hearing_id, review_status, created_by_kind, source_kind, source_page";
const WITH_CASE = `${HEARING_COLS}, cases!inner(id, case_number, case_year, title, court, circuit, client_role, status, clients(name)), next:hearings!hearings_next_hearing_id_fkey(hearing_date)`;

type RawCase = Omit<HearingCase, "client_name"> & { clients: { name: string } | null };
type Raw = HearingRow & { cases: RawCase; next: { hearing_date: string } | { hearing_date: string }[] | null };

function shape(r: Raw): HearingWithCase {
  const { cases, next, ...h } = r;
  const { clients, ...c } = cases;
  const n = Array.isArray(next) ? next[0] : next;
  return { ...h, case: { ...c, client_name: clients?.name ?? null }, next_date: n?.hearing_date ?? null };
}

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as T;
}

/** Hearings with from ≤ date ≤ to (ISO), with their case and client, ordered by date then court. */
export async function hearingsInRange(db: Db, from: string, to: string): Promise<HearingWithCase[]> {
  const rows = must(await db.from("hearings").select(WITH_CASE).gte("hearing_date", from).lte("hearing_date", to).neq("review_status", "rejected").order("hearing_date"));
  return (rows as unknown as Raw[]).map(shape).sort(byDateCourt);
}

/** Past hearings (before today in Cairo) with no decision recorded yet, oldest first. */
export async function undecidedPastHearings(db: Db, limit = 50): Promise<HearingWithCase[]> {
  const rows = must(await db.from("hearings").select(WITH_CASE).lt("hearing_date", todayIso()).is("decision_type", null).neq("review_status", "rejected").order("hearing_date", { ascending: true }).limit(limit));
  return (rows as unknown as Raw[]).map(shape);
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

/** Saturday-start week (Egyptian courts work Sat–Thu) containing iso. */
export function weekStart(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun … 6 Sat
  const back = (wd + 1) % 7; // days since Saturday
  const dt = new Date(Date.UTC(y, m - 1, d - back));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
