import "server-only";
/**
 * What the sidebar lists (docs/design/ia): the lawyer's cases (running ones first) with their chat sessions, and the general sessions.
 * Reads with the lawyer's own client (RLS): the cases, and ONE query for the sessions, grouped here.
 * `needsDecision` is the existing «محتاجة قرار» signal (a past hearing with no decision): it is the gold dot.
 * A real «new activity» dot needs a read-state in the database: a future issue.
 */
import { casesNeedingDecision } from "@/lib/cases";
import { caseLabel } from "@/lib/labels";
import type { Db } from "@/lib/supabase/server";
import { DEFAULT_TITLE } from "@/lib/threads";

export interface SideSession { id: string; title: string; /** yyyy-mm-dd of the linked hearing */ hearingDate: string | null }
export interface SideCase {
  id: string;
  /** the client's name: the row's first line */
  name: string;
  /** the case title and number: the row's second line */
  sub: string;
  /** a case that is still running comes first */
  active: boolean;
  needsDecision: boolean;
  sessions: SideSession[];
}
export interface SideData { cases: SideCase[]; general: SideSession[] }

/** Cases that are still running (the rest are judged, suspended or closed). */
const RUNNING = new Set(["active", "reserved_for_judgment"]);
/** Sessions kept per case and in the general list: the newest ones (all of them are on the list button in the chat header). */
export const SIDE_SESSIONS = 6;

export async function loadSidebar(db: Db): Promise<SideData> {
  const [{ data: cases }, { data: threads }, needing] = await Promise.all([
    db.from("cases").select("id, case_number, case_year, title, status, clients(name)").neq("review_status", "rejected").order("updated_at", { ascending: false }).limit(200),
    db.from("chat_threads").select("id, case_id, title, hearings(hearing_date)").order("updated_at", { ascending: false }).limit(600),
    casesNeedingDecision(db).catch(() => new Set<string>()),
  ]);
  const by = new Map<string | null, SideSession[]>();
  for (const t of threads ?? []) {
    const list = by.get(t.case_id) ?? [];
    if (list.length < SIDE_SESSIONS) list.push({ id: t.id, title: t.title || DEFAULT_TITLE, hearingDate: t.hearings?.hearing_date ?? null });
    by.set(t.case_id, list);
  }
  const rows: SideCase[] = (cases ?? []).map((c) => {
    const number = c.case_number ? (c.case_year ? `${c.case_number}/${c.case_year}` : c.case_number) : null;
    const client = c.clients?.name ?? null;
    return {
      id: c.id,
      name: client ?? caseLabel(c),
      sub: client ? ([c.title, number].filter(Boolean).join(" · ") || "دعوى بلا رقم") : "",
      active: RUNNING.has(c.status),
      needsDecision: needing.has(c.id),
      sessions: by.get(c.id) ?? [],
    };
  });
  // a stable sort: running cases first, the recent-first order is kept inside each group
  rows.sort((a, b) => Number(b.active) - Number(a.active));
  return { cases: rows, general: by.get(null) ?? [] };
}
