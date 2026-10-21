"use client";
/**
 * The roll's day / week view on the client (owner request 2026-10-21): the header, the day strip (RollStrip) and the
 * hearings below, all fed from one per-day cache so a tapped day shows at once.
 *
 * - The server page renders the first view with the rows for the chosen week ±3 weeks (SSR, deep links, refresh).
 * - While the strip scrolls, the days in view ±3 weeks are loaded through hearingsRangeAction (RLS-bound), a few
 *   weeks per call, before they reach the screen — so dots and Fridays never pop in under the user's eyes.
 * - Selecting a day updates the URL with window.history.pushState (?view=day&date=d/m/yyyy); Next keeps
 *   useSearchParams in sync, so back / forward restore the day without a server round-trip.
 * - The content changes with a 200ms crossfade and a slight slide in the direction of travel (none with
 *   prefers-reduced-motion).
 * - When the server renders again (a decision recorded → revalidatePath), its rows replace the cache for its range and
 *   every other week is marked stale and read again when it comes into view.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { hearingsRangeAction } from "@/components/hearings/actions";
import { RollHeader, RollSays } from "@/components/hearings/RollHeader";
import { reducedMotion, RollStrip, stripRange, type SelectHow } from "@/components/hearings/RollStrip";
import { dayName, Empty, Timeline } from "@/components/hearings/RollTimeline";
import { arDate, arDayMonth, nCourts, nHearings, WEEKDAY_LONG, weekdayOf } from "@/components/hearings/roll-text";
import { StatusChip, two } from "@/components/shell/PageHero";
import { cx } from "@/components/ui";
import { addDaysIso, formatDmy, parseDmy } from "@/lib/dates";
import { courtOf, groupBy, nextUndecided, weekStart, type HearingWithCase } from "@/lib/hearings";

export type View = "day" | "week";
type Sel = { date: string; view: View };

/** weeks kept loaded on each side of the days in view */
const BUFFER_WEEKS = 3;
/** at most this many weeks per read (the action refuses more than 70 days) */
const CHUNK_WEEKS = 8;
/** how far one read reaches once the buffer has a gap */
const READ_AHEAD_WEEKS = 8;
const FADE_MS = 200;

const href = (s: Sel) => `/hearings?view=${s.view}&date=${formatDmy(s.date)}`;
function readUrl(search: string | URLSearchParams, today: string): Sel {
  const sp = typeof search === "string" ? new URLSearchParams(search) : search;
  const p = parseDmy(sp.get("date") ?? "");
  return { date: p?.precision === "day" ? p.iso : today, view: sp.get("view") === "week" ? "week" : "day" };
}

/** The per-day rows and which weeks (by Saturday) are loaded. Mutable; `ver` re-renders. */
class Cache {
  rows = new Map<string, HearingWithCase[]>();
  weeks = new Map<string, "fresh" | "stale">();
  busy = new Set<string>();
  /** bumped when the server sends fresh rows: reads started before that are dropped when they land */
  gen = 0;
  put(from: string, to: string, rows: HearingWithCase[]) {
    for (let w = weekStart(from); w <= to; w = addDaysIso(w, 7)) {
      this.weeks.set(w, "fresh");
      for (let i = 0; i < 7; i++) this.rows.delete(addDaysIso(w, i));
    }
    for (const h of rows) {
      const a = this.rows.get(h.hearing_date);
      if (a) a.push(h);
      else this.rows.set(h.hearing_date, [h]);
    }
  }
  has(iso: string) { return this.weeks.has(weekStart(iso)); }
  day(iso: string) { return this.rows.get(iso) ?? []; }
  week(sat: string) { return Array.from({ length: 7 }, (_, i) => this.day(addDaysIso(sat, i))).flat(); }
}

interface Props {
  today: string;
  /** the server's first range: rows for from … to (whole weeks) */
  from: string;
  to: string;
  rows: HearingWithCase[];
  /** the «محتاجة قرار» pill (mobile header) and the desktop side card — server-rendered */
  pill: ReactNode;
  side: ReactNode;
}

