/**
 * Reads for the brief page (read-only, the caller's RLS client). Which day to show, then one batch of reads for that
 * day's hearings: the previous hearings, the confirmed facts and the papers of those cases.
 */
import { addDaysIso, parseDmy } from "@/lib/dates";
import { hearingsInRange, type HearingWithCase } from "@/lib/hearings";
import type { Db } from "@/lib/supabase/server";
import { buildCard, type BriefCard, type BriefFact, type BriefInput, type PrevHearing } from "./build";

/** how far ahead to look for the next day with hearings when tomorrow has none */
const LOOK_AHEAD_DAYS = 7;

export interface BriefData {
  /** the day shown, yyyy-mm-dd */
  date: string;
  cards: BriefCard[];
  /** tomorrow had none: the next day (within a week) that has hearings is shown instead */
  fellForward: boolean;
}

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as T;
}

/** `?date=` as the roll writes it (d/m/yyyy) or ISO (yyyy-mm-dd, what the reminder links to); null when it is neither. */
export function dateParam(s: string | undefined): string | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return parseDmy(s.replace(/-/g, "/"))?.iso ?? null;
  const p = parseDmy(s);
  return p?.precision === "day" ? p.iso : null;
}

/** The cards for hearings already read (all on one day). Three batched reads, no per-card query. */
export async function cardsFor(db: Db, hearings: HearingWithCase[]): Promise<BriefCard[]> {
  if (!hearings.length) return [];
  const caseIds = [...new Set(hearings.map((h) => h.case_id))];
  const prevIds = [...new Set(hearings.map((h) => h.previous_hearing_id).filter((x): x is string => !!x))];
  const [prevRows, factRows, docRows] = await Promise.all([
    prevIds.length
      ? db.from("hearings").select("id, hearing_date, decision_type, decision_text, next_requirements").in("id", prevIds).eq("review_status", "confirmed").then((r) => must(r) as PrevHearing[])
      : Promise.resolve([] as PrevHearing[]),
    db.from("case_facts").select("case_id, text, fact_date, sort_order, created_at").in("case_id", caseIds).eq("review_status", "confirmed").then((r) => must(r) as (BriefFact & { case_id: string })[]),
    db.from("documents").select("case_id, doc_type").in("case_id", caseIds).neq("review_status", "rejected").then((r) => must(r) as { case_id: string; doc_type: BriefInput["docTypes"][number] }[]),
  ]);
  const prevById = new Map(prevRows.map((p) => [p.id, p]));
  return hearings.map((hearing) => buildCard({
    hearing,
    prev: hearing.previous_hearing_id ? prevById.get(hearing.previous_hearing_id) ?? null : null,
    facts: factRows.filter((f) => f.case_id === hearing.case_id),
    docTypes: docRows.filter((d) => d.case_id === hearing.case_id).map((d) => d.doc_type),
  }));
}

/**
 * The brief for `asked` (an explicit day, e.g. from the reminder) or for tomorrow (`tomorrow`, Cairo). With no explicit day
 * and nothing tomorrow, it shows the next day in the coming week that has hearings (`fellForward`); nothing there either → empty.
 */
export async function loadBrief(db: Db, tomorrow: string, asked: string | null): Promise<BriefData> {
  if (asked) {
    const rows = await hearingsInRange(db, asked, asked);
    return { date: asked, cards: await cardsFor(db, rows), fellForward: false };
  }
  const rows = await hearingsInRange(db, tomorrow, addDaysIso(tomorrow, LOOK_AHEAD_DAYS));
  const day = rows[0]?.hearing_date ?? null; // hearingsInRange is ordered by date
  if (!day) return { date: tomorrow, cards: [], fellForward: false };
  return { date: day, cards: await cardsFor(db, rows.filter((h) => h.hearing_date === day)), fellForward: day !== tomorrow };
}
