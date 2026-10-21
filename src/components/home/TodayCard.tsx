/**
 * «جلسات النهارده» (docs/design/*Home.dc.html): a solid card, one row per hearing — the circuit number in large light digits,
 * «client — subject», where it is (court · circuit), and what's needed on the side. Falls back to tomorrow's roll
 * (labelled), then to a calm empty state.
 */
import Link from "next/link";
import type { HearingWithCase } from "@/lib/hearings";
import { circuitNo, formatLongDay, hearingsCount, placeLine, rowTitle } from "./text";

const MAX_ROWS = 5;

function Row({ h }: { h: HearingWithCase }) {
  const place = placeLine(h);
  const need = h.purpose?.trim() || null;
  return (
    <Link href={`/cases/${h.case_id}`} className="group flex items-center gap-3.5 border-t border-[var(--hairline-v2)] py-3 md:gap-[18px] md:py-4">
      <span title={h.case.circuit ?? undefined}
        className="font-num w-[22px] shrink-0 text-center text-lg font-light text-gold md:w-[30px] md:text-xl">
        {circuitNo(h.case.circuit)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold leading-[18px] text-text group-hover:underline md:text-md md:leading-[21px]">{rowTitle(h)}</span>
        {/* desktop: where it is; mobile: what's needed (or where, when nothing is noted) */}
        <span className="mt-[3px] hidden truncate text-sm leading-[17px] text-text-3 md:block">{place}</span>
        <span className="mt-0.5 block truncate text-xs leading-4 text-text-3 md:hidden">{need ?? place}</span>
      </span>
      {need ? <span className="hidden max-w-[34%] shrink-0 truncate text-sm leading-[17px] text-text-3 md:block">{need}</span> : null}
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
  const title = showTomorrow ? `جلسات بكره · ${formatLongDay(tomorrow)}` : "جلسات النهارده";
  return (
    <section aria-label={showTomorrow ? "جلسات بكره" : "جلسات النهارده"}
      className={`min-w-0 rounded-[24px] border border-border-2 bg-card px-[18px] py-1 shadow-card md:rounded-[28px] md:px-[26px] md:py-2 ${className}`}>
      <h2 className="pb-1 pt-3 text-xs font-normal leading-4 text-text-4 md:pb-1.5 md:font-medium md:pt-4 md:text-sm">{title}</h2>
      {list.length ? (
        <div>
          {list.slice(0, MAX_ROWS).map((h) => <Row key={h.id} h={h} />)}
          {more > 0 ? (
            <Link href="/hearings" className="flex min-h-11 items-center border-t border-[var(--hairline-v2)] text-sm font-semibold text-text-2 hover:text-text">
              و{hearingsCount(more)} كمان في الرول ←
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="border-t border-[var(--hairline-v2)] py-5 md:py-6">
          <div className="text-md font-semibold text-text">مفيش جلسات النهارده ولا بكره</div>
          <div className="mt-1 text-sm text-text-3">
            {nextDate ? <>أقرب جلسة يوم {formatLongDay(nextDate)} · </> : null}
            <Link href="/hearings" className="font-semibold text-text-2 hover:text-text">افتح الرول ←</Link>
          </div>
        </div>
      )}
    </section>
  );
}
