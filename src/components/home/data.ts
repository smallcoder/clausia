import "server-only";
/** Home reads (RLS-bound `db`): today's / tomorrow's roll, the undecided count, the latest confirmed card. */
import { addDaysIso, todayIso } from "@/lib/dates";
import { hearingsInRange, type HearingWithCase } from "@/lib/hearings";
import type { ProposalOp } from "@/lib/proposals";
import type { Db } from "@/lib/supabase/server";
import { clockLabel, describeProposal } from "./text";

export interface HomeData {
  today: string;
  tomorrow: string;
  todays: HearingWithCase[];
  tomorrows: HearingWithCase[];
  /** first hearing date after tomorrow, for the empty state */
  nextDate: string | null;
  /** past hearings with no decision recorded (same rule as the roll's «محتاجة قرار») */
  undecided: number;
  /** «أضفت جلسة … · 11:42 ص», or null when nothing was confirmed yet */
  lastRecorded: string | null;
}

/** Real count, not capped like `undecidedPastHearings`. */
async function undecidedCount(db: Db, today: string): Promise<number> {
  const { count, error } = await db.from("hearings").select("id", { count: "exact", head: true })
    .lt("hearing_date", today).is("decision_type", null).neq("review_status", "rejected");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function nextHearingDate(db: Db, after: string): Promise<string | null> {
  const { data } = await db.from("hearings").select("hearing_date").gt("hearing_date", after).neq("review_status", "rejected")
    .order("hearing_date").limit(1).maybeSingle();
  return data?.hearing_date ?? null;
}

async function lastRecorded(db: Db, today: string): Promise<string | null> {
  const { data: p } = await db.from("proposals").select("ops, decided_at, case_id")
    .in("status", ["confirmed", "partially_confirmed"]).not("decided_at", "is", null)
    .order("decided_at", { ascending: false }).limit(1).maybeSingle();
  if (!p?.decided_at) return null;
  let caseName: string | null = null;
  if (p.case_id) {
    const { data: c } = await db.from("cases").select("title, case_number, case_year, clients(name)").eq("id", p.case_id).maybeSingle();
    const client = (c?.clients as { name: string } | null)?.name;
    caseName = client ?? c?.title?.split(" — ")[0] ?? (c?.case_number ? `${c.case_number}${c.case_year ? ` لسنة ${c.case_year}` : ""}` : null);
  }
  const what = describeProposal((p.ops ?? []) as unknown as ProposalOp[], caseName);
  return what ? `${what} · ${clockLabel(p.decided_at, today)}` : null;
}

export async function loadHome(db: Db): Promise<HomeData> {
  const today = todayIso();
  const tomorrow = addDaysIso(today, 1);
  const [roll, undecided, last, nextDate] = await Promise.all([
    hearingsInRange(db, today, tomorrow),
    undecidedCount(db, today),
    lastRecorded(db, today),
    nextHearingDate(db, tomorrow),
  ]);
  return {
    today, tomorrow, nextDate, undecided, lastRecorded: last,
    todays: roll.filter((h) => h.hearing_date === today),
    tomorrows: roll.filter((h) => h.hearing_date === tomorrow),
  };
}
