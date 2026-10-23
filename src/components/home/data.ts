import "server-only";
/** Home's page-side reads (RLS-bound `db`): the next hearings, the undecided count, the open cases, this week's hearings. */
import { addDaysIso, todayIso } from "@/lib/dates";
import { upcomingHearings, type HearingWithCase } from "@/lib/hearings";
import type { Db } from "@/lib/supabase/server";

/** «this week» = today and the 6 days after (the same window as the morning brief) */
const WEEK_DAYS = 7;
/** rows in «الجلسات الجاية» */
export const UPCOMING_ROWS = 5;

export interface HomeData {
  today: string;
  /** the next hearings from today on, soonest first */
  upcoming: HearingWithCase[];
  /** past hearings with no decision recorded (same rule as the roll's «محتاجة قرار») */
  undecided: number;
  /** cases that are not judged or closed */
  openCases: number;
  /** hearings from today through the next 6 days */
  weekHearings: number;
}

async function count(q: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const r = await q;
  if (r.error) throw new Error(r.error.message);
  return r.count ?? 0;
}

export async function loadHome(db: Db): Promise<HomeData> {
  const today = todayIso();
  const [upcoming, undecided, openCases, weekHearings] = await Promise.all([
    upcomingHearings(db, today, UPCOMING_ROWS),
    count(db.from("hearings").select("id", { count: "exact", head: true }).lt("hearing_date", today).is("decision_type", null).neq("review_status", "rejected")),
    count(db.from("cases").select("id", { count: "exact", head: true }).not("status", "in", "(judged,closed)")),
    count(db.from("hearings").select("id", { count: "exact", head: true }).gte("hearing_date", today).lte("hearing_date", addDaysIso(today, WEEK_DAYS - 1)).neq("review_status", "rejected")),
  ]);
  return { today, upcoming, undecided, openCases, weekHearings };
}
