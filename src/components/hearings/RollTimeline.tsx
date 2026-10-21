/**
 * The roll's day content pieces, shared by the server page (?filter=undecided) and the client day view (RollDay):
 * the timeline by court, the empty card and the day's spoken name. No hooks, so it renders on either side.
 */
import type { ReactNode } from "react";
import { RollNext, RollRow } from "@/components/hearings/RollSheet";
import { arDayMonth, WEEKDAY_LONG, weekdayOf } from "@/components/hearings/roll-text";
import { cx } from "@/components/ui";
import { addDaysIso } from "@/lib/dates";
import { courtOf, groupBy, type HearingWithCase } from "@/lib/hearings";

/** «النهارده / بكرة / امبارح / الأربعاء 21 أكتوبر» */
export function dayName(iso: string, today: string) {
  if (iso === today) return "النهارده";
  if (iso === addDaysIso(today, 1)) return "بكرة";
  if (iso === addDaysIso(today, -1)) return "امبارح";
  return `${WEEKDAY_LONG[weekdayOf(iso)]} ${arDayMonth(iso)}`;
}

/**
 * One day's hearings by court: a vertical line with a ring per court (gold when it holds the next hearing), the court
 * and its circuits, then solid cards. `next` is expanded; `label` is the line above its court.
 */
export function Timeline({ rows, today, next, label, showToday = false }: { rows: HearingWithCase[]; today: string; next?: HearingWithCase | null; label?: { text: string; gold: boolean } | null; showToday?: boolean }) {
  const groups = groupBy(rows, courtOf);
  return (
    <ol className="px-1">
      {groups.map((g, gi) => {
        const hasNext = !!next && g.items.some((h) => h.id === next.id);
        const gold = hasNext && !!label?.gold;
        const last = gi === groups.length - 1;
        // the court line: where the hearing sits («الدور 4 · قاعة 12») when known, else the circuit — never invented
        const places = [...new Set(g.items.map((h) => h.location?.trim()).filter(Boolean))];
        const circuits = places.length ? places.join(" · ") : [...new Set(g.items.map((h) => h.case.circuit?.trim()).filter(Boolean))].join(" · ");
        return (
          <li key={g.key} className="flex gap-3.5 sm:gap-4.5">
            <div aria-hidden className="flex w-3 shrink-0 flex-col items-center sm:w-3.5">
              <span className={cx("mt-1.25 size-[11px] shrink-0 rounded-full sm:size-3", gold ? "bg-gold shadow-[0_0_0_4px_var(--accent-ring)] sm:shadow-[0_0_0_5px_var(--accent-ring)]" : "border-2 border-text-4")} />
              {last ? null : <span className="mt-1.5 w-px flex-1 bg-[var(--hairline-v2)]" />}
            </div>
            <div className={cx("min-w-0 flex-1", last ? "pb-0" : "pb-5.5 sm:pb-6.5")}>
              {hasNext && label ? <div className={cx("mb-1 text-xs font-semibold sm:text-sm", label.gold ? "text-gold" : "text-text-3")}>{label.text}</div> : null}
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="min-w-0 truncate text-base font-bold text-text sm:text-md">{g.key}</h3>
                {circuits ? <span className="shrink-0 truncate text-xs text-text-4 sm:text-sm">{circuits}</span> : null}
              </div>
              <ul className="mt-2.5 space-y-2.5 sm:mt-3 sm:space-y-3">
                {g.items.map((h) => <li key={h.id}>{next && h.id === next.id ? <RollNext h={h} today={today} /> : <RollRow h={h} today={today} showToday={showToday} />}</li>)}
              </ul>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-border-2 bg-card px-5 py-6 text-center text-base leading-7 text-text-3 shadow-card">{children}</div>;
}
