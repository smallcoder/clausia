"use client";
/**
 * The roll's rows and the decision sheet. Tapping a row opens one hearing: a bottom sheet on mobile, a side panel
 * on desktop. A held hearing with no decision gets the «تسجيل القرار» form (RecordDecision → applyOp
 * 'record_decision'); every hearing links to its case. Wrap the roll in <RollSheet>; each row is a <RollRow>.
 */
import { ChevronLeft, X } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { StatusChip } from "@/components/shell/PageHero";
import { cx } from "@/components/ui";
import { formatDayLabel, formatDmy } from "@/lib/dates";
import { circuitNumber, courtOf, type HearingWithCase } from "@/lib/hearings";
import { DECISION } from "@/lib/labels";
import { RecordDecision } from "./RecordDecision";
import { caseNumber, hearingStatus, hearingTitle } from "./roll-text";

const Ctx = createContext<((h: HearingWithCase) => void) | null>(null);

export function RollSheet({ today, children }: { today: string; children: ReactNode }) {
  const [h, setH] = useState<HearingWithCase | null>(null);
  const open = useCallback((x: HearingWithCase) => setH(x), []);
  return (
    <Ctx.Provider value={open}>
      {children}
      {h ? <Sheet key={h.id} h={h} today={today} onClose={() => setH(null)} /> : null}
    </Ctx.Provider>
  );
}

/** The dark ink tile with the circuit number (or «—» when the circuit has no number). */
export function CircuitTile({ h }: { h: HearingWithCase }) {
  const n = circuitNumber(h);
  return (
    <span aria-hidden className="flex size-10 shrink-0 flex-col items-center justify-center rounded-[12px] border border-transparent bg-ink-solid shadow-[0_4px_10px_-2px_var(--backdrop)] dark:border-[var(--accent-edge)] dark:shadow-none leading-none sm:size-11 sm:rounded-[13px]">
      <span className="text-[8.5px] text-gold/70 sm:text-[9px]">دائرة</span>
      <span className="font-num mt-0.5 text-[16px] font-extrabold text-gold sm:text-[17px]">{n ?? "—"}</span>
    </span>
  );
}

function Status({ h, today }: { h: HearingWithCase; today: string }) {
  const s = hearingStatus(h, today);
  return (
    <StatusChip tone={s.tone}>
      {s.label}
      {s.next ? <>&nbsp;← <span className="num">{s.next}</span></> : null}
    </StatusChip>
  );
}

