/**
 * The month view: the weeks of one month as a grid (Saturday first, Friday last), each day with its hearing dots and count.
 * A day opens its day view. No rows here: the month is for seeing where the busy days are. Counts come from the agenda's per-day cache
 * (`counts`: a day not loaded yet is absent → no dots, a calm placeholder instead of a wrong zero). No hooks.
 */
import { agendaHref } from "@/components/agenda/url";
import { dayCount, WEEKDAY_LONG, WEEKDAY_SHORT } from "@/components/hearings/roll-text";
import { cx } from "@/components/ui";
import { addDaysIso, formatDmy } from "@/lib/dates";
import { weekStart } from "@/lib/hearings";

/** Saturday … Friday */
const ORDER = [6, 0, 1, 2, 3, 4, 5];

/** The first and last day of the month of `iso`. */
export function monthBounds(iso: string): { first: string; last: string } {
  const first = `${iso.slice(0, 8)}01`;
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { first, last };
}

/** The same day of the month before / after (clamped to the month's length: 31 Oct → 30 Nov). */
export function shiftMonth(iso: string, by: 1 | -1): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + by, 1));
  const len = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, len))).toISOString().slice(0, 10);
}

export function MonthGrid({ date, today, counts, onPick }: { date: string; today: string; counts: Map<string, number>; onPick: (iso: string, e: React.MouseEvent) => void }) {
  const { first, last } = monthBounds(date);
  const weeks: string[][] = [];
  for (let w = weekStart(first); w <= last; w = addDaysIso(w, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDaysIso(w, i)));
  return (
    <div aria-label="أيام الشهر" className="overflow-hidden rounded-xl border border-border-2 bg-card shadow-card">
      <div aria-hidden className="grid grid-cols-7 border-b border-border-2 py-2.5 text-center text-sm text-text-3">
        {ORDER.map((d) => (
          <span key={d}><span className="sm:hidden">{WEEKDAY_SHORT[d]}</span><span className="hidden sm:inline">{WEEKDAY_LONG[d]}</span></span>
        ))}
      </div>
      {weeks.map((w) => (
        <div key={w[0]} className="grid grid-cols-7 gap-px p-1 sm:gap-1 sm:p-1.5">
          {w.map((d) => {
            const inMonth = d >= first && d <= last;
            const n = counts.get(d);
            const chosen = d === date;
            return (
              <a key={d} href={agendaHref(d)} onClick={(e) => onPick(d, e)} aria-current={d === today ? "date" : chosen ? "true" : undefined}
                className={cx("rounded-lg py-2 text-center transition sm:py-3",
                  chosen ? "bg-selected text-on-selected" : cx(inMonth ? "text-text" : "text-text-3", "hover:bg-card-2"),
                  !chosen && d === today && "ring-1 ring-inset ring-gold-edge")}>
                <span className={cx("font-num block text-lg leading-[1.1] sm:text-xl", chosen ? "font-medium" : "font-light")}>{Number(d.slice(8))}</span>
                <span aria-hidden className="mt-1.25 flex h-1 justify-center gap-0.5 sm:mt-1.5 sm:h-dot sm:gap-0.75">
                  {Array.from({ length: Math.min(n ?? 0, 5) }, (_, i) => <span key={i} className={cx("size-1 rounded-full sm:size-dot", chosen ? "bg-on-selected/85" : "bg-text-4")} />)}
                </span>
                <span className={cx("mt-1 hidden text-xs sm:block", chosen ? "text-on-selected/80" : "text-text-3", !n && "invisible")}>{n ? dayCount(n) : "·"}</span>
                <span className="sr-only">{formatDmy(d)}، {n === undefined ? "" : dayCount(n)}</span>
              </a>
            );
          })}
        </div>
      ))}
    </div>
  );
}