export function RollDay({ today, from, to, rows, pill, side }: Props) {
  const sp = useSearchParams();
  const [cache] = useState(() => { const c = new Cache(); c.put(from, to, rows); return c; });
  const [ver, setVer] = useState(0);
  const [sel, setSel] = useState<Sel>(() => readUrl(sp, today));
  const [center, setCenter] = useState(() => weekStart(readUrl(sp, today).date));
  const [pinned, setPinned] = useState(() => new Set(weekdayOf(sel.date) === 5 ? [sel.date] : []));
  const [leaving, setLeaving] = useState<{ sel: Sel; dir: number; key: number } | null>(null);
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
        .then((got) => { if (gen !== cache.gen) return; cache.put(a, b, got); setVer((v) => v + 1); })
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
    cache.put(from, to, rows);
    setVer((v) => v + 1);
    ensureRef.current(visible.current.first, visible.current.last);
  }, [rows, from, to, cache]);

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
      if (how === "key" && lastHow.current === "key") window.history.replaceState(null, "", href(next));
      else window.history.pushState(null, "", href(next));
    }
    lastHow.current = how;
    ensure(next.date, next.date);
  }, [center, ensure]);

  // back / forward: the URL is the truth (read it from location — a late useSearchParams update must not undo a newer tap)
  useEffect(() => {
    const u = readUrl(window.location.search, today);
    if (window.location.pathname === "/hearings" && !new URLSearchParams(window.location.search).get("filter")) change(u, "history");
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

  // ---- derived ----------------------------------------------------------------------------------------------------
  const counts = useMemo(() => {
    void ver;
    const m = new Map<string, number>();
    const { first, last } = stripRange(center);
    for (let d = first; d <= last; d = addDaysIso(d, 1)) if (cache.has(d)) m.set(d, cache.day(d).length);
    return m;
  }, [ver, cache, center]);

  const { date, view } = sel;
  const wk = weekStart(date);
  const weekLoaded = cache.has(wk);
  const weekRows = cache.week(wk);
  const isCurrent = view === "week" ? wk === weekStart(today) : date === today;

  const weekLink = (
    <a href={href({ date, view: view === "week" ? "day" : "week" })} onClick={select({ date, view: view === "week" ? "day" : "week" })}
      aria-current={view === "week" ? "page" : undefined} title={view === "week" ? "رجوع ليوم واحد" : "الأسبوع كله"}
      className={cx("hidden h-11 items-center rounded-full text-sm transition sm:inline-flex", view === "week" ? "bg-selected px-4 text-on-selected" : "-mb-2 text-text-3 hover:text-text")}>
      <span className={cx("font-num me-1 font-semibold", view === "week" ? "text-on-selected" : "text-title")}>{weekLoaded ? two(weekRows.length) : "–"}</span> جلسات الأسبوع
    </a>
  );
  const todayLink = isCurrent ? null : (
    <a href={href({ date: today, view: "day" })} onClick={select({ date: today, view: "day" })}
      className="-mb-2 hidden h-11 items-center text-sm font-semibold text-text hover:underline sm:inline-flex">النهارده</a>
  );
  const eyebrow = view === "week"
    ? <>أسبوع {arDayMonth(wk)} – {arDayMonth(addDaysIso(wk, 6))}</>
    : <><span className="sm:hidden">{arDate(date, false)}</span><span className="hidden sm:inline">{arDate(date)}</span></>;

  const layer = (s: Sel) => <Content s={s} today={today} cache={cache} select={select} />;
  const slide = (dir: number): CSSProperties => ({ ["--roll-dx" as string]: `${dir >= 0 ? 10 : -10}px` });

  return (
    <>
      <RollHeader eyebrow={eyebrow} title="الرول" action={<div className="flex items-end gap-3.5">{todayLink}{weekLink}{pill}</div>} />

      <RollStrip key={center} center={center} selected={view === "day" ? date : null} focusDay={view === "day" ? date : wk}
        today={today} counts={counts} pinned={pinned} onSelect={onSelect} onWeekStep={view === "week" ? onWeekStep : undefined} onVisible={onVisible} />

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-7 leading-[normal] sm:mt-7.5 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        {/* both layers sit in one grid cell while the old one fades out */}
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)]" data-roll-content>
          {leaving ? (
            <div key={`out-${leaving.key}`} inert aria-hidden className="roll-out pointer-events-none [grid-area:1/1]" style={slide(leaving.dir)}>{layer(leaving.sel)}</div>
          ) : null}
          <div key={`${view}:${date}`} className={cx("min-w-0 [grid-area:1/1]", leaving && "roll-in")} style={leaving ? slide(leaving.dir) : undefined} data-roll-day={date}>
            {layer(sel)}
          </div>
        </div>

        <aside className="hidden space-y-5 lg:block">
          {side}
          <RollSays>{says(sel, today, cache)}</RollSays>
        </aside>
      </div>
    </>
  );
}

type SelectFn = (s: Sel) => (e: React.MouseEvent) => void;

