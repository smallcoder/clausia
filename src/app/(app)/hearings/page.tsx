// OWNER: roll agent — الرول (design v2, docs/design/*Roll.dc.html): header with the date and the «محتاجة قرار» pill,
// the week's day strip (a dot per hearing), a timeline by court with the next hearing expanded, a desktop side card of
// past hearings that need a decision, and the Clausia composer. ?view=week, ?filter=undecided, ?date=d/m/yyyy.
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { OpenHearing, RollNext, RollRow, RollSheet } from "@/components/hearings/RollSheet";
import { arDate, arDayMonth, dayCount, hearingTitle, nCourts, nHearings, shortDm, WEEKDAY_LONG, WEEKDAY_SHORT, weekdayOf } from "@/components/hearings/roll-text";
import { ClausiaSays, PageHero, StatusChip, two } from "@/components/shell/PageHero";
import { Composer, type ComposerChip } from "@/components/shell/Composer";
import { cx } from "@/components/ui";
import { addDaysIso, formatDmy, parseDmy, todayIso } from "@/lib/dates";
import { countByDay, courtOf, groupBy, hearingsInRange, nextUndecided, undecidedPastCount, undecidedPastHearings, weekStart, type HearingWithCase } from "@/lib/hearings";
import { createClient } from "@/lib/supabase/server";

type View = "day" | "week";
const href = (view: View, iso: string) => `/hearings?view=${view}&date=${formatDmy(iso)}`;
const SIDE_ROWS = 3;

/** «النهارده / بكرة / امبارح / الأربعاء 21 أكتوبر» */
function dayName(iso: string, today: string) {
  if (iso === today) return "النهارده";
  if (iso === addDaysIso(today, 1)) return "بكرة";
  if (iso === addDaysIso(today, -1)) return "امبارح";
  return `${WEEKDAY_LONG[weekdayOf(iso)]} ${arDayMonth(iso)}`;
}

/** The week: Sat–Thu (Friday only when chosen or it has hearings); weekday, big day number, one dot per hearing. */
function DayStrip({ days, date, view, today, counts, wk }: { days: string[]; date: string; view: View; today: string; counts: Map<string, number>; wk: string }) {
  const arrow = "hidden size-11 shrink-0 items-center justify-center self-center rounded-full text-text-3 transition hover:bg-card-2 hover:text-text sm:inline-flex";
  return (
    <nav aria-label="أيام الأسبوع" className="mt-[18px] flex items-stretch justify-between sm:mt-[26px] sm:gap-1.5 sm:rounded-[30px] sm:border sm:border-border-2 sm:bg-card sm:p-1.5 sm:shadow-card">
      <Link href={href(view, addDaysIso(wk, -7))} aria-label="الأسبوع اللي فات" className={arrow}><ChevronRight size={18} strokeWidth={1.9} aria-hidden /></Link>
      {days.map((d) => {
        const on = view === "day" && d === date;
        const n = counts.get(d) ?? 0;
        const wd = weekdayOf(d);
        return (
          <Link key={d} href={href("day", d)} aria-current={on ? "date" : undefined}
            className={cx("w-[50px] rounded-[18px] pb-[7px] pt-2 text-center transition sm:w-auto sm:flex-1 sm:rounded-[22px] sm:pb-[11px] sm:pt-3",
              on ? "bg-selected text-on-selected shadow-[0_4px_10px_-4px_var(--backdrop)]" : "text-text hover:bg-card-2",
              !on && d === today && "ring-1 ring-inset ring-[var(--accent-edge)]")}>
            <span className={cx("block text-[10.5px] sm:text-[12px]", on ? "text-on-selected/80" : d === today ? "font-semibold text-gold" : "text-text-3")}>
              <span className="sm:hidden">{WEEKDAY_SHORT[wd]}</span><span className="hidden sm:inline">{WEEKDAY_LONG[wd]}</span>
            </span>
            <span className={cx("font-num mt-0.5 block text-[19px] leading-[1.1] sm:mt-[3px] sm:text-[26px]", on ? "font-medium" : "font-light")}>{Number(d.slice(8))}</span>
            <span aria-hidden className="mt-[5px] flex h-1 justify-center gap-[2px] sm:mt-1.5 sm:h-[5px] sm:gap-[3px]">
              {Array.from({ length: Math.min(n, 6) }, (_, i) => <span key={i} className={cx("size-1 rounded-full sm:size-[5px]", on ? "bg-on-selected/85" : "bg-text-4")} />)}
            </span>
            <span className="sr-only">{d === today ? "النهارده، " : ""}{dayCount(n)}</span>
          </Link>
        );
      })}
      <Link href={href(view, addDaysIso(wk, 7))} aria-label="الأسبوع الجاي" className={arrow}><ChevronLeft size={18} strokeWidth={1.9} aria-hidden /></Link>
    </nav>
  );
}

