// OWNER: hearings agent — home: today's + tomorrow's hearings, past hearings with no decision.
import Link from "next/link";
import { HearingItem } from "@/components/hearings/HearingItem";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { addDaysIso, formatDayLabel, formatDmy, todayIso } from "@/lib/dates";
import { courtOf, groupBy, hearingsInRange, undecidedPastHearings, type HearingWithCase } from "@/lib/hearings";
import { createClient, getSession } from "@/lib/supabase/server";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "صباح الخير" : "مساء الخير";
}

function DayList({ items, today }: { items: HearingWithCase[]; today: string }) {
  return (
    <div className="space-y-3">
      {groupBy(items, courtOf).map((g) => (
        <Card key={g.key}>
          <h3 className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">
            <span>{g.key}</span>
            <span className="num text-xs font-normal text-ink-3">{g.items.length}</span>
          </h3>
          <ul className="divide-y divide-line">
            {g.items.map((h) => <HearingItem key={h.id} h={h} today={today} />)}
          </ul>
        </Card>
      ))}
    </div>
  );
}

export default async function Home() {
  const db = await createClient();
  const today = todayIso();
  const tomorrow = addDaysIso(today, 1);
  const [session, upcoming, undecided] = await Promise.all([getSession(db), hearingsInRange(db, today, tomorrow), undecidedPastHearings(db)]);
  const todays = upcoming.filter((h) => h.hearing_date === today);
  const tomorrows = upcoming.filter((h) => h.hearing_date === tomorrow);
  const name = session?.displayName && !session.displayName.includes("@") ? `، ${session.displayName}` : "";

  return (
    <>
      <PageHeader title={`${greeting()}${name}`} subtitle={formatDayLabel(today)} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-8">
          <section aria-labelledby="today">
            <SectionTitle actions={<Link href={`/hearings?view=day&date=${today}`} className="text-sm text-accent hover:underline">رول اليوم</Link>}>
              <span id="today">جلسات اليوم{todays.length ? <span className="num ms-1 font-normal text-ink-3">({todays.length})</span> : null}</span>
            </SectionTitle>
            {todays.length ? <DayList items={todays} today={today} /> : <EmptyState title="لا جلسات اليوم" hint="يوم بلا جلسات. يمكنك مراجعة الجلسات السابقة التي لم يُسجَّل قرارها." />}
          </section>

          <section aria-labelledby="tomorrow">
            <SectionTitle actions={<Link href={`/hearings?view=day&date=${tomorrow}`} className="text-sm text-accent hover:underline">رول الغد</Link>}>
              <span id="tomorrow">جلسات الغد <span className="num font-normal text-ink-3">{formatDmy(tomorrow)}</span>{tomorrows.length ? <span className="num ms-1 font-normal text-ink-3">({tomorrows.length})</span> : null}</span>
            </SectionTitle>
            {tomorrows.length ? <DayList items={tomorrows} today={today} /> : <EmptyState title="لا جلسات غدًا" hint="عندما تضيف جلسة لأي دعوى ستظهر هنا قبلها بيوم." />}
          </section>
        </div>

        <aside className="space-y-8">
          <section aria-labelledby="undecided">
            <SectionTitle>
              <span id="undecided">جلسات سابقة بلا قرار{undecided.length ? <span className="num ms-1 font-normal text-ink-3">({undecided.length})</span> : null}</span>
            </SectionTitle>
            {undecided.length ? (
              <Card>
                <p className="border-b border-line px-4 py-2.5 text-xs text-ink-3">الأقدم أولًا. سجّل ما قررته المحكمة حتى تُنشأ الجلسة القادمة.</p>
                <ul className="divide-y divide-line">
                  {undecided.map((h) => <HearingItem key={h.id} h={h} today={today} showDate showCourt decide />)}
                </ul>
              </Card>
            ) : (
              <EmptyState title="كل الجلسات السابقة مسجّل قرارها" hint="لا شيء متأخر." />
            )}
          </section>

          <Link href="/chat" className="block rounded-[var(--radius)] border border-line bg-accent-soft px-4 py-4 transition hover:border-accent/40">
            <p className="font-medium text-accent">أخبر المساعد بما حدث في الجلسة</p>
            <p className="mt-1 text-sm text-ink-2">اكتب القرار كما سمعته، مثل «أجلت لجلسة 5/11/2026 لتقديم المستندات»، وسيعرض عليك بطاقة لتأكيدها قبل الحفظ.</p>
          </Link>
        </aside>
      </div>
    </>
  );
}