/** One day (or week) of hearings from the cache; a week not loaded yet shows calm placeholder shapes. */
function Content({ s, today, cache, select }: { s: Sel; today: string; cache: Cache; select: SelectFn }) {
  const { date, view } = s;
  const wk = weekStart(date);
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
    if (!weekRows.length) return <Empty>مفيش جلسات الأسبوع ده. الجلسات بتظهر هنا لما تضيفها في ملف الدعوى، أو لما تقول لـ Clausia عليها.</Empty>;
    return (
      <div className="space-y-8">
        {groupBy(weekRows, (h) => h.hearing_date).map((d) => (
          <section key={d.key}>
            <div className="flex items-baseline justify-between gap-3 px-1 pb-3.5 sm:px-2">
              <h2 className="flex items-center gap-2.5 text-lg font-bold text-title">
                <a href={href({ date: d.key, view: "day" })} onClick={select({ date: d.key, view: "day" })} className="hover:underline">{WEEKDAY_LONG[weekdayOf(d.key)]} {arDayMonth(d.key)}</a>
                {d.key === today ? <StatusChip tone="accent">النهارده</StatusChip> : null}
              </h2>
              <span className="text-sm text-text-3">{nHearings(d.items.length)}</span>
            </div>
            <Timeline rows={d.items} today={today} showToday />
          </section>
        ))}
      </div>
    );
  }
  const dayRows = cache.day(date);
  // the next hearing: the first one of the chosen day with no decision yet
  const nx = nextUndecided(dayRows);
  const nextLabel = nx
    ? date === today
      ? { text: `الجلسة الجاية · ${nx.index} من ${nx.total}`, gold: true }
      : date < today
        ? { text: `لسه محتاجة قرار · ${nx.index} من ${nx.total}`, gold: true }
        : { text: `أول جلسة · ${nx.index} من ${nx.total}`, gold: false }
    : null;
  // an empty (or fully decided) day: point at the first upcoming hearing later this week
  const upcoming = !nx ? cache.week(wk).find((h) => h.hearing_date > date && h.hearing_date >= today && !h.decision_type) : undefined;
  const nCourt = new Set(dayRows.map(courtOf)).size;
  return (
    <>
      <div className="hidden items-baseline justify-between gap-3 px-2 pb-3.5 sm:flex">
        <h2 className="text-lg font-bold text-title">{dayName(date, today)}</h2>
        {dayRows.length ? <span className="text-sm text-text-3">{nHearings(dayRows.length)} · {nCourts(nCourt)}</span> : null}
      </div>
      {dayRows.length ? (
        <Timeline rows={dayRows} today={today} next={nx?.h} label={nextLabel} />
      ) : (
        <Empty>
          مفيش جلسات {date === today ? "النهارده" : `يوم ${dayName(date, today)}`}.
          {upcoming ? <> <Link href={href({ date: upcoming.hearing_date, view: "day" })} onClick={select({ date: upcoming.hearing_date, view: "day" })} className="font-semibold text-text hover:underline">أقرب جلسة: {dayName(upcoming.hearing_date, today)} ←</Link></> : null}
        </Empty>
      )}
    </>
  );
}

/** Clausia's line beside the day (desktop). */
function says({ date, view }: Sel, today: string, cache: Cache): ReactNode {
  const wk = weekStart(date);
  if (!cache.has(wk)) return null;
  const pending = (rows: HearingWithCase[]) => rows.filter((h) => !h.decision_type && h.hearing_date < today).length;
  if (view === "week") {
    const weekRows = cache.week(wk);
    return weekRows.length
      ? <>الأسبوع ده فيه {nHearings(weekRows.length)}.{pending(weekRows) ? <> منها {nHearings(pending(weekRows))} محتاجة قرار.</> : null}</>
      : <>مفيش جلسات الأسبوع ده.</>;
  }
  const dayRows = cache.day(date);
  const nCourt = new Set(dayRows.map(courtOf)).size;
  if (!dayRows.length) return <>مفيش جلسات {date === today ? "النهارده" : `يوم ${dayName(date, today)}`}.</>;
  if (date === today) return <>بعد كل جلسة، اكتبلي القرار زي ما سمعته، وأنا أسجّله وأعمل الجلسة الجاية.</>;
  if (date < today) return <>{dayName(date, today)} كان فيه {nHearings(dayRows.length)} في {nCourts(nCourt)}.{pending(dayRows) ? <> منها {nHearings(pending(dayRows))} لسه محتاجة قرار — اضغط عليها وسجّله.</> : null}</>;
  return <>{dayName(date, today)} فيه {nHearings(dayRows.length)} في {nCourts(nCourt)}.</>;
}
