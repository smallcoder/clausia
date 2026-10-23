"use client";
/**
 * The agenda (الأجندة, replaces the Roll; mockups docs/design/ia/IAAgenda*, MAgenda*): the title row (day / week / month switch, month arrows,
 * «النهارده»), the day strip (the Roll's RollStrip, one continuous strip, a dot per hearing), ONE slim line for past hearings that still need a
 * decision (it opens DecisionFlow), then the day: its deadlines (flag-gated, as before) and its hearings by court building and circuit.
 *
 * - The server page renders the first view with the rows for the chosen week ±SSR weeks (SSR, deep links, refresh).
 * - While the strip scrolls, the days in view ±3 weeks are loaded through hearingsRangeAction (RLS-bound), a few weeks per call, before they
 *   reach the screen; the month view asks for the weeks of its month the same way. One per-day cache feeds all three views.
 * - Selecting a day / view updates the URL with history.pushState (?view=day|week|month&date=d/m/yyyy; other params such as the chat's ?s= are kept);
 *   back / forward restore it without a server round-trip.
 * - The content changes with a 200ms crossfade and a slight slide in the direction of travel (none with prefers-reduced-motion).
 * - When the server renders again (a decision recorded → revalidatePath), its rows replace the cache for its range and every other week
 *   is marked stale and read again when it comes into view.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AgendaColumns, AgendaGroups } from "@/components/agenda/AgendaRows";
import { DecisionFlow } from "@/components/agenda/DecisionFlow";
import { monthBounds, MonthGrid, shiftMonth } from "@/components/agenda/MonthGrid";
import { AGENDA, agendaHref, type AgendaView as View } from "@/components/agenda/url";
import { DeadlineRows } from "@/components/hearings/DeadlineRows";
import { hearingsRangeAction } from "@/components/hearings/actions";
import { reducedMotion, RollStrip, stripRange, type SelectHow } from "@/components/hearings/RollStrip";
import { arDayMonth, arMonthYear, nHearings, WEEKDAY_LONG, weekdayOf } from "@/components/hearings/roll-text";
import { StatusChip } from "@/components/shell/PageHero";
import { PageTitle, TitleRow } from "@/components/shell/TitleRow";
import { DateText, cx } from "@/components/ui";
import { addDaysIso, parseDmy } from "@/lib/dates";
import type { RollDeadline } from "@/lib/deadlines/types";
import { weekStart, type HearingWithCase } from "@/lib/hearings";

type Sel = { date: string; view: View };

/** weeks kept loaded on each side of the days in view */
const BUFFER_WEEKS = 3;
/** at most this many weeks per read (the action refuses more than 70 days) */
const CHUNK_WEEKS = 8;
/** how far one read reaches once the buffer has a gap */
const READ_AHEAD_WEEKS = 8;
const FADE_MS = 200;
const VIEW_LABEL: Record<View, string> = { day: "يوم", week: "أسبوع", month: "شهر" };

function readUrl(search: string | URLSearchParams, today: string): Sel {
  const sp = typeof search === "string" ? new URLSearchParams(search) : search;
  const p = parseDmy(sp.get("date") ?? "");
  const v = sp.get("view");
  return { date: p?.precision === "day" ? p.iso : today, view: v === "week" || v === "month" ? v : "day" };
}
/** the address bar for a selection: view and date set, the chat's session and anything else kept, the decision flow's flag dropped */
function urlFor(s: Sel): string {
  const rest = new URLSearchParams(window.location.search);
  for (const k of ["view", "date", "decide"]) rest.delete(k);
  return `${agendaHref(s.date, s.view)}${rest.size ? `&${rest}` : ""}`; // the date is written as the lawyer reads it (d/m/yyyy), like every link to the agenda
}

