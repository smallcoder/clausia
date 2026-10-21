// OWNER: roll agent — رول الجلسات (docs/design/*Roll.dc.html): hero with real counts, the week's day strip,
// hearings grouped by court, a decision sheet per row, and the Clausia composer. ?view=week, ?filter=undecided.
import { CalendarDays, ChevronLeft, ChevronRight, ListFilter } from "lucide-react";
import Link from "next/link";
import { RollRow, RollSheet } from "@/components/hearings/RollSheet";
import { nCourts, nHearings, dayCount, hearingTitle } from "@/components/hearings/roll-text";
import { ClausiaSays, PageHero } from "@/components/shell/PageHero";
import { Composer } from "@/components/shell/Composer";
import { cx } from "@/components/ui";
import { addDaysIso, formatDayLabel, formatDmy, parseDmy, todayIso } from "@/lib/dates";
import { circuitOf, countByDay, courtOf, groupBy, hearingsInRange, undecidedPastCount, undecidedPastHearings, weekStart, type HearingWithCase } from "@/lib/hearings";
import { createClient, getSession } from "@/lib/supabase/server";

type View = "day" | "week";
const WEEKDAY = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const weekdayOf = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const dmy = (iso: string) => formatDmy(iso);

function href(view: View, iso: string) {
  return `/hearings?view=${view}&date=${dmy(iso)}`;
}

/** One court: header (name, circuits, count) and its hearings. */
function CourtCard({ court, items, today }: { court: string; items: HearingWithCase[]; today: string }) {
  const circuits = [...new Set(items.map((h) => h.case.circuit?.trim()).filter(Boolean))] as string[];
  return (
    <section className="overflow-hidden rounded-[20px] border border-border-2 bg-card shadow-card sm:rounded-[22px]">
      <header className="flex items-center justify-between gap-3 border-b border-border-2 bg-linear-to-b from-gold/15 to-transparent px-3.5 dark:bg-none py-[11px] sm:block sm:px-4 sm:py-3">
        <h3 className="min-w-0 truncate text-[13.5px] font-bold text-text sm:text-[14px]">{court}</h3>
        <div className="shrink-0 truncate text-[11px] text-text-3 sm:mt-px sm:text-[11.5px]">
          {circuits.length ? circuits.join(" · ") : nHearings(items.length)}
          {circuits.length ? <span className="hidden sm:inline"> · {nHearings(items.length)}</span> : null}
        </div>
      </header>
      <ul className="divide-y divide-border-2">
        {groupBy(items, circuitOf).flatMap((g) => g.items).map((h) => <li key={h.id}><RollRow h={h} today={today} /></li>)}
      </ul>
    </section>
  );
}

