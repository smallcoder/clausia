/**
 * The «محتاجة قرار» list, as plain functions (no React, no database), so the tests can check them: which rows wait, in what order, how many.
 * The rows come from `undecidedPastHearings` (before today in Cairo, no decision, not rejected, oldest first). The page keeps a set of the
 * hearings saved in this visit, so a saved row leaves the list and the count drops at once, before the page has been read again.
 */
import type { HearingWithCase } from "@/lib/hearings";
import { circuitNumber, courtOf } from "@/lib/hearings";

/** the page reads at most this many (oldest first); the tab's number is the real count */
export const DECIDE_ROWS = 200;

/** Oldest hearing first; the same day by court, then circuit number, then case number. Does not change the array it is given. */
export function decideOrder(rows: HearingWithCase[]): HearingWithCase[] {
  return [...rows].sort((a, b) =>
    a.hearing_date.localeCompare(b.hearing_date)
    || courtOf(a).localeCompare(courtOf(b), "ar")
    || Number(circuitNumber(a) ?? Infinity) - Number(circuitNumber(b) ?? Infinity)
    || (a.case.case_number ?? "").localeCompare(b.case.case_number ?? "", "ar", { numeric: true }));
}

/** The rows still waiting: those without a decision that were not saved in this visit. */
export function stillWaiting(rows: HearingWithCase[], saved: ReadonlySet<string>): HearingWithCase[] {
  return decideOrder(rows).filter((h) => !h.decision_type && !saved.has(h.id));
}

/**
 * The number on the tab: the real count from the server, less the rows saved here that the server's number still includes
 * (a saved row that is no longer in `rows` was already left out of the server's count by the page that read it).
 */
export function waitingCount(total: number, rows: HearingWithCase[], saved: ReadonlySet<string>): number {
  return Math.max(0, total - rows.filter((h) => saved.has(h.id)).length);
}
