// OWNER: hearings agent — رول الجلسات by day / week, grouped by court then circuit.
import Link from "next/link";
import { DecisionNotices } from "@/components/hearings/DecisionNotices";
import { HearingItem } from "@/components/hearings/HearingItem";
import { Card, EmptyState, PageHeader, cx } from "@/components/ui";
import { addDaysIso, formatDayLabel, formatDmy, parseDmy, todayIso } from "@/lib/dates";
import { circuitOf, courtOf, groupBy, hearingsInRange, weekStart, type HearingWithCase } from "@/lib/hearings";
import { createClient } from "@/lib/supabase/server";

type View = "day" | "week";

function href(view: View, date: string) {
  return `/hearings?view=${view}&date=${date}`;
}

function CourtBlock({ court, items, today }: { court: string; items: HearingWithCase[]; today: string }) {
  return (
    <Card className="print:rounded-none print:border-0 print:border-t">
      <h3 className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2 text-sm font-semibold text-ink print:bg-transparent print:px-0">
        <span>{court}</span>
        <span className="num text-xs font-normal text-ink-3">{items.length}</span>
      </h3>
      {groupBy(items, circuitOf).map((c) => (
        <div key={c.key}>
          <h4 className="px-4 pt-2.5 text-xs font-semibold text-brass print:px-0">{c.key}</h4>
          <ul className="divide-y divide-line">
            {c.items.map((h) => <HearingItem key={h.id} h={h} today={today} showCircuit={false} decide={h.hearing_date <= today} />)}
          </ul>
        </div>
      ))}
    </Card>
  );
}

export default async function Roll({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const sp = await searchParams;
  const view: View = sp.view === "week" ? "week" : "day";
  const today = todayIso();
  const parsed = parseDmy(sp.date ?? "");
  const date = parsed?.precision === "day" ? parsed.iso : today;
  const from = view === "week" ? weekStart(date) : date;
  const to = view === "week" ? addDaysIso(from, 6) : date;
  const step = view === "week" ? 7 : 1;

  const db = await createClient();
  const rows = await hearingsInRange(db, from, to);
  const undecided = rows.filter((h) => !h.decision_type && h.hearing_date < today).length;

  const title = view === "week" ? <>أسبوع <span className="num">{formatDmy(from)}</span> – <span className="num">{formatDmy(to)}</span></> : formatDayLabel(date);
  const isCurrent = view === "week" ? from === weekStart(today) : date === today;

  return (
    <>
      <PageHeader
        title="رول الجلسات"
        subtitle={<>{title} · <span className="num">{rows.length}</span> جلسة{undecided ? <> · <span className="text-brass"><span className="num">{undecided}</span> بلا قرار</span></> : null}</>}
      />

      <nav className="mb-5 flex flex-wrap items-center gap-2 print:hidden" aria-label="التنقل في الرول">
        <div className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5 text-sm">
          {(["day", "week"] as const).map((v) => (
            <Link key={v} href={href(v, date)} aria-current={v === view ? "page" : undefined}
              className={cx("rounded-md px-3 py-1.5", v === view ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink")}>
              {v === "day" ? "يوم" : "أسبوع"}
            </Link>
          ))}
        </div>
        <div className="inline-flex items-center gap-1">
          <Link href={href(view, addDaysIso(date, -step))} className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink hover:bg-surface-2">
            → {view === "week" ? "الأسبوع السابق" : "السابق"}
          </Link>
          <Link href={href(view, today)} aria-disabled={isCurrent || undefined}
            className={cx("inline-flex h-9 items-center rounded-lg px-3 text-sm", isCurrent ? "text-ink-3" : "text-accent hover:bg-accent-soft")}>
            اليوم
          </Link>
          <Link href={href(view, addDaysIso(date, step))} className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink hover:bg-surface-2">
            {view === "week" ? "الأسبوع التالي" : "التالي"} ←
          </Link>
        </div>
      </nav>

      <DecisionNotices>
      {rows.length === 0 ? (
        <EmptyState
          title={view === "week" ? "لا جلسات في هذا الأسبوع" : "لا جلسات في هذا اليوم"}
          hint="تظهر هنا الجلسات المضافة لدعاوى المكتب. أضف جلسة من تبويب «الجلسات» في صفحة الدعوى، أو أخبر المساعد بها."
        />
      ) : view === "day" ? (
        <div className="space-y-3">
          {groupBy(rows, courtOf).map((g) => <CourtBlock key={g.key} court={g.key} items={g.items} today={today} />)}
        </div>
      ) : (
        <div className="space-y-8">
          {groupBy(rows, (h) => h.hearing_date).map((d) => (
            <section key={d.key} className="print:break-inside-avoid-page">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <Link href={href("day", d.key)} className="hover:text-accent hover:underline">{formatDayLabel(d.key)}</Link>
                {d.key === today ? <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">اليوم</span> : null}
                <span className="num text-xs font-normal text-ink-3">{d.items.length}</span>
              </h2>
              <div className="space-y-3">
                {groupBy(d.items, courtOf).map((g) => <CourtBlock key={g.key} court={g.key} items={g.items} today={today} />)}
              </div>
            </section>
          ))}
        </div>
      )}
      </DecisionNotices>
    </>
  );
}
