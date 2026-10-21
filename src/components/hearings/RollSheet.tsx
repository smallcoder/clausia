"use client";
/**
 * The roll's hearing cards and the decision sheet (design v2, docs/design/*Roll.dc.html). Tapping a card opens one
 * hearing: a bottom sheet on mobile, a side panel on desktop. A held hearing with no decision gets the «تسجيل القرار»
 * form (RecordDecision → applyOp 'record_decision'); every hearing links to its case. Wrap the roll in <RollSheet>;
 * each hearing is a <RollRow>, the next one a <RollNext>; <OpenHearing> is any other control that opens the sheet.
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
  const close = useCallback(() => setH(null), []);
  return (
    <Ctx.Provider value={open}>
      {children}
      {h ? <Sheet key={h.id} h={h} today={today} onClose={close} /> : null}
    </Ctx.Provider>
  );
}

/** Any control that opens a hearing's sheet (the side card's «سجّل»). */
export function OpenHearing({ h, className, label, children }: { h: HearingWithCase; className?: string; label?: string; children: ReactNode }) {
  const open = useContext(Ctx);
  return <button type="button" onClick={() => open?.(h)} aria-haspopup="dialog" aria-label={label} className={className}>{children}</button>;
}

/** The circuit number in large light digits with «دائرة» under it («—» when the circuit has no number). */
export function CircuitNum({ h, size = "row" }: { h: HearingWithCase; size?: "row" | "next" | "sheet" }) {
  const n = circuitNumber(h);
  const digits = { row: "text-xl", next: "text-display sm:text-display-lg", sheet: "text-2xl" }[size];
  return (
    <span aria-hidden className={cx("flex shrink-0 flex-col items-center text-center leading-none", size === "row" && "min-w-7 sm:w-10")}>
      <span className={cx("font-num font-extralight leading-none", digits, n ? "text-gold" : "text-text-4")}>{n ?? "—"}</span>
      <span className={cx("mt-[3px]", size === "row" ? "text-xs text-text-4" : "mt-1 text-xs text-text-3")}>دائرة</span>
    </span>
  );
}

/** decided → the decision (← next date) · before today with no decision → «محتاجة قرار» · today → «النهارده» (only when asked) */
function RowStatus({ h, today, showToday }: { h: HearingWithCase; today: string; showToday: boolean }) {
  const s = hearingStatus(h, today);
  if (s.tone === "good" || (s.tone === "accent" && !showToday)) return null;
  return (
    <StatusChip tone={s.tone}>
      {s.label}
      {s.next ? <>&nbsp;← <span className="num font-num">{s.next}</span></> : null}
    </StatusChip>
  );
}

const sep = (items: (ReactNode | null | false | undefined)[]) =>
  items.filter(Boolean).map((t, i) => <span key={i}>{i ? " · " : ""}{t}</span>);

/**
 * One hearing as a solid card: the circuit number, «client — subject», number/year (· type), «المطلوب: …».
 * `showDate` / `showCourt` for lists that are not grouped by day / court; `showToday` adds the «النهارده» chip.
 */
export function RollRow({ h, today, showDate = false, showCourt = false, showToday = false }: { h: HearingWithCase; today: string; showDate?: boolean; showCourt?: boolean; showToday?: boolean }) {
  const open = useContext(Ctx);
  const num = caseNumber(h);
  const need = h.purpose?.trim() || null;
  const date = showDate ? <span className="num font-num">{formatDmy(h.hearing_date)}</span> : null;
  const court = showCourt ? courtOf(h) : null;
  const status = <RowStatus h={h} today={today} showToday={showToday} />;
  return (
    <button type="button" onClick={() => open?.(h)} aria-haspopup="dialog"
      className="flex w-full items-center gap-3.5 rounded-lg border border-border-2 bg-card px-4 py-[13px] text-start shadow-card transition hover:border-border sm:gap-[22px] sm:rounded-xl sm:px-6 sm:py-[18px]">
      <CircuitNum h={h} />
      <span className="min-w-0 flex-1 border-s border-[var(--hairline-v2)] ps-3.5 sm:ps-[22px]">
        <span className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-base font-semibold text-text sm:whitespace-normal sm:text-md">{hearingTitle(h)}</span>
          <span className="shrink-0 sm:hidden">{status}</span>
        </span>
        {/* mobile: date / court, then «المطلوب: …» */}
        <span className="mt-[3px] block truncate text-sm text-text-3 sm:hidden">
          {sep([date, court, need ? <>المطلوب: <span className="text-text">{need}</span></> : !date && !court && num ? <span>{num}</span> : null])}
        </span>
        {/* desktop: date · court · number · type */}
        <span className="mt-[3px] hidden truncate text-sm text-text-3 sm:block">
          {sep([date, court, num ? <span>{num}</span> : null, h.case.case_type?.trim()])}
        </span>
      </span>
      <span className="hidden max-w-[38%] shrink-0 flex-col items-end gap-1.5 text-sm sm:flex">
        {status}
        {need ? <span className="max-w-full truncate text-text"><span className="text-text-3">المطلوب: </span>{need}</span> : null}
      </span>
    </button>
  );
}

