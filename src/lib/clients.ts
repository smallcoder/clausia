import "server-only";
/**
 * The clients pages' data (docs/design/ia/IAClient*): the list (name, phone, cases, next hearing) and one client (their cases with the next
 * hearing of each, and their papers). Reads with the lawyer's own client (RLS). «Next hearing» = the earliest hearing from today on (today counts),
 * not rejected, of any of the client's cases. A client row that is rejected is not shown anywhere.
 */
import { todayIso } from "@/lib/dates";
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";

type E = Database["public"]["Enums"];

/** Cases that are still being run: the same set the sidebar sorts first. */
export const RUNNING: readonly E["case_status"][] = ["active", "reserved_for_judgment"];
/** Cases that are over (a judgment, or closed): their rows are faded on the client page. */
export const FINISHED: readonly E["case_status"][] = ["judged", "closed"];

export interface ClientRow {
  id: string; name: string; kind: E["client_kind"]; phone: string | null; address: string | null;
  cases: number; running: number; next_hearing: string | null;
}

/** The earliest upcoming hearing date per case. */
async function nextHearingByCase(db: Db, caseIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!caseIds.length) return out;
  const { data } = await db.from("hearings").select("case_id, hearing_date").in("case_id", caseIds).gte("hearing_date", todayIso())
    .neq("review_status", "rejected").order("hearing_date");
  for (const h of data ?? []) if (!out.has(h.case_id)) out.set(h.case_id, h.hearing_date);
  return out;
}

/** Every client with their case numbers: next hearing soonest first, then the rest by name. */
export async function listClients(db: Db): Promise<ClientRow[]> {
  const [{ data: clients }, { data: cases }] = await Promise.all([
    db.from("clients").select("id, name, kind, phone, address").neq("review_status", "rejected").order("name"),
    db.from("cases").select("id, client_id, status").not("client_id", "is", null).neq("review_status", "rejected"),
  ]);
  const next = await nextHearingByCase(db, (cases ?? []).map((c) => c.id));
  const by = new Map<string, ClientRow>();
  for (const c of clients ?? []) by.set(c.id, { ...c, cases: 0, running: 0, next_hearing: null });
  for (const c of cases ?? []) {
    const r = by.get(c.client_id!);
    if (!r) continue;
    r.cases++;
    if (RUNNING.includes(c.status)) r.running++;
    const n = next.get(c.id);
    if (n && (!r.next_hearing || n < r.next_hearing)) r.next_hearing = n;
  }
  return [...by.values()].sort((a, b) =>
    a.next_hearing && b.next_hearing ? a.next_hearing.localeCompare(b.next_hearing) || a.name.localeCompare(b.name, "ar")
      : a.next_hearing ? -1 : b.next_hearing ? 1 : a.name.localeCompare(b.name, "ar"));
}

export interface ClientCase {
  id: string; title: string | null; case_number: string | null; case_year: number | null; court: string | null; circuit: string | null;
  case_type: string | null; status: E["case_status"]; client_role: E["party_role"] | null; next_hearing: string | null;
}
export interface ClientDoc {
  id: string; file_name: string; title: string | null; doc_type: E["doc_type"]; doc_date: string | null; page_count: number | null; created_at: string; case_id: string | null;
}
export interface ClientFile {
  id: string; name: string; kind: E["client_kind"]; phone: string | null; address: string | null; created_at: string;
  cases: ClientCase[]; docs: ClientDoc[];
  /** the client's own power-of-attorney paper, if one is saved (the newest) */
  poa: ClientDoc | null;
}

/** One client, or null when it is not there (or of another office: RLS hides it). */
export async function getClient(db: Db, id: string): Promise<ClientFile | null> {
  const { data: c } = await db.from("clients").select("id, name, kind, phone, address, created_at").eq("id", id).neq("review_status", "rejected").maybeSingle();
  if (!c) return null;
  const [{ data: cases }, { data: docs }] = await Promise.all([
    db.from("cases").select("id, title, case_number, case_year, court, circuit, case_type, status, client_role").eq("client_id", id).neq("review_status", "rejected").order("created_at", { ascending: false }),
    db.from("documents").select("id, file_name, title, doc_type, doc_date, page_count, created_at, case_id").eq("client_id", id).neq("review_status", "rejected").order("created_at", { ascending: false }),
  ]);
  const next = await nextHearingByCase(db, (cases ?? []).map((x) => x.id));
  const rows: ClientCase[] = (cases ?? []).map((x) => ({ ...x, next_hearing: next.get(x.id) ?? null }));
  // running cases first, then by the soonest hearing; the rest keep the newest-first order
  rows.sort((a, b) => {
    const ra = RUNNING.includes(a.status) ? 0 : FINISHED.includes(a.status) ? 2 : 1;
    const rb = RUNNING.includes(b.status) ? 0 : FINISHED.includes(b.status) ? 2 : 1;
    if (ra !== rb) return ra - rb;
    if (a.next_hearing && b.next_hearing) return a.next_hearing.localeCompare(b.next_hearing);
    return a.next_hearing ? -1 : b.next_hearing ? 1 : 0;
  });
  return { ...c, cases: rows, docs: docs ?? [], poa: (docs ?? []).find((d) => d.doc_type === "power_of_attorney") ?? null };
}

/** The clients to choose from in «حدد الموكل» (name and phone, by name). */
export async function pickableClients(db: Db): Promise<{ id: string; name: string; phone: string | null }[]> {
  const { data } = await db.from("clients").select("id, name, phone").neq("review_status", "rejected").order("name");
  return data ?? [];
}