function CourtGrid({ rows, today }: { rows: HearingWithCase[]; today: string }) {
  return (
    <div className="grid items-start gap-3.5 sm:grid-cols-[repeat(auto-fit,minmax(290px,1fr))]">
      {groupBy(rows, courtOf).map((g) => <CourtCard key={g.key} court={g.key} items={g.items} today={today} />)}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[20px] border border-dashed border-border bg-card/60 px-5 py-6 text-center text-[14px] leading-7 text-text-3">{children}</p>;
}

export default async function Roll({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; filter?: string }> }) {
  const sp = await searchParams;
  const undecidedMode = sp.filter === "undecided";
  const view: View = sp.view === "week" ? "week" : "day";
  const today = todayIso();
  const parsed = parseDmy(sp.date ?? "");
  const date = parsed?.precision === "day" ? parsed.iso : today;
  const wk = weekStart(date);
  const thisWk = weekStart(today);

  const db = await createClient();
  const [session, weekRows, currentWeekRows, undecidedCount, undecidedRows] = await Promise.all([
    getSession(db),
    hearingsInRange(db, wk, addDaysIso(wk, 6)),
    wk === thisWk ? null : hearingsInRange(db, thisWk, addDaysIso(thisWk, 6)),
    undecidedPastCount(db),
    // the whole list for ?filter=undecided; otherwise only the oldest one, for the composer chip
    undecidedPastHearings(db, undecidedMode ? 200 : 1),
  ]);
  const office = session ? (await db.from("offices").select("name").eq("id", session.officeId).maybeSingle()).data?.name : null;
  const thisWeek = currentWeekRows ?? weekRows;
  const todayCount = thisWeek.filter((h) => h.hearing_date === today).length;

  const rows = undecidedMode ? undecidedRows : view === "week" ? weekRows : weekRows.filter((h) => h.hearing_date === date);
  const counts = countByDay(weekRows);
  // Sat–Thu; Friday only when it is the chosen day or has hearings
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(wk, i)).filter((d) => weekdayOf(d) !== 5 || d === date || counts.get(d));
  const firstUndecided = undecidedRows[0];

  // eyebrow: the period being shown
  const period = undecidedMode
    ? "جلسات فاتت من غير قرار"
    : view === "week"
      ? <>أسبوع <span className="num">{dmy(wk)}</span> – <span className="num">{dmy(addDaysIso(wk, 6))}</span></>
      : formatDayLabel(date);

  // Clausia's line: a sentence templated from the counts (not an LLM call)
  const nCourt = new Set(rows.map(courtOf)).size;
  const pending = rows.filter((h) => !h.decision_type && h.hearing_date < today).length;
  const when = date === today ? "النهارده" : `يوم ${formatDayLabel(date)}`;
  const says = undecidedMode
    ? rows.length
      ? <>دي {nHearings(undecidedCount)} فاتت ولسه قرارها ما اتسجّلش، الأقدم الأول. اضغط على الجلسة وسجّل القرار، أو اكتبهولي زي ما سمعته وأنا أسجّله.</>
      : <>كل الجلسات اللي فاتت متسجّل قرارها. مفيش حاجة مستنياك هنا.</>
    : rows.length === 0
      ? <>مفيش جلسات {view === "week" ? "الأسبوع ده" : when}.{undecidedCount ? <> بس فيه {nHearings(undecidedCount)} فاتت لسه محتاجة قرار.</> : null}</>
      : view === "week"
        ? <>{wk === thisWk ? "الأسبوع ده" : "الأسبوع ده من الرول"} فيه {nHearings(rows.length)} في {nCourts(nCourt)}.{pending ? <> منها {nHearings(pending)} محتاجة قرار.</> : null}</>
        : date === today
          ? <>النهارده {nHearings(rows.length)} في {nCourts(nCourt)}. بعد كل جلسة، اكتبلي القرار زي ما سمعته، وأنا أسجّله وأعمل الجلسة الجاية.</>
          : date < today
            ? <>{when} كان فيه {nHearings(rows.length)} في {nCourts(nCourt)}.{pending ? <> منها {nHearings(pending)} لسه محتاجة قرار — اضغط عليها وسجّله.</> : null}</>
            : <>{when} فيه {nHearings(rows.length)} في {nCourts(nCourt)}.</>;

  const chips = [
    // mockup: the accent chip with the real count of past hearings that still need a decision
    ...(undecidedCount ? [{ label: `${undecidedCount} ${undecidedCount === 1 ? "جلسة فاتت محتاجة قرار" : undecidedCount <= 10 ? "جلسات فاتت محتاجة قرار" : "جلسة فاتت محتاجة قرار"}`, short: `${undecidedCount} محتاجة قرار`, accent: true, href: "/hearings?filter=undecided" }] : []),
    ...(firstUndecided ? [{ label: `سجّل قرار جلسة ${hearingTitle(firstUndecided).split(" — ")[0]} (${dmy(firstUndecided.hearing_date)})`, short: `سجّل قرار جلسة ${dmy(firstUndecided.hearing_date)}`, text: `قرار جلسة ${hearingTitle(firstUndecided)} يوم ${dmy(firstUndecided.hearing_date)}: ` }] : []),
    { label: "إيه المطلوب مني بكرة؟", text: "إيه المطلوب مني بكرة؟" },
    { label: "اتأجلت لـ…", text: "اتأجلت لـ " },
    { label: "اتحجزت للحكم", text: "اتحجزت للحكم لجلسة " },
  ];

  const isCurrent = view === "week" ? wk === thisWk : date === today;
  const step = view === "week" ? 7 : 1;
  const navBtn = "inline-flex size-11 sm:size-9 items-center justify-center rounded-full border border-border bg-chip text-text-2 shadow-soft transition hover:text-text";

  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col px-2.5 pt-2.5 sm:px-10 sm:pt-4">
      <PageHero
        action={<Link href="/hearings?filter=undecided" aria-label="الجلسات المحتاجة قرار" title="الجلسات المحتاجة قرار" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card-2 text-text"><ListFilter size={19} strokeWidth={2} aria-hidden /></Link>}
        back="/"
        icon={<CalendarDays size={28} strokeWidth={2} aria-hidden />}
        eyebrow={<>{period}{office && !undecidedMode ? <span className="hidden sm:inline"> · {office}</span> : null}</>}
        title="رول الجلسات"
        stats={[
          { value: todayCount, label: "جلسات النهارده", href: "/hearings" },
          { value: thisWeek.length, label: "جلسات الأسبوع", href: `/hearings?view=week&date=${dmy(today)}` },
          { value: undecidedCount, label: "محتاجة قرار", highlight: true, href: "/hearings?filter=undecided" },
        ]}
      />

      <div className="px-1.5 sm:px-0">
        {/* day / week, and moving through the roll */}
        <nav aria-label="التنقل في الرول" className="mt-3.5 flex items-center justify-between gap-2 sm:mt-4">
          {undecidedMode ? (
            <Link href="/hearings" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-chip px-3.5 text-[13px] text-text-2 shadow-soft hover:text-text">
              <ChevronRight size={16} strokeWidth={2} aria-hidden />رجوع للرول
            </Link>
          ) : (
            <div className="inline-flex rounded-full border border-border bg-card-2 p-[3px] text-[13px]">
              {(["day", "week"] as const).map((v) => (
                <Link key={v} href={href(v, date)} aria-current={v === view ? "page" : undefined}
                  className={cx("inline-flex h-10 items-center rounded-full px-4 transition sm:h-[30px]", v === view ? "bg-card font-bold text-text shadow-soft" : "text-text-3 hover:text-text")}>
                  {v === "day" ? "يوم" : "أسبوع"}
                </Link>
              ))}
            </div>
          )}
          {undecidedMode ? null : (
            <div className="flex items-center gap-1.5">
              <Link href={href(view, addDaysIso(date, -step))} aria-label={view === "week" ? "الأسبوع السابق" : "اليوم السابق"} className={navBtn}><ChevronRight size={18} strokeWidth={2} aria-hidden /></Link>
              {isCurrent ? null : <Link href={href(view, today)} className="inline-flex h-11 sm:h-9 items-center rounded-full border border-border bg-chip px-3.5 text-[13px] font-semibold text-text shadow-soft">النهارده</Link>}
              <Link href={href(view, addDaysIso(date, step))} aria-label={view === "week" ? "الأسبوع التالي" : "اليوم التالي"} className={navBtn}><ChevronLeft size={18} strokeWidth={2} aria-hidden /></Link>
            </div>
          )}
        </nav>

        {undecidedMode ? null : (
          <div className="mt-3 grid gap-1.5 sm:gap-2.5" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((d) => {
              const on = view === "day" && d === date;
              const n = counts.get(d) ?? 0;
              return (
                <Link key={d} href={href("day", d)} aria-current={on ? "date" : undefined}
                  className={cx("flex h-16 flex-col items-center justify-center gap-0.5 rounded-[16px] transition sm:h-[76px] sm:gap-[3px] sm:rounded-[18px]",
                    on ? "bg-tile-hi shadow-[var(--tile-hi-shadow)]" : "border border-border bg-card text-text-2 shadow-soft hover:text-text")}>
                  <span className="text-[10.5px] font-semibold opacity-80 sm:text-xs">{WEEKDAY[weekdayOf(d)]}</span>
                  <span className="font-num text-[18px] font-extrabold leading-none sm:text-[22px]">{Number(d.slice(8))}</span>
                  <span className={cx("text-[9.5px] opacity-75 sm:text-[11px]", d === today && !on && "font-bold text-gold-text opacity-100")}>{d === today && !on ? "النهارده" : dayCount(n)}</span>
                </Link>
              );
            })}
          </div>
        )}

        <div className="mt-4 sm:mt-[22px]"><ClausiaSays>{says}</ClausiaSays></div>

        <RollSheet today={today}>
          <div className="mt-3.5 sm:mt-4">
            {rows.length === 0 ? (
              <Empty>
                {undecidedMode ? "مفيش جلسات فاتت من غير قرار." : "الجلسات بتظهر هنا لما تضيفها في ملف الدعوى، أو لما تقول لـ Clausia عليها."}
              </Empty>
            ) : undecidedMode ? (
              <ul className="divide-y divide-border-2 overflow-hidden rounded-[22px] border border-border-2 bg-card shadow-card">
                {rows.map((h) => <li key={h.id}><RollRow h={h} today={today} showDate showCourt /></li>)}
              </ul>
            ) : view === "week" ? (
              <div className="space-y-6">
                {groupBy(rows, (h) => h.hearing_date).map((d) => (
                  <section key={d.key}>
                    <h2 className="mb-2.5 flex items-center gap-2 px-1 text-[14px] font-bold text-text">
                      <Link href={href("day", d.key)} className="hover:text-gold-text">{formatDayLabel(d.key)}</Link>
                      {d.key === today ? <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-bold text-gold-text">النهارده</span> : null}
                      <span className="text-[12px] font-normal text-text-4">{nHearings(d.items.length)}</span>
                    </h2>
                    <CourtGrid rows={d.items} today={today} />
                  </section>
                ))}
              </div>
            ) : (
              <CourtGrid rows={rows} today={today} />
            )}
          </div>
        </RollSheet>
      </div>

      <div className="min-h-6 flex-1" />
      {/* the page fades out under the composer, so the chips never sit on top of a row */}
      <div className="sticky bottom-0 z-20 -mx-2.5 bg-linear-to-t from-bg from-70% to-transparent px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-6 sm:-mx-10 sm:px-10 sm:pb-7">
        <div className="mx-auto w-full max-w-[820px]">
        <Composer target={{ kind: "new" }} sticky={false} chips={chips}
          placeholder="اكتب قرار أي جلسة… مثلاً: الإخلاء اتأجلت 5/11" />
        </div>
      </div>
    </div>
  );
}
