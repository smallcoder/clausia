/**
 * The saved appeal deadlines of one Roll day (item 5): the LAST day is a gold card, a reminder is a quiet line. Both open the case.
 * Nothing renders when the day has none (and none are loaded with the flag off).
 */
import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { DateText, cx } from "@/components/ui";
import { formatDayLabel } from "@/lib/dates";
import { daysBetween } from "@/lib/deadlines/compute";
import type { RollDeadline } from "@/lib/deadlines/types";

const KIND = { appeal: "الاستئناف", cassation: "الطعن بالنقض" } as const;
const nDays = (n: number) => (n === 1 ? "يوم" : n === 2 ? "يومين" : n <= 10 ? `${n} أيام` : `${n} يوم`);

export function DeadlineRows({ rows, today }: { rows: RollDeadline[]; today: string }) {
  if (!rows.length) return null;
  return (
    <ul aria-label="مواعيد الطعن" className="mb-4 space-y-2.5">
      {rows.map((d) => {
        const last = d.type === "last_day";
        const href = `/cases/${d.case_id}`;
        return (
          <li key={`${d.id}:${d.type}:${d.days_before}`}>
            <Link href={href} className={cx("flex items-center gap-3.5 rounded-xl border bg-card px-5 py-3.5 transition hover:bg-card-2", last ? "border-gold-edge shadow-card" : "border-border-2")}>
              <span aria-hidden className={cx("inline-flex size-9 shrink-0 items-center justify-center rounded-md", last ? "bg-gold-bg text-gold" : "bg-card-2 text-text-3")}>
                <CalendarClock size={18} strokeWidth={1.9} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx("block text-md font-bold", last ? "text-gold-text-small" : "text-text")}>
                  {last ? `آخر يوم لميعاد ${KIND[d.kind]}` : `تنبيه: فاضل ${nDays(d.days_before)} على آخر يوم ${KIND[d.kind]}`}
                </span>
                <span className="mt-0.5 block truncate text-base text-text-2">{d.case_title}{d.case_number ? <> · <span className="num font-num">{d.case_number}</span></> : null}</span>
                {!last ? <span className="block text-sm text-text-3">آخر يوم: <DateText value={formatDayLabel(d.last_day)} />{d.last_day >= today ? <> · <DateText value={`فاضل ${daysBetween(today, d.last_day)} يوم`} /></> : null}</span> : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
