"use client";
/**
 * The roll's day strip (owner request 2026-10-21): one continuous, sideways-scrolling row of days, RTL — the past on
 * the right, the future on the left. It renders a fixed range of ±26 weeks around the week it was opened on; only
 * the counts arrive later (from RollDay's cache).
 *
 * - Scrolling: native momentum with snap to days (touch drag, trackpad, shift+wheel); a mouse drag scrolls too, and a
 *   drag never also selects the day it ends on.
 * - Desktop prev/next glass buttons scroll one week (~300ms, ease-out) so that week's Saturday lands at the strip's
 *   start. Every distance comes from tile rects (viewport pixels, the same in every engine) and is applied as a
 *   relative scrollBy; the absolute scrollLeft, whose RTL value differs across engines, is never read or set.
 *   prefers-reduced-motion → instant. At the ends of the range the buttons are disabled.
 * - One selected pill inside the scroller slides (transform) between the tiles' measured positions.
 * - Above the strip: the month label of the days in view and, when today is out of view, an «النهارده» chip.
 * - Keyboard: roving tabindex; ArrowLeft = next day, ArrowRight = previous day (left is the future in RTL); Enter /
 *   Space select the focused day.
 * - Friday is hidden unless it has a hearing (or was chosen). A Friday that appears late is compensated so nothing in
 *   view moves.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { addDaysIso, formatDmy } from "@/lib/dates";
import { weekStart } from "@/lib/hearings";
import { arDayMonth, arMonthYear, dayCount, WEEKDAY_LONG, WEEKDAY_SHORT, weekdayOf } from "./roll-text";

/** Weeks rendered on each side of the week the strip was opened on. */
export const STRIP_WEEKS = 26;
const STEP_MS = 300;
const SNAP_MS = 180;
const DRAG_THRESHOLD = 6;

export const stripRange = (center: string) => ({ first: addDaysIso(center, -STRIP_WEEKS * 7), last: addDaysIso(center, STRIP_WEEKS * 7 + 6) });
export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const dayHref = (iso: string) => `/hearings?view=day&date=${formatDmy(iso)}`;

export type SelectHow = "tap" | "key" | "today";

interface Props {
  /** Saturday of the week the strip is built around; fixed for this mount (RollDay remounts the strip to move it). */
  center: string;
  /** the selected day, or null (week view: no pill) */
  selected: string | null;
  /** the day whose tile takes the Tab stop when nothing is selected (week view: that week's Saturday) */
  focusDay: string;
  today: string;
  /** hearings per day, for loaded days only (absent = not loaded yet → no dots) */
  counts: Map<string, number>;
  /** Fridays that stay shown with no hearing (the chosen ones) */
  pinned: Set<string>;
  onSelect: (iso: string, how: SelectHow) => void;
  /** week view: prev/next also change the week shown below */
  onWeekStep?: (saturday: string) => void;
  /** the days in view changed (first … last, ISO) */
  onVisible: (first: string, last: string) => void;
}

type Edges = { start: number; end: number; rtl: boolean };