/** One hearing in the roll. `showDate` / `showCourt` for lists that are not grouped by day / court. */
export function RollRow({ h, today, showDate = false, showCourt = false }: { h: HearingWithCase; today: string; showDate?: boolean; showCourt?: boolean }) {
  const open = useContext(Ctx);
  const long = caseNumber(h);
  const short = caseNumber(h, true);
  const need = h.purpose?.trim() || null;
  // [text, is-number] — numbers and dates stay left-to-right inside the Arabic line
  const meta = (num: string | null, ltr: boolean, extra?: string | null) => ([
    [showDate ? formatDmy(h.hearing_date) : null, true],
    [showCourt ? courtOf(h) : null, false],
    [num, ltr],
    [extra ?? null, false],
  ] as [string | null, boolean][]).filter((x): x is [string, boolean] => !!x[0]);
  const line = (items: [string, boolean][]) => items.map(([t, n], i) => <span key={i}>{i ? " · " : ""}<span className={n ? "num" : undefined}>{t}</span></span>);
  return (
    <button type="button" onClick={() => open?.(h)} aria-haspopup="dialog"
      className="flex w-full items-start gap-3 px-3.5 py-3 text-start transition hover:bg-card-2/60 sm:px-4 sm:py-3.5">
      <CircuitTile h={h} />
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 truncate text-[14px] font-bold leading-[1.45] text-text sm:whitespace-normal sm:text-[14.5px]">{hearingTitle(h)}</span>
          <span className="shrink-0"><Status h={h} today={today} /></span>
        </span>
        {/* mobile: «772/2025 · المطلوب: …» in one line */}
        <span className="mt-px block truncate text-[11.5px] text-text-3 sm:hidden">
          {line(meta(short, true, need ? `المطلوب: ${need}` : null))}
        </span>
        {/* desktop: number line, then the «المطلوب» pill */}
        {meta(long, false).length ? (
          <span className="mt-[3px] hidden text-[12px] text-text-3 sm:block">
            {line(meta(long, false))}
          </span>
        ) : null}
        {need ? (
          <span className="mt-2.5 hidden h-[26px] max-w-full items-center truncate rounded-full bg-(image:--accent-grad) px-2.5 text-[11.5px] font-bold text-text sm:inline-flex dark:bg-warn-bg dark:bg-none dark:font-semibold dark:text-gold-text">
            المطلوب: {need}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function Sheet({ h, today, onClose }: { h: HearingWithCase; today: string; onClose: () => void }) {
  const [saved, setSaved] = useState<{ decision: string; nextDate: string | null } | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  const c = h.case;
  const num = caseNumber(h);
  const canDecide = !h.decision_type && h.hearing_date <= today;
  const label = `${hearingTitle(h)}، جلسة ${formatDmy(h.hearing_date)}`;
  const caseHref = `/cases/${c.id}?tab=hearings`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:block" role="dialog" aria-modal="true" aria-labelledby="roll-sheet-title">
      <button type="button" aria-label="إغلاق" tabIndex={-1} onClick={onClose} className="fade-enter absolute inset-0 bg-backdrop" />
      <div className="relative flex max-h-[90dvh] flex-col overflow-hidden rounded-t-[28px] border border-border bg-card shadow-pop animate-[sheet-up_260ms_cubic-bezier(0.32,0.72,0,1)] sm:absolute sm:inset-y-4 sm:end-4 sm:max-h-none sm:w-[440px] sm:rounded-[28px] sm:animate-[fade-in_180ms_ease-out]">
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" aria-hidden />
        <header className="flex items-start gap-3 border-b border-border-2 px-5 pb-4 pt-3 sm:pt-5">
          <CircuitTile h={h} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold text-gold-text">{courtOf(h)}{c.circuit ? ` · ${c.circuit}` : ""}</div>
            <h2 id="roll-sheet-title" className="mt-0.5 text-[17px] font-bold leading-snug text-text">{hearingTitle(h)}</h2>
            <div className="mt-1 text-[13px] text-text-3">
              {num ? <>{num} · </> : null}جلسة {formatDayLabel(h.hearing_date)}
            </div>
          </div>
          <button ref={closeBtn} type="button" onClick={onClose} aria-label="إغلاق"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card-2 text-text-3 hover:text-text">
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {saved ? <StatusChip tone="neutral">{DECISION[saved.decision as keyof typeof DECISION] ?? "تم الحفظ"}</StatusChip> : <Status h={h} today={today} />}
            {h.review_status === "suggested" ? <StatusChip tone="warn">مقترحة</StatusChip> : null}
          </div>
          {h.purpose ? (
            <p className="text-[14px] text-text-2"><span className="text-text-4">المطلوب في الجلسة: </span>{h.purpose}</p>
          ) : null}

          {h.decision_type ? (
            <div className="space-y-1.5 rounded-[16px] border border-border-2 bg-card-2 px-4 py-3 text-[14px] text-text-2">
              <div><span className="text-text-4">القرار: </span><span className="font-semibold text-text">{DECISION[h.decision_type]}</span></div>
              {h.decision_text ? <p className="text-doc text-[15px] text-text">{h.decision_text}</p> : null}
              {h.next_date ? <div><span className="text-text-4">الجلسة القادمة: </span><span className="num font-semibold text-text">{formatDayLabel(h.next_date)}</span></div> : null}
              {h.next_requirements ? <div><span className="text-text-4">المطلوب لها: </span>{h.next_requirements}</div> : null}
            </div>
          ) : saved ? (
            <div role="status" className="rounded-[16px] bg-good-bg px-4 py-3 text-[14px] text-good">
              <div className="font-bold">اتسجّل القرار.</div>
              {saved.nextDate ? <div className="mt-0.5">الجلسة القادمة: <span className="num font-semibold">{formatDayLabel(saved.nextDate)}</span> — اتضافت للرول.</div> : null}
            </div>
          ) : canDecide ? (
            <RecordDecision layout="sheet" hearingId={h.id} caseId={c.id} hearingDate={h.hearing_date} label={label}
              onSaved={(r) => setSaved({ decision: r.decision, nextDate: r.nextDate })} onCancel={onClose} />
          ) : (
            <p className="rounded-[16px] bg-card-2 px-4 py-3 text-[14px] leading-7 text-text-3">
              الجلسة دي لسه ما جاتش. بعدها، سجّل القرار من هنا أو اكتبه لـ Clausia زي ما سمعته.
            </p>
          )}
        </div>

        <footer className={cx("border-t border-border-2 px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]", saved && "flex gap-2")}>
          {saved ? (
            <button type="button" onClick={onClose} className="bg-primary-fill inline-flex h-11 flex-1 items-center justify-center rounded-full text-[15px] font-bold">تمام</button>
          ) : null}
          <Link href={caseHref} className="inline-flex h-11 w-full flex-1 items-center justify-between gap-2 rounded-full border border-border bg-card-2 px-5 text-[15px] text-text-2 hover:text-text">
            <span>فتح ملف الدعوى</span>
            <ChevronLeft size={18} strokeWidth={1.9} aria-hidden />
          </Link>
        </footer>
      </div>
    </div>
  );
}
