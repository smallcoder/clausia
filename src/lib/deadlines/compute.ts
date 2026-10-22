/**
 * The date math of an appeal deadline: pure code, no model, no database (the holidays come in as a set).
 *
 *  - art. 15: the day of the judgment (or of its service) is NOT counted, so the last day = start + N days;
 *  - art. 18 (owner's rule): if the last day is an official holiday, the period moves to the first working day after it.
 *    A working day is not a Friday (the weekly rest; owner decision) and not an APPROVED holiday of the shared table;
 *  - a last day in a year that has no approved holidays at all is marked `reviewHolidays`: the card says «راجع الإجازات»
 *    next to the date instead of pretending the list is complete.
 * Days left count from today (Africa/Cairo, `todayIso()`) to the last day.
 */
import { addDaysIso } from "@/lib/dates";

export interface HolidayInfo {
  /** approved holiday dates (yyyy-mm-dd) */
  dates: ReadonlySet<string>;
  /** years that have at least one approved holiday: the list of such a year is considered reviewed */
  approvedYears: ReadonlySet<number>;
}

export interface LastDay {
  /** start + N days, before any move */
  raw: string;
  /** the date the lawyer must file by */
  last: string;
  /** the last day was moved forward (Friday or an official holiday) */
  moved: boolean;
  /** the raw or final date falls in a year with no approved holidays */
  reviewHolidays: boolean;
}

const dayOfWeek = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun … 5 Fri … 6 Sat
};
export const isFriday = (iso: string) => dayOfWeek(iso) === 5;
const yearOf = (iso: string) => Number(iso.slice(0, 4));

export function lastDay(start: string, days: number, holidays: HolidayInfo): LastDay {
  const raw = addDaysIso(start, days);
  let last = raw;
  // a holiday may be followed by a Friday (or the other way round): keep moving until a working day
  for (let i = 0; i < 60 && (isFriday(last) || holidays.dates.has(last)); i++) last = addDaysIso(last, 1);
  const reviewHolidays = !holidays.approvedYears.has(yearOf(raw)) || !holidays.approvedYears.has(yearOf(last));
  return { raw, last, moved: last !== raw, reviewHolidays };
}

/** Whole days from `today` to `iso` (negative when it has passed). */
export function daysBetween(today: string, iso: string): number {
  const t = (s: string) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(iso) - t(today)) / 86_400_000);
}

/** The reminder dates of a deadline: last day minus N days (N = 1, 3, 7 …), nearest first is NOT assumed; sorted ascending, today or later only is the caller's job. */
export function reminderDates(last: string, reminders: readonly number[]): string[] {
  return [...new Set(reminders)].filter((n) => Number.isInteger(n) && n >= 1).sort((a, b) => b - a).map((n) => addDaysIso(last, -n));
}
