import "server-only";
/** Home reads (RLS-bound `db`): today's / tomorrow's roll, the undecided count. */
import { addDaysIso, todayIso } from "@/lib/dates";
import { hearingsInRange, type HearingWithCase } from "@/lib/hearings";
import type { Db } from "@/lib/supabase/server";

export interface HomeData {
  today: string;
  tomorrow: string;
  todays: HearingWithCase[];
  tomorrows: HearingWithCase[];
  /** first hearing date after tomorrow, for the empty state */
  nextDate: string | null;
  /** past hearings with no decision recorded (same rule as the roll's «محتاجة قرار») */
  undecided: number;
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

export async function loadHome(db: Db): Promise<HomeData> {
  const today = todayIso();
  const tomorrow = addDaysIso(today, 1);
  const [roll, undecided, nextDate] = await Promise.all([
    hearingsInRange(db, today, tomorrow),
    undecidedCount(db, today),
    nextHearingDate(db, tomorrow),
  ]);
  return {
    today, tomorrow, nextDate, undecided,
    todays: roll.filter((h) => h.hearing_date === today),
    tomorrows: roll.filter((h) => h.hearing_date === tomorrow),
  };
}