/** Mobile: moving through the roll (the strip has no room for arrows). */
function MobileNav({ view, date, wk, today, isCurrent }: { view: View; date: string; wk: string; today: string; isCurrent: boolean }) {
  const btn = "inline-flex h-11 items-center gap-1 px-2 text-[12.5px] text-text-3 hover:text-text";
  return (
    <nav aria-label="التنقل في الرول" className="mt-1 flex items-center justify-between sm:hidden">
      <Link href={href(view, addDaysIso(wk, -7))} className={btn}><ChevronRight size={16} strokeWidth={1.9} aria-hidden />اللي فات</Link>
      <span className="flex items-center">
        {isCurrent ? null : <Link href={href("day", today)} className={cx(btn, "font-semibold text-gold")}>النهارده</Link>}
        <Link href={view === "week" ? href("day", date) : href("week", date)} className={cx(btn, view === "week" && "font-semibold text-text")}>
          {view === "week" ? "يوم واحد" : "الأسبوع كله"}
        </Link>
      </span>
      <Link href={href(view, addDaysIso(wk, 7))} className={btn}>اللي جاي<ChevronLeft size={16} strokeWidth={1.9} aria-hidden /></Link>
    </nav>
  );
}

/**
 * One day's hearings by court: a vertical line with a ring per court (gold when it holds the next hearing), the court
 * and its circuits, then solid cards. `next` is expanded; `label` is the line above its court.
 */
