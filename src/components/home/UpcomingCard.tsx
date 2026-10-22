/**
 * «الجلسات الجاية» (docs/design/split/Split*Home): a solid card, one row per hearing — the day (gold for today and tomorrow),
 * «client — subject», where it is (court · circuit), and what is needed on the end side. A hearing has a date but no time in
 * the data, so the mockup's «9 ص» under the day is left out. The next 5 from today; «الرول كله» opens the roll.
 */
import Link from "next/link";
import type { HearingWithCase } from "@/lib/hearings";
import { cx } from "@/components/ui";
import { placeLine, rowTitle, upcomingDay } from "./text";

function Row({ h, today }: { h: HearingWithCase; today: string }) {
  const day = upcomingDay(h.hearing_date, today);
  const need = h.purpose?.trim() || null;
  return (
    <Link href={`/cases/${h.case_id}?hearing=${h.id}`} className="group flex items-center gap-4.5 border-t border-border-2 py-3.75">
      <span className={cx("num font-num w-20 shrink-0 text-base font-bold leading-[normal]", day.soon ? "text-gold" : "text-title")}>{day.label}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-md font-semibold leading-[normal] text-text group-hover:underline">{rowTitle(h)}</span>
        <span className="mt-0.75 block truncate text-sm leading-[normal] text-text-3">{placeLine(h)}</span>
      </span>
      {/* the page column is narrow below 1920 (the chat takes its share): the title keeps the room then */}
      {need ? <span className="hidden max-w-[34%] shrink-0 truncate text-sm leading-[normal] text-text-3 3xl:block" /* ds-allow: a share of the row (34%), not a length */>{need}</span> : null}
    </Link>
  );
}

export function UpcomingCard({ rows, today, className = "" }: { rows: HearingWithCase[]; today: string; className?: string }) {
  return (
    <section aria-label="الجلسات الجاية" className={`min-w-0 rounded-xl border border-border-2 bg-card px-4.5 py-1.5 shadow-card md:px-6.5 ${className}`}>
      <div className="flex items-baseline justify-between pb-2.5 pt-4">
        <h2 className="text-base font-bold leading-[normal] text-text">الجلسات الجاية</h2>
        <Link href="/hearings" className="tap text-sm leading-[normal] text-text-3 hover:text-text">الرول كله</Link>
      </div>
      {rows.length ? rows.map((h) => <Row key={h.id} h={h} today={today} />) : (
        <div className="border-t border-border-2 py-5 md:py-6">
          <div className="text-md font-semibold text-text">مفيش جلسات جاية</div>
          <div className="mt-1 text-sm text-text-3">
            <Link href="/hearings" className="font-semibold text-text-2 hover:text-text">افتح الرول ←</Link>
          </div>
        </div>
      )}
    </section>
  );
}