export function RollStrip({ center, selected, focusDay, today, counts, pinned, onSelect, onWeekStep, onVisible }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const anim = useRef<number | null>(null);
  /** the tile at the start edge and its distance from it — restored after anything changes the layout */
  const anchor = useRef<{ day: string; offset: number } | null>(null);
  const drag = useRef<{ x: number; last: number; id: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const prevSelected = useRef<string | null>(null);
  const pillAt = useRef("");
  // SSR and the first client render start at the chosen week (scroll position 0 is the start edge); the earlier
  // weeks are revealed in a layout effect with the scroll compensated, so nothing moves on screen.
  const [ready, setReady] = useState(false);
  const [measured, setMeasured] = useState(false);
  const [vis, setVis] = useState({ first: center, last: addDaysIso(center, 6), canPrev: true, canNext: true });

  const range = useMemo(() => stripRange(center), [center]);
  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = ready ? range.first : center; d <= range.last; d = addDaysIso(d, 1)) {
      if (weekdayOf(d) === 5 && !(counts.get(d) ?? 0) && !pinned.has(d)) continue;
      out.push(d);
    }
    return out;
  }, [ready, range, center, counts, pinned]);

  // ---- measuring -------------------------------------------------------------------------------------------------
  const edges = useCallback((): Edges | null => {
    const sc = scroller.current;
    if (!sc) return null;
    const r = sc.getBoundingClientRect();
    const cs = getComputedStyle(sc);
    const ps = parseFloat(cs.scrollPaddingInlineStart) || 0;
    const pe = parseFloat(cs.scrollPaddingInlineEnd) || 0;
    const rtl = cs.direction === "rtl";
    return rtl ? { start: r.right - ps, end: r.left + pe, rtl } : { start: r.left + ps, end: r.right - pe, rtl };
  }, []);
  const tiles = useCallback(() => Array.from(track.current?.querySelectorAll<HTMLElement>("[data-day]") ?? []), []);
  const tileOf = useCallback((iso: string) => track.current?.querySelector<HTMLElement>(`[data-day="${iso}"]`) ?? null, []);
  /** scrollBy amount that puts the tile's start edge on the strip's start edge (scroll-padding included) */
  const toStart = (el: HTMLElement, e: Edges) => { const r = el.getBoundingClientRect(); return e.rtl ? r.right - e.start : r.left - e.start; };
  /** scrollBy amount that brings the tile fully into view (0 when it already is) */
  const toNearest = (el: HTMLElement, e: Edges) => {
    const r = el.getBoundingClientRect();
    const [lo, hi] = e.rtl ? [e.end, e.start] : [e.start, e.end];
    if (r.left >= lo - 0.5 && r.right <= hi + 0.5) return 0;
    if (e.rtl ? r.right > hi : r.left < lo) return toStart(el, e);
    return e.rtl ? r.left - lo : r.right - hi;
  };
  /** distance of a tile's centre from the start edge, growing toward the end (monotonic in DOM order) */
  const along = (el: HTMLElement, e: Edges) => { const r = el.getBoundingClientRect(); const c = (r.left + r.right) / 2; return e.rtl ? e.start - c : c - e.start; };

  /** first and last tile whose centre is in view (binary search over DOM order) */
  const inView = useCallback(() => {
    const e = edges();
    const list = tiles();
    if (!e || !list.length) return null;
    const span = Math.abs(e.start - e.end);
    const lower = (pred: (el: HTMLElement) => boolean) => { let lo = 0, hi = list.length; while (lo < hi) { const m = (lo + hi) >> 1; if (pred(list[m])) hi = m; else lo = m + 1; } return lo; };
    const i = lower((el) => along(el, e) > 0);
    const j = lower((el) => along(el, e) >= span) - 1;
    if (i >= list.length || j < i) return null;
    return { list, e, i, j };
  }, [edges, tiles]);

  const saveAnchor = useCallback(() => {
    const v = inView();
    if (!v) return;
    const el = v.list[v.i];
    anchor.current = { day: el.dataset.day!, offset: toStart(el, v.e) };
  }, [inView]);

  const restoreAnchor = useCallback(() => {
    const a = anchor.current;
    const e = edges();
    const el = a ? tileOf(a.day) : null;
    if (!a || !e || !el) return;
    const d = toStart(el, e) - a.offset;
    if (Math.abs(d) > 0.5) scroller.current!.scrollBy({ left: d, behavior: "instant" });
  }, [edges, tileOf]);

  // ---- programmatic scrolling --------------------------------------------------------------------------------------
  const snap = (on: boolean) => { if (scroller.current) scroller.current.style.scrollSnapType = on ? "" : "none"; };
  const stop = useCallback(() => {
    if (anim.current != null) { cancelAnimationFrame(anim.current); anim.current = null; snap(true); }
  }, []);
  /** scroll by delta() (re-measured every frame, so late layout changes are followed), ease-out over `ms` */
  const scrollTo = useCallback((delta: () => number, ms: number) => {
    stop();
    const sc = scroller.current;
    const d0 = delta();
    if (!sc || Math.abs(d0) < 0.5) return;
    if (ms <= 0 || reducedMotion()) { sc.scrollBy({ left: d0, behavior: "instant" }); return; }
    snap(false);
    const t0 = performance.now();
    const frame = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const want = d0 * (1 - (1 - (1 - p) ** 3)); // remaining distance on an ease-out cubic
      sc.scrollBy({ left: delta() - want, behavior: "instant" });
      if (p < 1) anim.current = requestAnimationFrame(frame);
      else { anim.current = null; snap(true); }
    };
    anim.current = requestAnimationFrame(frame);
  }, [stop]);
  const bring = useCallback((iso: string, how: "start" | "nearest", ms = STEP_MS) => {
    const el = tileOf(iso);
    if (!el) return;
    scrollTo(() => { const e = edges(); return e ? (how === "start" ? toStart(el, e) : toNearest(el, e)) : 0; }, ms);
  }, [edges, scrollTo, tileOf]);
  /** a day out of view → its week's Saturday at the start; already in view → nothing */
  const reveal = useCallback((iso: string) => {
    const el = tileOf(iso);
    const e = edges();
    if (!el || !e || toNearest(el, e) === 0) return;
    bring(tileOf(weekStart(iso)) ? weekStart(iso) : iso, "start");
  }, [bring, edges, tileOf]);

  // ---- layout effects: reveal the earlier weeks, keep the view still, place the pill ----------------------------
  const placePill = useCallback((animate: boolean) => {
    const p = pill.current;
    const el = selected ? tileOf(selected) : null;
    if (!p) return;
    if (!el) { p.style.opacity = "0"; pillAt.current = ""; return; }
    // same place → leave it alone (re-placing with no transition would cut a slide that is still running)
    const at = `${el.offsetLeft},${el.offsetTop},${el.offsetWidth},${el.offsetHeight}`;
    if (at === pillAt.current) return;
    pillAt.current = at;
    if (!animate) p.style.transition = "none";
    p.style.transform = `translate(${el.offsetLeft}px, ${el.offsetTop}px)`;
    p.style.width = `${el.offsetWidth}px`;
    p.style.height = `${el.offsetHeight}px`;
    p.style.opacity = "1";
    if (!animate) { void p.offsetWidth; p.style.transition = ""; }
  }, [selected, tileOf]);

  // the tile list changed (first reveal, a Friday shown or hidden): keep the start tile where it was
  useLayoutEffect(() => {
    if (!ready) { saveAnchor(); setReady(true); return; }
    restoreAnchor();
    saveAnchor();
    placePill(false);
    setMeasured(true);
  }, [days, ready]);
  // a new selected day: the pill slides there
  useLayoutEffect(() => {
    if (!measured) return;
    const moved = prevSelected.current !== null && selected !== null && prevSelected.current !== selected;
    placePill(moved && !reducedMotion());
    prevSelected.current = selected;
  }, [selected, measured, placePill]);

  // the selected day changed from outside (back/forward, the header's «النهارده»): bring it into view
  const internal = useRef<string | null>(null);
  const pick = (iso: string, how: SelectHow) => { internal.current = iso === selected ? null : iso; onSelect(iso, how); };
  useEffect(() => {
    if (!ready || !selected) return;
    if (internal.current === selected) { internal.current = null; return; }
    reveal(selected);
  }, [selected, ready, reveal]);

  /** the Saturday a prev/next press would bring to the start, or null at the end of the range */
  const stepTarget = useCallback((dir: 1 | -1, v: NonNullable<ReturnType<typeof inView>>) => {
    const base = weekStart(v.list[v.i].dataset.day!);
    const sat = tileOf(base);
    const aligned = !!sat && Math.abs(toStart(sat, v.e)) < sat.offsetWidth / 2;
    const target = dir > 0 ? addDaysIso(base, 7) : aligned ? addDaysIso(base, -7) : base;
    // the far end tile already fully in view → the strip cannot scroll further that way
    const edge = dir > 0 ? v.list[v.list.length - 1] : v.list[0];
    if (!tileOf(target) || toNearest(edge, v.e) === 0) return null;
    return target;
  }, [tileOf]);

  // what is in view → month label, today chip, the buttons' ends, and RollDay's loader
  const report = useCallback(() => {
    const v = inView();
    if (!v) return;
    const first = v.list[v.i].dataset.day!, last = v.list[v.j].dataset.day!;
    const canPrev = stepTarget(-1, v) !== null, canNext = stepTarget(1, v) !== null;
    setVis((o) => (o.first === first && o.last === last && o.canPrev === canPrev && o.canNext === canNext ? o : { first, last, canPrev, canNext }));
    onVisible(first, last);
  }, [inView, onVisible, stepTarget]);
  useEffect(() => {
    const sc = scroller.current;
    if (!sc || !ready) return;
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (!drag.current?.moved) saveAnchor(); report(); }); };
    sc.addEventListener("scroll", onScroll, { passive: true });
    // a width change re-sizes every tile: keep the start tile where it was and re-place the pill
    const ro = new ResizeObserver(() => { restoreAnchor(); placePill(false); report(); });
    ro.observe(sc);
    report();
    return () => { sc.removeEventListener("scroll", onScroll); ro.disconnect(); cancelAnimationFrame(raf); };
  }, [ready, report, saveAnchor, restoreAnchor, placePill]);
  useEffect(() => stop, [stop]);

  // ---- prev / next week ----------------------------------------------------------------------------------------
  const step = (dir: 1 | -1) => {
    const v = inView();
    const target = v ? stepTarget(dir, v) : null;
    if (!target) return;
    bring(target, "start");
    onWeekStep?.(target);
  };

  // ---- mouse drag (touch and trackpad scroll natively) ------------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    stop();
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    drag.current = { x: e.clientX, last: e.clientX, id: e.pointerId, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = drag.current;
    const sc = scroller.current;
    if (!g || !sc || e.pointerId !== g.id) return;
    if (!g.moved) {
      if (Math.abs(e.clientX - g.x) < DRAG_THRESHOLD) return;
      g.moved = true;
      sc.setPointerCapture(g.id);
      sc.dataset.dragging = "";
      snap(false);
    }
    sc.scrollBy({ left: g.last - e.clientX, behavior: "instant" });
    g.last = e.clientX;
  };
  const endDrag = () => {
    const g = drag.current;
    drag.current = null;
    const sc = scroller.current;
    if (!g?.moved || !sc) return;
    delete sc.dataset.dragging;
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
    // settle on the nearest day, like the native snap would
    const v = inView();
    if (!v) { snap(true); return; }
    const cand = [v.list[v.i - 1], v.list[v.i]].filter(Boolean);
    const best = cand.reduce((a, b) => (Math.abs(toStart(b, v.e)) < Math.abs(toStart(a, v.e)) ? b : a));
    scrollTo(() => { const e = edges(); return e ? toStart(best, e) : 0; }, SNAP_MS);
    if (anim.current == null) snap(true);
  };

  // ---- keyboard ----------------------------------------------------------------------------------------------------
  const onKeyDown = (e: React.KeyboardEvent) => {
    const cur = (e.target as HTMLElement).closest<HTMLElement>("[data-day]");
    if (!cur) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(cur.dataset.day!, "key"); return; }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const list = tiles();
    const rtl = getComputedStyle(scroller.current!).direction === "rtl";
    const forward = (e.key === "ArrowLeft") === rtl; // the next day lies to the left in RTL
    const next = list[list.indexOf(cur) + (forward ? 1 : -1)];
    if (!next) return;
    next.focus({ preventScroll: true });
    bring(next.dataset.day!, "nearest", 200);
    pick(next.dataset.day!, "key");
  };

  const tabStop = selected ?? focusDay;
  const todayOut = today < vis.first || today > vis.last;
  const mid = vis.first <= vis.last ? midDay(vis.first, vis.last) : vis.first;
  const arrow = "glass glass-icon tap absolute top-1/2 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full transition hover:text-text aria-disabled:text-text-4 aria-disabled:opacity-50 aria-disabled:hover:text-text-4 sm:inline-flex";

  return (
    <div className="mt-4.5 leading-[normal]">
      <div className="flex h-7 items-center justify-between gap-3 px-1 sm:px-2">
        <span className="text-sm text-text-3" data-roll-month>{arMonthYear(mid)}</span>
        {/* screen readers: the month in view and the selected day, announced politely when they change */}
        <div role="status" aria-live="polite" className="sr-only" data-roll-status>
          <span>{arMonthYear(mid)}</span>
          {selected ? <span>، {WEEKDAY_LONG[weekdayOf(selected)]} {arDayMonth(selected)}{counts.has(selected) ? ` · ${dayCount(counts.get(selected) ?? 0)}` : ""}</span> : null}
        </div>
        {todayOut ? (
          <button type="button" onClick={() => { pick(today, "today"); bring(tileOf(weekStart(today)) ? weekStart(today) : today, "start"); }}
            className="tap fade-enter inline-flex h-7 items-center rounded-full border border-gold-edge px-3 text-sm font-semibold text-gold transition hover:bg-gold-bg">
            النهارده
          </button>
        ) : null}
      </div>
      <nav aria-label="أيام الرول" className="relative mt-2 sm:overflow-hidden sm:rounded-xl sm:border sm:border-border-2 sm:bg-card sm:shadow-card">
        <button type="button" onClick={() => step(-1)} aria-label="الأسبوع اللي فات" aria-disabled={!vis.canPrev || undefined} className={cx(arrow, "start-1.5")}><ChevronRight size={16} strokeWidth={1.9} aria-hidden /></button>
        <div ref={scroller} data-roll-scroller
          className="no-scrollbar edge-fade @container snap-x snap-mandatory overflow-x-auto overscroll-x-contain sm:scroll-px-12 sm:data-[dragging]:cursor-grabbing"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
          onWheel={stop} onTouchStart={stop}
          onClickCapture={(e) => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false; } }}>
          <div ref={track} onKeyDown={onKeyDown} className="relative flex w-max select-none sm:gap-1.5 sm:px-12 sm:py-1.5">
            <span ref={pill} aria-hidden
              className="pointer-events-none absolute left-0 top-0 rounded-lg bg-selected opacity-0 shadow-[0_4px_10px_-4px_var(--backdrop)] transition-[transform,width] duration-[260ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]" />
            {days.map((d) => {
              const on = d === selected;
              const solid = on && !measured; // before the pill is placed, the tile paints its own background
              const n = counts.get(d) ?? 0;
              const wd = weekdayOf(d);
              return (
                <a key={d} href={dayHref(d)} data-day={d} draggable={false} tabIndex={d === tabStop ? 0 : -1}
                  aria-current={on ? "date" : undefined}
                  onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; e.preventDefault(); pick(d, "tap"); }}
                  className={cx("relative w-[calc(100cqi/7)] shrink-0 snap-start rounded-lg pb-1.75 pt-2 text-center transition-[color] focus-visible:outline-offset-[-2px] sm:w-[calc((100cqi-132px)/7)] sm:pb-2.75 sm:pt-3", /* ds-allow: 7 day tiles fill the strip: container-width units (cqi) need calc() */
                    on ? "text-on-selected duration-200 delay-100" : "text-text duration-0 hover:bg-card-2",
                    solid && "bg-selected shadow-[0_4px_10px_-4px_var(--backdrop)]",
                    !on && d === today && "ring-1 ring-inset ring-gold-edge")}>
                  <span className={cx("block text-xs transition-colors sm:text-sm", on ? "text-on-selected/80 duration-200 delay-100" : cx("duration-0", d === today ? "font-semibold text-gold" : "text-text-3"))}>
                    <span className="sm:hidden">{WEEKDAY_SHORT[wd]}</span><span className="hidden sm:inline">{WEEKDAY_LONG[wd]}</span>
                  </span>
                  <span className={cx("font-num mt-0.5 block text-lg leading-[1.1] sm:mt-0.75 sm:text-xl", on ? "font-medium" : "font-light")}>{Number(d.slice(8))}</span>
                  <span aria-hidden className="mt-1.25 flex h-1 justify-center gap-0.5 sm:mt-1.5 sm:h-dot sm:gap-0.75">
                    {Array.from({ length: Math.min(n, 6) }, (_, i) => <span key={i} className={cx("size-1 rounded-full transition-colors sm:size-dot", on ? "bg-on-selected/85 duration-200 delay-100" : "bg-text-4 duration-0")} />)}
                  </span>
                  <span className="sr-only">{d === today ? "النهارده، " : ""}{formatDmy(d)}، {counts.has(d) ? dayCount(n) : ""}</span>
                </a>
              );
            })}
          </div>
        </div>
        <button type="button" onClick={() => step(1)} aria-label="الأسبوع الجاي" aria-disabled={!vis.canNext || undefined} className={cx(arrow, "end-1.5")}><ChevronLeft size={16} strokeWidth={1.9} aria-hidden /></button>
      </nav>
    </div>
  );
}

/** the middle day of first … last (the month label follows it) */
function midDay(first: string, last: string): string {
  const n = Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000 / 2);
  return addDaysIso(first, n);
}