/** The per-day rows and which weeks (by Saturday) are loaded. Mutable; `ver` re-renders. */
class Cache {
  rows = new Map<string, HearingWithCase[]>();
  /** saved appeal deadlines (last days and reminders) per day; empty with the flag off */
  dl = new Map<string, RollDeadline[]>();
  weeks = new Map<string, "fresh" | "stale">();
  busy = new Set<string>();
  /** bumped when the server sends fresh rows: reads started before that are dropped when they land */
  gen = 0;
  put(from: string, to: string, rows: HearingWithCase[], deadlines: RollDeadline[] = []) {
    for (let w = weekStart(from); w <= to; w = addDaysIso(w, 7)) {
      this.weeks.set(w, "fresh");
      for (let i = 0; i < 7; i++) { this.rows.delete(addDaysIso(w, i)); this.dl.delete(addDaysIso(w, i)); }
    }
    for (const d of deadlines) this.dl.set(d.date, [...(this.dl.get(d.date) ?? []), d]);
    for (const h of rows) {
      const a = this.rows.get(h.hearing_date);
      if (a) a.push(h);
      else this.rows.set(h.hearing_date, [h]);
    }
  }
  has(iso: string) { return this.weeks.has(weekStart(iso)); }
  day(iso: string) { return this.rows.get(iso) ?? []; }
  deadlines(iso: string) { return this.dl.get(iso) ?? []; }
  week(sat: string) { return Array.from({ length: 7 }, (_, i) => this.day(addDaysIso(sat, i))).flat(); }
}

interface Props {
  today: string;
  /** the server's first range: rows for from … to (whole weeks) */
  from: string;
  to: string;
  rows: HearingWithCase[];
  /** saved appeal deadlines for the same range (the server's first render); none with the flag off */
  deadlines?: RollDeadline[];
  /** past hearings with no decision: how many, and the oldest ones for the one-by-one flow */
  undecided: number;
  undecidedRows: HearingWithCase[];
  /** ?decide=1: the flow is open on load */
  openFlow: boolean;
}

