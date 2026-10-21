// OWNER: roll agent — الرول (design v2, docs/design/*Roll.dc.html, laid out exactly): header with the date and «05 جلسات الأسبوع» (desktop) / the «محتاجة قرار» pill (mobile),
// one continuous day strip (a dot per hearing; RollStrip), a timeline by court with the next hearing expanded, a desktop side card of past hearings that need a
// decision, and the Clausia composer. ?view=week, ?filter=undecided, ?date=d/m/yyyy. The day/week view runs on the client (RollDay) from a per-day
// cache; this page renders its first view with the chosen week ±3 weeks, and the whole ?filter=undecided list.
import Link from "next/link";
import { OpenHearing, RollRow, RollSheet } from "@/components/hearings/RollSheet";
import { hearingTitle, nHearings, shortDm } from "@/components/hearings/roll-text";
import { RollHeader, RollSays } from "@/components/hearings/RollHeader";
import { RollDay } from "@/components/hearings/RollDay";
import { Empty } from "@/components/hearings/RollTimeline";
import { two } from "@/components/shell/PageHero";
import { Composer, type ComposerChip } from "@/components/shell/Composer";
import { addDaysIso, formatDmy, parseDmy, todayIso } from "@/lib/dates";
import { courtOf, hearingsInRange, undecidedPastCount, undecidedPastHearings, weekStart, type HearingWithCase } from "@/lib/hearings";
import { createClient } from "@/lib/supabase/server";

const SIDE_ROWS = 3;
/** weeks of rows rendered on each side of the chosen week (the client keeps this buffer while scrolling) */
const SSR_WEEKS = 3;

/** Desktop: past hearings that still need a decision, each with «سجّل» (opens the decision sheet). */
function SideCard({ count, rows }: { count: number; rows: HearingWithCase[] }) {
  const more = count - rows.length;
  return (
    <section aria-label="جلسات محتاجة قرار" className="rounded-xl border border-[var(--accent-edge)] bg-card px-6 pb-1.5 pt-2 shadow-card">
      <Link href="/hearings?filter=undecided" className="flex items-center gap-3 pb-3 pt-4 transition hover:opacity-80">
        <span className="font-num text-2xl font-extralight leading-none text-gold">{two(count)}</span>
        <span>
          <span className="flex items-center gap-1.5 text-base font-bold text-gold"><span aria-hidden className="size-1.5 rounded-full bg-gold" />محتاجة قرار</span>
          <span className="mt-0.75 block text-sm text-text-3">جلسات فاتت ولسه قرارها متسجّلش</span>
        </span>
      </Link>
      <ul>
        {rows.map((h) => (
          <li key={h.id} className="flex items-center gap-3 border-t border-[var(--hairline-v2)] py-3.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold text-text">{hearingTitle(h)}</div>
              <div className="mt-0.75 truncate text-sm text-text-3">{courtOf(h)} · <span className="num font-num">{shortDm(h.hearing_date)}</span></div>
            </div>
            <OpenHearing h={h} label={`سجّل قرار جلسة ${hearingTitle(h)} يوم ${formatDmy(h.hearing_date)}`}
              className="bg-primary-fill tap inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold transition hover:opacity-90">
              سجّل
            </OpenHearing>
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <Link href="/hearings?filter=undecided" className="block border-t border-[var(--hairline-v2)] py-3 text-center text-sm text-text-3 hover:text-text">
          {more === 1 ? "والجلسة الرابعة" : `وكمان ${nHearings(more)}`}
        </Link>
      ) : null}
    </section>
  );
}

export default async function Roll({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; filter?: string }> }) {
  const sp = await searchParams;
  const undecidedMode = sp.filter === "undecided";
  const today = todayIso();
  const parsed = parseDmy(sp.date ?? "");
  const date = parsed?.precision === "day" ? parsed.iso : today;
  const wk = weekStart(date);
  const from = addDaysIso(wk, -7 * SSR_WEEKS);
  const to = addDaysIso(wk, 7 * SSR_WEEKS + 6);

  const db = await createClient();
  const [rows, undecidedCount, undecidedRows] = await Promise.all([
    undecidedMode ? Promise.resolve([] as HearingWithCase[]) : hearingsInRange(db, from, to),
    undecidedPastCount(db),
    // the whole list for ?filter=undecided; otherwise the oldest few, for the side card
    undecidedPastHearings(db, undecidedMode ? 200 : SIDE_ROWS),
  ]);

  const chips: ComposerChip[] = [
    { label: "اتأجلت لـ…", text: "اتأجلت لـ " },
    { label: "اتحجزت للحكم", text: "اتحجزت للحكم لجلسة " },
    { label: "ارفع محضر الجلسة", short: "صوّر المحضر", attach: true, icon: "file" },
  ];

  // the undecided count: the side card on desktop (lg+), this pill below it (the mockup draws it on mobile)
  const pill = undecidedCount > 0 && !undecidedMode ? (
    <Link href="/hearings?filter=undecided" className="inline-flex h-11 shrink-0 items-center lg:hidden" aria-label={`${nHearings(undecidedCount)} محتاجة قرار`}>
      <span className="inline-flex h-[36px] items-center gap-1.5 rounded-full border border-[var(--accent-edge)] px-3 text-sm font-semibold text-gold transition hover:bg-[var(--accent-wash)]">
        <span aria-hidden className="size-1.5 rounded-full bg-gold" /><span className="font-num">{undecidedCount}</span> محتاجة قرار
      </span>
    </Link>
  ) : null;

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-1 flex-col px-4 sm:px-10">
      <RollSheet today={today}>
        {undecidedMode ? (
          <>
            <RollHeader back="/hearings" eyebrow="جلسات فاتت من غير قرار" title="محتاجة قرار" />
            <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-7 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
              <div>
                {undecidedRows.length ? (
                  <ul className="space-y-2.5 sm:space-y-3">
                    {undecidedRows.map((h) => <li key={h.id}><RollRow h={h} today={today} showDate showCourt /></li>)}
                  </ul>
                ) : <Empty>مفيش جلسات فاتت من غير قرار.</Empty>}
              </div>
              <div className="order-first leading-[normal] lg:order-none">
                <RollSays>
                  {undecidedRows.length
                    ? <>دي {nHearings(undecidedCount)} فاتت ولسه قرارها ما اتسجّلش، الأقدم الأول. اضغط على الجلسة وسجّل القرار، أو اكتبهولي زي ما سمعته وأنا أسجّله.</>
                    : <>كل الجلسات اللي فاتت متسجّل قرارها. مفيش حاجة مستنياك هنا.</>}
                </RollSays>
              </div>
            </div>
          </>
        ) : (
          <RollDay today={today} from={from} to={to} rows={rows} pill={pill}
            side={undecidedCount > 0 ? <SideCard count={undecidedCount} rows={undecidedRows} /> : null} />
        )}
      </RollSheet>

      <div className="min-h-6 flex-1" />
      <Composer target={{ kind: "new" }} chips={chips}
        placeholder="اكتب قرار أي جلسة… مثلاً: الإخلاء اتأجلت 5/11 لتقديم الأصل"
        placeholderShort="قرار أي جلسة… مثلاً: الإخلاء اتأجلت 5/11" />
    </div>
  );
}
