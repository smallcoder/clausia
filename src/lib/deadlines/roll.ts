import "server-only";
/**
 * Saved deadlines for the Roll (رول الجلسات): a gold line on the LAST day, a quiet line on each reminder day (last day minus N).
 * RLS client; only confirmed deadlines; nothing when the flag is off.
 */
import { addDaysIso } from "@/lib/dates";
import { deadlinesEnabled } from "@/lib/flags";
import type { Db } from "@/lib/supabase/server";
import { reminderDates } from "./compute";
import type { DeadlineKind, RollDeadline } from "./types";

const MAX_REMINDER_DAYS = 365; // the table's own limit

/** Lines whose day is within from ≤ date ≤ to (ISO), in date order. */
export async function deadlinesInRange(db: Db, from: string, to: string): Promise<RollDeadline[]> {
  if (!deadlinesEnabled()) return [];
  const { data, error } = await db.from("case_deadlines")
    .select("id, kind, last_day, reminders, case_id, cases(title, case_number, case_year, clients(name))")
    .eq("review_status", "confirmed").gte("last_day", from).lte("last_day", addDaysIso(to, MAX_REMINDER_DAYS));
  if (error) throw new Error(error.message);
  const out: RollDeadline[] = [];
  for (const d of data ?? []) {
    const c = d.cases as unknown as { title: string | null; case_number: string | null; case_year: number | null; clients: { name: string } | null } | null;
    const base = {
      id: d.id, kind: d.kind as DeadlineKind, last_day: d.last_day, case_id: d.case_id,
      case_title: [c?.clients?.name, c?.title].filter(Boolean).join(" — ") || "دعوى بلا اسم",
      case_number: c?.case_number ? `${c.case_number}${c.case_year ? ` لسنة ${c.case_year}` : ""}` : null,
    };
    if (d.last_day >= from && d.last_day <= to) out.push({ ...base, date: d.last_day, type: "last_day", days_before: 0 });
    for (const n of [...new Set(d.reminders)]) {
      const date = reminderDates(d.last_day, [n])[0];
      if (date && date >= from && date <= to) out.push({ ...base, date, type: "reminder", days_before: n });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? 0 : a.type === "last_day" ? -1 : 1) || a.days_before - b.days_before);
}