export function AgendaView({ today, from, to, rows, deadlines = [], undecided, undecidedRows, openFlow }: Props) {
  const sp = useSearchParams();
  const [cache] = useState(() => { const c = new Cache(); c.put(from, to, rows, deadlines); return c; });
  const [ver, setVer] = useState(0);
  const [sel, setSel] = useState<Sel>(() => readUrl(sp, today));
  const [center, setCenter] = useState(() => weekStart(readUrl(sp, today).date));
  const [pinned, setPinned] = useState(() => new Set(weekdayOf(sel.date) === 5 ? [sel.date] : []));
  const [leaving, setLeaving] = useState<{ sel: Sel; dir: number; key: number } | null>(null);
  const [flow, setFlow] = useState(openFlow && undecidedRows.length > 0);
  const lastHow = useRef<SelectHow | "history" | null>(null);
  const visible = useRef({ first: center, last: addDaysIso(center, 6) });
  const selRef = useRef(sel);
  selRef.current = sel;

  // ---- loading -----------------------------------------------------------------------------------------------------
  const ensure = useCallback((first: string, last: string) => {
    const { first: lo, last: hi } = stripRange(center);
    const missing = (reach: number) => {
      const out: string[] = [];
      for (let w = addDaysIso(weekStart(first), -7 * reach); w <= addDaysIso(weekStart(last), 7 * reach); w = addDaysIso(w, 7)) {
        if (w < weekStart(lo) || w > hi) continue;
        if (cache.weeks.get(w) !== "fresh" && !cache.busy.has(w)) out.push(w);
      }
      return out;
    };
    // a gap inside the buffer → read ahead in one go (up to a chunk past it), so a fast scroll stays covered
    if (!missing(BUFFER_WEEKS).length) return;
    const want = missing(READ_AHEAD_WEEKS);
    // nearest weeks first: contiguous runs of at most CHUNK_WEEKS
    const mid = weekStart(first);
    want.sort((a, b) => Math.abs(Date.parse(a) - Date.parse(mid)) - Math.abs(Date.parse(b) - Date.parse(mid)));
    const runs: string[][] = [];
    for (const w of [...want].sort()) {
      const r = runs[runs.length - 1];
      if (r && r.length < CHUNK_WEEKS && addDaysIso(r[r.length - 1], 7) === w) r.push(w);
      else runs.push([w]);
    }
    runs.sort((a, b) => want.indexOf(a[0]) - want.indexOf(b[0]));
    for (const r of runs) {
      r.forEach((w) => cache.busy.add(w));
      const a = r[0], b = addDaysIso(r[r.length - 1], 6);
      const gen = cache.gen;
      hearingsRangeAction(a, b)
        // a read from before the latest server render may hold pre-decision rows: drop it
        .then((got) => { if (gen !== cache.gen) return; cache.put(a, b, got.hearings, got.deadlines); setVer((v) => v + 1); })
        .catch(() => {}) // tried again the next time these weeks come into view
        .finally(() => { if (gen === cache.gen) r.forEach((w) => cache.busy.delete(w)); });
    }
  }, [cache, center]);

  const onVisible = useCallback((first: string, last: string) => {
    visible.current = { first, last };
    ensure(first, last);
  }, [ensure]);

  // a new server render (after revalidatePath): its rows win, everything else is read again when in view.
  // Keyed on `rows` only (from/to arrive with it); ensure is read through a ref so a strip re-centre does not re-run this.
  const ensureRef = useRef(ensure);
  ensureRef.current = ensure;
  const seenRows = useRef(rows);
  useEffect(() => {
    if (seenRows.current === rows) return;
    seenRows.current = rows;
    cache.gen++;
    cache.busy.clear(); // their results will be dropped; these weeks may be read again now
    for (const w of cache.weeks.keys()) cache.weeks.set(w, "stale");
    cache.put(from, to, rows, deadlines);
    setVer((v) => v + 1);
    ensureRef.current(visible.current.first, visible.current.last);
  }, [rows, from, to, cache]); // eslint-disable-line react-hooks/exhaustive-deps -- `deadlines` arrives with `rows` in the same render

  // the month view reads the weeks of its month (the strip is not on screen then, so it reports nothing)
  const { date, view } = sel;
  useEffect(() => {
    if (view !== "month") return;
    const { first, last } = monthBounds(date);
    ensure(first, last);
  }, [view, date, ensure, ver]);

  // ---- selection ---------------------------------------------------------------------------------------------------
  const change = useCallback((next: Sel, how: SelectHow | "history") => {
    const prev = selRef.current;
    if (prev.date === next.date && prev.view === next.view) return;
    const dir = next.date > prev.date ? 1 : next.date < prev.date ? -1 : 0;
    setLeaving(reducedMotion() ? null : { sel: prev, dir, key: Date.now() });
    setSel(next);
    selRef.current = next;
    if (weekdayOf(next.date) === 5) setPinned((p) => (p.has(next.date) ? p : new Set(p).add(next.date)));
    const r = stripRange(center);
    if (next.date < r.first || next.date > r.last) setCenter(weekStart(next.date));
    if (how !== "history") {
      // consecutive arrow-key steps replace one history entry instead of adding one per day
      if (how === "key" && lastHow.current === "key") window.history.replaceState(null, "", urlFor(next));
      else window.history.pushState(null, "", urlFor(next));
    }
    lastHow.current = how;
    ensure(next.date, next.date);
  }, [center, ensure]);

  // back / forward: the URL is the truth (read it from location — a late useSearchParams update must not undo a newer tap)
  useEffect(() => {
    if (window.location.pathname === AGENDA) change(readUrl(window.location.search, today), "history");
  }, [sp, today, change]);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(null), FADE_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  const onSelect = useCallback((iso: string, how: SelectHow) => change({ date: iso, view: "day" }, how), [change]);
  const onWeekStep = useCallback((sat: string) => change({ date: sat, view: "week" }, "tap"), [change]);
  const select = (s: Sel) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    change(s, "tap");
  };

  const closeFlow = useCallback(() => {
    setFlow(false);
    const u = new URL(window.location.href);
    if (u.searchParams.has("decide")) { u.searchParams.delete("decide"); window.history.replaceState(null, "", u); }
  }, []);

  // ---- derived ----------------------------------------------------------------------------------------------------
  const counts = useMemo(() => {
    void ver;
    const m = new Map<string, number>();
    const { first, last } = stripRange(center);
    for (let d = first; d <= last; d = addDaysIso(d, 1)) if (cache.has(d)) m.set(d, cache.day(d).length);
    return m;
  }, [ver, cache, center]);

  const wk = weekStart(date);
  const layer = (s: Sel) => <Content s={s} today={today} cache={cache} counts={counts} select={select} />;
  const slide = (dir: number): CSSProperties => ({ ["--roll-dx" as string]: `${dir >= 0 ? 10 : -10}px` });

  // month arrows: the same day of the month before / after; «النهارده» keeps the view
  const monthStep = (by: 1 | -1) => ({ date: shiftMonth(date, by), view });
  const arrow = "glass glass-icon tap inline-flex size-9 shrink-0 items-center justify-center rounded-full transition hover:text-text";
  const arrows = (cls: string) => (
    <div className={cx("items-center gap-1.5", cls)}>
      <a href={agendaHref(monthStep(-1).date, view)} onClick={select(monthStep(-1))} aria-label="الشهر اللي فات" className={arrow}><ChevronRight size={16} strokeWidth={1.9} aria-hidden /></a>
      <span className="min-w-22 text-center text-md font-bold text-title"><DateText value={arMonthYear(date)} /></span>
      <a href={agendaHref(monthStep(1).date, view)} onClick={select(monthStep(1))} aria-label="الشهر الجاي" className={arrow}><ChevronLeft size={16} strokeWidth={1.9} aria-hidden /></a>
    </div>
  );
  const switcher = (
    <div role="group" aria-label="طريقة العرض" className="inline-flex h-chip shrink-0 items-center rounded-full border border-border bg-chip p-0.5 shadow-soft">
      {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
        <a key={v} href={agendaHref(date, v)} onClick={select({ date, view: v })} aria-current={v === view ? "true" : undefined}
          className={cx("tap inline-flex h-full items-center rounded-full px-3.5 text-sm transition", v === view ? "pill-on" : "font-semibold text-text-2 hover:text-text")}>
          {VIEW_LABEL[v]}
        </a>
      ))}
    </div>
  );

  return (
    <>
      <TitleRow className="flex items-end justify-between gap-4 px-1 pt-3 leading-[normal] sm:justify-start sm:gap-5">
        <PageTitle className="min-w-0">الأجندة</PageTitle>
        {switcher}
        {arrows("hidden sm:flex")}
        <a href={agendaHref(today, view)} onClick={select({ date: today, view })}
          className="tap hidden h-chip items-center rounded-full border border-border bg-chip px-3.75 text-sm font-semibold text-text shadow-soft transition hover:bg-card-2 sm:inline-flex">النهارده</a>
      </TitleRow>
      {view === "month" ? arrows("mt-3 flex justify-center sm:hidden") : null}

      {view === "month" ? null : (
        <RollStrip key={center} center={center} selected={view === "day" ? date : null} focusDay={view === "day" ? date : wk}
          today={today} counts={counts} pinned={pinned} onSelect={onSelect} onWeekStep={view === "week" ? onWeekStep : undefined} onVisible={onVisible} />
      )}

      {undecided > 0 && undecidedRows.length ? (
        <button type="button" onClick={() => setFlow(true)} aria-haspopup="dialog"
          className="tap mt-4 flex w-full items-center justify-between gap-3 rounded-xl border border-gold-edge px-4 py-2.5 text-start text-base leading-[normal] transition hover:bg-gold-bg sm:mt-5 sm:px-5">
          <span className="flex min-w-0 items-center gap-2.5 text-text-2">
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-gold" />
            <span className="min-w-0">
              <b className="font-bold text-gold-on-ambient">{nHearings(undecided)} فاتت</b> لسه قرارها متسجلش
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 font-bold text-gold-on-ambient">
            <span className="hidden sm:inline">سجّلها واحدة واحدة</span><span className="sm:hidden">سجّلها</span>
            <ChevronLeft size={16} strokeWidth={1.9} aria-hidden />
          </span>
        </button>
      ) : null}

      <div className="mt-5 sm:mt-6">
        {/* both layers sit in one grid cell while the old one fades out */}
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)]" data-roll-content>
          {leaving ? (
            <div key={`out-${leaving.key}`} inert aria-hidden className="roll-out pointer-events-none [grid-area:1/1]" style={slide(leaving.dir)}>{layer(leaving.sel)}</div>
          ) : null}
          <div key={`${view}:${date}`} className={cx("min-w-0 [grid-area:1/1]", leaving && "roll-in")} style={leaving ? slide(leaving.dir) : undefined} data-roll-day={date}>
            {layer(sel)}
          </div>
        </div>
      </div>

      {flow ? <DecisionFlow rows={undecidedRows} onClose={closeFlow} /> : null}
    </>
  );
}