/**
 * The next hearing, expanded: big circuit number, title, number, a gold-dot «المطلوب», and «سجّل قرار الجلسة دي»
 * (only once the hearing is held — the server refuses a decision on a future hearing).
 */
export function RollNext({ h, today }: { h: HearingWithCase; today: string }) {
  const open = useContext(Ctx);
  const num = caseNumber(h);
  const need = h.purpose?.trim() || null;
  const type = h.case.case_type?.trim() || null;
  const canDecide = !h.decision_type && h.hearing_date <= today;
  const needLine = need ? (
    <span className="flex items-center gap-2 text-sm sm:text-base">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-gold" />
      <span className="text-text-3">المطلوب:</span>
      <span className="min-w-0 font-semibold text-text">{need}</span>
    </span>
  ) : null;
  return (
    <div className="rounded-xl border border-border-2 bg-card p-[18px] shadow-card sm:flex sm:items-center sm:gap-[26px] sm:px-[26px] sm:py-6">
      <button type="button" onClick={() => open?.(h)} aria-haspopup="dialog" className="flex w-full min-w-0 items-center gap-4 text-start sm:flex-1 sm:gap-[26px]">
        <CircuitNum h={h} size="next" />
        <span className="min-w-0 flex-1 border-s border-[var(--hairline-v2)] ps-4 sm:ps-[26px]">
          <span className="block text-md font-semibold leading-[1.5] text-text sm:text-lg">{hearingTitle(h)}</span>
          {num ? (
            <span className="mt-[3px] block text-sm text-text-3">
              <span>{num}</span>
              {type ? <span className="hidden sm:inline"> · {type}</span> : null}
            </span>
          ) : type ? <span className="mt-[3px] block text-sm text-text-3">{type}</span> : null}
          {needLine ? <span className="mt-3.5 hidden sm:block">{needLine}</span> : null}
        </span>
      </button>
      {needLine ? <div className="mt-4 border-t border-[var(--hairline-v2)] pt-[13px] sm:hidden">{needLine}</div> : null}
      {canDecide ? (
        <button type="button" onClick={() => open?.(h)} aria-haspopup="dialog"
          className="bg-primary-fill mt-3.5 inline-flex h-11 w-full shrink-0 items-center justify-center rounded-full px-[22px] text-base font-bold transition hover:opacity-90 sm:mt-0 sm:h-[46px] sm:w-auto sm:self-end">
          سجّل قرار الجلسة دي
        </button>
      ) : null}
    </div>
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
  const s = hearingStatus(h, today);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:block" role="dialog" aria-modal="true" aria-labelledby="roll-sheet-title">
      <button type="button" aria-label="إغلاق" tabIndex={-1} onClick={onClose} className="fade-enter absolute inset-0 bg-backdrop" />
      <div className="relative flex max-h-[90dvh] flex-col overflow-hidden rounded-t-xl border border-border-2 bg-card shadow-pop animate-[sheet-up_260ms_cubic-bezier(0.32,0.72,0,1)] sm:absolute sm:inset-y-4 sm:end-4 sm:max-h-none sm:w-[440px] sm:rounded-xl sm:animate-[fade-in_180ms_ease-out]">
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" aria-hidden />
        <header className="flex items-start gap-4 border-b border-[var(--hairline-v2)] px-5 pb-4 pt-3 sm:px-6 sm:pt-6">
          <CircuitNum h={h} size="sheet" />
          <div className="min-w-0 flex-1 border-s border-[var(--hairline-v2)] ps-4">
            <div className="truncate text-sm font-semibold text-text-3">{[courtOf(h), h.location?.trim() || c.circuit?.trim()].filter(Boolean).join(" · ")}</div>
            <h2 id="roll-sheet-title" className="mt-0.5 text-lg font-bold leading-snug text-title">{hearingTitle(h)}</h2>
            <div className="mt-1 text-sm text-text-3">
              {num ? <><span>{num}</span> · </> : null}جلسة {formatDayLabel(h.hearing_date)}
            </div>
          </div>
          <button ref={closeBtn} type="button" onClick={onClose} aria-label="إغلاق"
            className="glass glass-icon inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:text-text">
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            {saved ? <StatusChip tone="neutral">{DECISION[saved.decision as keyof typeof DECISION] ?? "تم الحفظ"}</StatusChip> : (
              <StatusChip tone={s.tone}>{s.label}{s.next ? <>&nbsp;← <span className="num font-num">{s.next}</span></> : null}</StatusChip>
            )}
            {h.review_status === "suggested" ? <StatusChip tone="warn">مقترحة</StatusChip> : null}
          </div>
          {h.purpose ? (
            <p className="text-base text-text-2"><span className="text-text-3">المطلوب في الجلسة: </span>{h.purpose}</p>
          ) : null}

          {h.decision_type ? (
            <div className="space-y-1.5 rounded-lg border border-border-2 bg-card-2 px-4 py-3 text-base text-text-2">
              <div><span className="text-text-3">القرار: </span><span className="font-semibold text-text">{DECISION[h.decision_type]}</span></div>
              {h.decision_text ? <p className="text-doc text-md text-text">{h.decision_text}</p> : null}
              {h.next_date ? <div><span className="text-text-3">الجلسة القادمة: </span><span className="num font-semibold text-text">{formatDayLabel(h.next_date)}</span></div> : null}
              {h.next_requirements ? <div><span className="text-text-3">المطلوب لها: </span>{h.next_requirements}</div> : null}
            </div>
          ) : saved ? (
            <div role="status" className="rounded-lg bg-good-bg px-4 py-3 text-base text-good">
              <div className="font-bold">اتسجّل القرار.</div>
              {saved.nextDate ? <div className="mt-0.5">الجلسة القادمة: <span className="num font-semibold">{formatDayLabel(saved.nextDate)}</span> — اتضافت للرول.</div> : null}
            </div>
          ) : canDecide ? (
            <RecordDecision layout="sheet" hearingId={h.id} caseId={c.id} hearingDate={h.hearing_date} label={label}
              onSaved={(r) => setSaved({ decision: r.decision, nextDate: r.nextDate })} onCancel={onClose} />
          ) : (
            <p className="rounded-lg bg-card-2 px-4 py-3 text-base leading-7 text-text-3">
              الجلسة دي لسه ما جاتش. بعدها، سجّل القرار من هنا أو اكتبه لـ Clausia زي ما سمعته.
            </p>
          )}
        </div>

        <footer className={cx("border-t border-[var(--hairline-v2)] px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] sm:px-6", saved && "flex gap-2")}>
          {saved ? (
            <button type="button" onClick={onClose} className="bg-primary-fill inline-flex h-11 flex-1 items-center justify-center rounded-full text-md font-bold">تمام</button>
          ) : null}
          <Link href={caseHref} className="inline-flex h-11 w-full flex-1 items-center justify-between gap-2 rounded-full border border-border bg-card-2 px-5 text-md text-text-2 hover:text-text">
            <span>فتح ملف الدعوى</span>
            <ChevronLeft size={18} strokeWidth={1.9} aria-hidden />
          </Link>
        </footer>
      </div>
    </div>
  );
}
