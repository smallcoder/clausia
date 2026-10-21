/** Today's roll card (falls back to tomorrow with a label; a real empty state when both are empty). */
import Link from "next/link";
import type { HearingWithCase } from "@/lib/hearings";
import { caseNumber, circuitNo, formatLongDay, hearingsCount, rowTitle, shortCourt } from "./text";

const MAX_ROWS = 5;

function Row({ h }: { h: HearingWithCase }) {
  const long = caseNumber(h, "long");
  const short = caseNumber(h, "short");
  const court = shortCourt(h.case.court);
  return (
    <Link href={`/cases/${h.case_id}`} className="group flex items-center gap-2.5 py-[9px] sm:gap-3 sm:py-[11px]">
      <span title={h.case.circuit ?? undefined}
        className="font-num inline-flex size-[34px] shrink-0 items-center justify-center rounded-[10px] border border-[var(--accent-edge)] bg-ink-solid text-[14px] font-extrabold text-gold sm:size-[38px] sm:rounded-[11px] sm:text-[15px]">
        {circuitNo(h.case.circuit)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-bold leading-normal text-text group-hover:underline sm:text-[14.5px]">{rowTitle(h)}</span>
        <span className="block truncate text-[11.5px] leading-normal text-text-3 sm:text-[12.5px]">
          {court}
          {long ? <> · <span className="hidden sm:inline">{long}</span><span className="num sm:hidden">{short}</span></> : null}
        </span>
      </span>
      {h.purpose ? <span className="hidden max-w-[40%] shrink-0 truncate text-xs text-text-2 sm:block">{h.purpose}</span> : null}
    </Link>
  );
}

export function TodayCard({ todays, tomorrows, tomorrow, nextDate, className = "" }: {
  todays: HearingWithCase[];
  tomorrows: HearingWithCase[];
  tomorrow: string;
  nextDate: string | null;
  className?: string;
}) {
  const showTomorrow = !todays.length && tomorrows.length > 0;
  const list = todays.length ? todays : tomorrows;
  const more = list.length - MAX_ROWS;
  return (
    <section aria-label={showTomorrow ? "جلسات بكره" : "جلسات النهارده"}
      className={`min-w-0 rounded-[18px] border border-border-2 bg-card px-3 py-1 shadow-card sm:rounded-[20px] sm:px-4 sm:py-1.5 ${className}`}>
      {showTomorrow ? (
        <div className="flex items-baseline justify-between gap-2 border-b border-border-2 pb-2 pt-2.5 text-xs">
          <span className="font-bold text-gold-text">بكره · {formatLongDay(tomorrow)}</span>
          <span className="text-text-4">{hearingsCount(tomorrows.length)}</span>
        </div>
      ) : null}
      {list.length ? (
        <div className="divide-y divide-border-2">
          {list.slice(0, MAX_ROWS).map((h) => <Row key={h.id} h={h} />)}
          {more > 0 ? (
            <Link href="/hearings" className="block py-3 text-[13px] font-semibold text-gold-text">و{hearingsCount(more)} كمان في الرول ←</Link>
          ) : null}
        </div>
      ) : (
        <div className="py-4">
          <div className="text-[14.5px] font-bold text-text">مفيش جلسات النهارده ولا بكره</div>
          <div className="mt-1 text-[12.5px] text-text-3">
            {nextDate ? <>أقرب جلسة يوم {formatLongDay(nextDate)} · </> : null}
            <Link href="/hearings" className="font-semibold text-gold-text">افتح الرول ←</Link>
          </div>
        </div>
      )}
    </section>
  );
}