const dayName = (iso: string, today: string) => iso === today ? "النهارده" : iso === addDaysIso(today, 1) ? "بكرة" : iso === addDaysIso(today, -1) ? "امبارح" : `${WEEKDAY_LONG[weekdayOf(iso)]} ${arDayMonth(iso)}`;

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border-2 bg-card px-5 py-6 text-center text-base leading-7 text-text-3 shadow-card">{children}</div>;
}

type SelectFn = (s: Sel) => (e: React.MouseEvent) => void;

/** One day, week or month from the cache; a week not loaded yet shows calm placeholder shapes. */
function Content({ s, today, cache, counts, select }: { s: Sel; today: string; cache: Cache; counts: Map<string, number>; select: SelectFn }) {
  const { date, view } = s;
  const wk = weekStart(date);
  if (view === "month") {
    return <MonthGrid date={date} today={today} counts={counts} onPick={(iso, e) => select({ date: iso, view: "day" })(e)} />;
  }
  if (!cache.has(wk)) {
    return (
      <div aria-busy="true" className="skel-shimmer space-y-3 px-1">
        <span aria-hidden className="skel block h-4.75 w-40" />
        <div className="rounded-xl border border-border-2 bg-card p-6 shadow-card"><span aria-hidden className="skel block h-3 w-3/5" /><span aria-hidden className="skel mt-3 block h-2.5 w-2/5" /></div>
      </div>
    );
  }
  if (view === "week") {
    const weekRows = cache.week(wk);
    const days = [...new Set([...weekRows.map((h) => h.hearing_date), ...Array.from({ length: 7 }, (_, i) => addDaysIso(wk, i)).filter((d) => cache.deadlines(d).length)])].sort();
    if (!days.length) return <Empty>مفيش جلسات الأسبوع ده. الجلسات بتظهر هنا لما تضيفها في ملف الدعوى، أو لما تقول لـ Clausia عليها.</Empty>;
    return (
      <div className="space-y-7">
        {weekRows.length ? <AgendaColumns /> : null}
        {days.map((d) => {
          const day = cache.day(d);
          return (
            <section key={d} aria-label={dayName(d, today)}>
              <div className="flex items-baseline justify-between gap-3 px-1 pb-3 sm:px-2">
                <h2 className="flex items-center gap-2.5 text-lg font-bold text-title">
                  <a href={agendaHref(d)} onClick={select({ date: d, view: "day" })} className="hover:underline"><DateText value={`${WEEKDAY_LONG[weekdayOf(d)]} ${arDayMonth(d)}`} /></a>
                  {d === today ? <StatusChip tone="accent">النهارده</StatusChip> : null}
                </h2>
                {day.length ? <span className="text-sm text-text-3">{nHearings(day.length)}</span> : null}
              </div>
              <DeadlineRows rows={cache.deadlines(d)} today={today} />
              {day.length ? <AgendaGroups rows={day} /> : null}
            </section>
          );
        })}
      </div>
    );
  }
  const dayRows = cache.day(date);
  // an empty day: point at the first upcoming hearing later this week
  const upcoming = !dayRows.length && !cache.deadlines(date).length ? cache.week(wk).find((h) => h.hearing_date > date && h.hearing_date >= today) : undefined;
  return (
    <>
      <h2 className="sr-only"><DateText value={dayName(date, today)} /></h2>
      <DeadlineRows rows={cache.deadlines(date)} today={today} />
      {dayRows.length ? (
        <>
          <AgendaColumns />
          <AgendaGroups rows={dayRows} />
        </>
      ) : cache.deadlines(date).length ? null : (
        <Empty>
          مفيش جلسات {date === today ? "النهارده" : <>يوم <DateText value={dayName(date, today)} /></>}.
          {upcoming ? <> <Link href={agendaHref(upcoming.hearing_date)} onClick={select({ date: upcoming.hearing_date, view: "day" })} className="font-semibold text-text hover:underline">أقرب جلسة: <DateText value={dayName(upcoming.hearing_date, today)} /> ←</Link></> : null}
        </Empty>
      )}
    </>
  );
}