function Timeline({ rows, today, next, label, showToday = false }: { rows: HearingWithCase[]; today: string; next?: HearingWithCase | null; label?: { text: string; gold: boolean } | null; showToday?: boolean }) {
  const groups = groupBy(rows, courtOf);
  return (
    <ol className="px-1">
      {groups.map((g, gi) => {
        const hasNext = !!next && g.items.some((h) => h.id === next.id);
        const gold = hasNext && !!label?.gold;
        const last = gi === groups.length - 1;
        const circuits = [...new Set(g.items.map((h) => h.case.circuit?.trim()).filter(Boolean))].join(" · ");
        return (
          <li key={g.key} className="flex gap-3.5 sm:gap-[18px]">
            <div aria-hidden className="flex w-3 shrink-0 flex-col items-center sm:w-3.5">
              <span className={cx("mt-[5px] size-[11px] shrink-0 rounded-full sm:size-3", gold ? "bg-gold shadow-[0_0_0_4px_var(--accent-ring)] sm:shadow-[0_0_0_5px_var(--accent-ring)]" : "border-2 border-text-4")} />
              {last ? null : <span className="mt-1.5 w-px flex-1 bg-border" />}
            </div>
            <div className={cx("min-w-0 flex-1", last ? "pb-0" : "pb-[22px] sm:pb-[26px]")}>
              {hasNext && label ? <div className={cx("mb-1 text-[11.5px] font-semibold sm:text-[12px]", label.gold ? "text-gold" : "text-text-3")}>{label.text}</div> : null}
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="min-w-0 truncate text-[14.5px] font-bold text-text sm:text-[15.5px]">{g.key}</h3>
                {circuits ? <span className="shrink-0 truncate text-[11.5px] text-text-4 sm:text-[12px]">{circuits}</span> : null}
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

/** Desktop: past hearings that still need a decision, each with «سجّل» (opens the decision sheet). */
function SideCard({ count, rows }: { count: number; rows: HearingWithCase[] }) {
  const more = count - rows.length;
  return (
    <section aria-label="جلسات محتاجة قرار" className="rounded-[28px] border border-[var(--accent-edge)] bg-card px-6 pb-1.5 pt-2 shadow-card">
      <Link href="/hearings?filter=undecided" className="flex items-center gap-3 pb-3 pt-4 transition hover:opacity-80">
        <span className="stat-num text-[40px] font-extralight text-gold">{two(count)}</span>
        <span>
          <span className="flex items-center gap-1.5 text-[14px] font-bold text-gold"><span aria-hidden className="size-1.5 rounded-full bg-gold" />محتاجة قرار</span>
          <span className="mt-[3px] block text-[12px] text-text-3">جلسات فاتت ولسه قرارها متسجّلش</span>
        </span>
      </Link>
      <ul>
        {rows.map((h) => (
          <li key={h.id} className="flex items-center gap-3 border-t border-[var(--hairline-v2)] py-3.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-text">{hearingTitle(h)}</div>
              <div className="mt-[3px] truncate text-[12px] text-text-3">{courtOf(h)} · <span className="num font-num">{shortDm(h.hearing_date)}</span></div>
            </div>
            <OpenHearing h={h} label={`سجّل قرار جلسة ${hearingTitle(h)} يوم ${formatDmy(h.hearing_date)}`}
              className="bg-primary-fill inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-[12.5px] font-semibold transition hover:opacity-90">
              سجّل
            </OpenHearing>
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <Link href="/hearings?filter=undecided" className="block border-t border-[var(--hairline-v2)] py-3 text-center text-[12.5px] text-text-3 hover:text-text">
          {more === 1 ? "وجلسة كمان" : `وكمان ${nHearings(more)}`}
        </Link>
      ) : null}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[24px] border border-border-2 bg-card px-5 py-6 text-center text-[14px] leading-7 text-text-3 shadow-card">{children}</div>;
}

export default async function Roll({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; filter?: string }> }) {
  const sp = await searchParams;
  const undecidedMode = sp.filter === "undecided";
  const view: View = sp.view === "week" ? "week" : "day";
  const today = todayIso();
  const parsed = parseDmy(sp.date ?? "");
  const date = parsed?.precision === "day" ? parsed.iso : today;
  const wk = weekStart(date);

  const db = await createClient();
  const [weekRows, undecidedCount, undecidedRows] = await Promise.all([
    hearingsInRange(db, wk, addDaysIso(wk, 6)),
    undecidedPastCount(db),
    // the whole list for ?filter=undecided; otherwise the oldest few, for the side card
    undecidedPastHearings(db, undecidedMode ? 200 : SIDE_ROWS),
  ]);

  const counts = countByDay(weekRows);
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(wk, i)).filter((d) => weekdayOf(d) !== 5 || d === date || counts.get(d));
  const dayRows = weekRows.filter((h) => h.hearing_date === date);
  const isCurrent = view === "week" ? wk === weekStart(today) : date === today;

  // the next hearing: the first one of the chosen day with no decision yet
  const nx = view === "day" ? nextUndecided(dayRows) : null;
  const nextLabel = nx
    ? date === today
      ? { text: `الجلسة الجاية · ${nx.index} من ${nx.total}`, gold: true }
      : date < today
        ? { text: `لسه محتاجة قرار · ${nx.index} من ${nx.total}`, gold: true }
        : { text: `أول جلسة · ${nx.index} من ${nx.total}`, gold: false }
    : null;
  // an empty (or fully decided) day: point at the first upcoming hearing later this week
  const upcoming = view === "day" && !nx ? weekRows.find((h) => h.hearing_date > date && h.hearing_date >= today && !h.decision_type) : undefined;

  const nCourt = new Set(dayRows.map(courtOf)).size;
  const pending = (rows: HearingWithCase[]) => rows.filter((h) => !h.decision_type && h.hearing_date < today).length;
  const says = undecidedMode
    ? undecidedRows.length
      ? <>دي {nHearings(undecidedCount)} فاتت ولسه قرارها ما اتسجّلش، الأقدم الأول. اضغط على الجلسة وسجّل القرار، أو اكتبهولي زي ما سمعته وأنا أسجّله.</>
      : <>كل الجلسات اللي فاتت متسجّل قرارها. مفيش حاجة مستنياك هنا.</>
    : view === "week"
      ? weekRows.length
        ? <>الأسبوع ده فيه {nHearings(weekRows.length)}.{pending(weekRows) ? <> منها {nHearings(pending(weekRows))} محتاجة قرار.</> : null}</>
        : <>مفيش جلسات الأسبوع ده.</>
      : dayRows.length === 0
        ? <>مفيش جلسات {date === today ? "النهارده" : `يوم ${dayName(date, today)}`}.</>
        : date === today
          ? <>بعد كل جلسة، اكتبلي القرار زي ما سمعته، وأنا أسجّله وأعمل الجلسة الجاية.</>
          : date < today
            ? <>{dayName(date, today)} كان فيه {nHearings(dayRows.length)} في {nCourts(nCourt)}.{pending(dayRows) ? <> منها {nHearings(pending(dayRows))} لسه محتاجة قرار — اضغط عليها وسجّله.</> : null}</>
            : <>{dayName(date, today)} فيه {nHearings(dayRows.length)} في {nCourts(nCourt)}.</>;

  const chips: ComposerChip[] = [
    ...(undecidedCount && !undecidedMode ? [{ label: `${undecidedCount} ${undecidedCount === 1 ? "جلسة فاتت محتاجة قرار" : undecidedCount <= 10 ? "جلسات فاتت محتاجة قرار" : "جلسة فاتت محتاجة قرار"}`, short: `${undecidedCount} محتاجة قرار`, accent: true, href: "/hearings?filter=undecided" }] : []),
    { label: "اتأجلت لـ…", text: "اتأجلت لـ " },
    { label: "اتحجزت للحكم", text: "اتحجزت للحكم لجلسة " },
    { label: "ارفع محضر الجلسة", short: "صوّر المحضر", attach: true },
  ];

  const pill = undecidedCount > 0 && !undecidedMode ? (
    <Link href="/hearings?filter=undecided" className="inline-flex h-11 items-center" aria-label={`${nHearings(undecidedCount)} محتاجة قرار`}>
      <span className="inline-flex h-[34px] items-center gap-1.5 rounded-full border border-[var(--accent-edge)] px-3 text-[12.5px] font-semibold text-gold transition hover:bg-[var(--accent-wash)]">
        <span aria-hidden className="size-1.5 rounded-full bg-gold" /><span className="font-num">{undecidedCount}</span> محتاجة قرار
      </span>
    </Link>
  ) : null;
  const weekLink = (
    <Link href={view === "week" ? href("day", date) : href("week", date)} aria-current={view === "week" ? "page" : undefined}
      title={view === "week" ? "رجوع ليوم واحد" : "الأسبوع كله"}
      className={cx("hidden h-11 items-center rounded-full text-[13px] transition sm:inline-flex", view === "week" ? "bg-selected px-4 text-on-selected" : "text-text-3 hover:text-text")}>
      <span className={cx("font-num me-1 font-semibold", view === "week" ? "text-on-selected" : "text-title")}>{two(weekRows.length)}</span> جلسات الأسبوع
    </Link>
  );
  const todayLink = isCurrent || undecidedMode ? null : (
    <Link href={href("day", today)} className="hidden h-11 items-center text-[13px] font-semibold text-gold hover:underline sm:inline-flex">النهارده</Link>
  );

  const eyebrow = undecidedMode
    ? "جلسات فاتت من غير قرار"
    : view === "week"
      ? <>أسبوع {arDayMonth(wk)} – {arDayMonth(addDaysIso(wk, 6))}</>
      : <><span className="sm:hidden">{arDate(date, false)}</span><span className="hidden sm:inline">{arDate(date)}</span></>;

  return (
    <div className="mx-auto flex w-full max-w-[1424px] flex-1 flex-col px-4 pt-2 sm:px-8 sm:pt-4">
      <PageHero
        className="px-1 sm:px-2"
        back={undecidedMode ? "/hearings" : undefined}
        eyebrow={eyebrow}
        title={undecidedMode ? "محتاجة قرار" : "الرول"}
        action={undecidedMode ? null : <div className="flex items-center gap-4">{todayLink}{weekLink}{pill}</div>}
      />

      <RollSheet today={today}>
        {undecidedMode ? (
          <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
            <div>
              {undecidedRows.length ? (
                <ul className="space-y-2.5 sm:space-y-3">
                  {undecidedRows.map((h) => <li key={h.id}><RollRow h={h} today={today} showDate showCourt /></li>)}
                </ul>
              ) : <Empty>مفيش جلسات فاتت من غير قرار.</Empty>}
            </div>
            <div className="order-first px-2 lg:order-none"><ClausiaSays>{says}</ClausiaSays></div>
          </div>
        ) : (
          <>
            <DayStrip days={days} date={date} view={view} today={today} counts={counts} wk={wk} />
            <MobileNav view={view} date={date} wk={wk} today={today} isCurrent={isCurrent} />

            <div className="mt-1 grid items-start gap-7 sm:mt-[30px] lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                {view === "week" ? (
                  weekRows.length ? (
                    <div className="space-y-8">
                      {groupBy(weekRows, (h) => h.hearing_date).map((d) => (
                        <section key={d.key}>
                          <div className="flex items-baseline justify-between gap-3 px-1 pb-3.5 sm:px-2">
                            <h2 className="flex items-center gap-2.5 text-[17px] font-bold text-title sm:text-[19px]">
                              <Link href={href("day", d.key)} className="hover:underline">{WEEKDAY_LONG[weekdayOf(d.key)]} {arDayMonth(d.key)}</Link>
                              {d.key === today ? <StatusChip tone="accent">النهارده</StatusChip> : null}
                            </h2>
                            <span className="text-[12.5px] text-text-3">{nHearings(d.items.length)}</span>
                          </div>
                          <Timeline rows={d.items} today={today} showToday />
                        </section>
                      ))}
                    </div>
                  ) : <Empty>مفيش جلسات الأسبوع ده. الجلسات بتظهر هنا لما تضيفها في ملف الدعوى، أو لما تقول لـ Clausia عليها.</Empty>
                ) : (
                  <>
                    <div className="hidden items-baseline justify-between gap-3 px-2 pb-3.5 sm:flex">
                      <h2 className="text-[19px] font-bold text-title">{dayName(date, today)}</h2>
                      {dayRows.length ? <span className="text-[12.5px] text-text-3">{nHearings(dayRows.length)} · {nCourts(nCourt)}</span> : null}
                    </div>
                    {dayRows.length ? (
                      <div className="mt-3 sm:mt-0"><Timeline rows={dayRows} today={today} next={nx?.h} label={nextLabel} /></div>
                    ) : (
                      <Empty>
                        مفيش جلسات {date === today ? "النهارده" : `يوم ${dayName(date, today)}`}.
                        {upcoming ? <> <Link href={href("day", upcoming.hearing_date)} className="font-semibold text-text hover:underline">أقرب جلسة: {dayName(upcoming.hearing_date, today)} ←</Link></> : null}
                      </Empty>
                    )}
                  </>
                )}
              </div>

              <aside className="hidden space-y-5 lg:block">
                {undecidedCount > 0 ? <SideCard count={undecidedCount} rows={undecidedRows} /> : null}
                <div className="px-2"><ClausiaSays>{says}</ClausiaSays></div>
              </aside>
            </div>
          </>
        )}
      </RollSheet>

      <div className="min-h-6 flex-1" />
      <Composer target={{ kind: "new" }} chips={chips}
        placeholder="اكتب قرار أي جلسة… مثلاً: الإخلاء اتأجلت 5/11 لتقديم الأصل"
        placeholderShort="قرار أي جلسة… مثلاً: الإخلاء اتأجلت 5/11" />
    </div>
  );
}
