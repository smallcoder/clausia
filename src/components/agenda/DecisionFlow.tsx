"use client";
/**
 * «سجّلها واحدة واحدة»: the one-by-one flow for past hearings that still have no decision (opened from the slim line of the agenda).
 * One hearing at a time, oldest first; the decision is recorded with the SAME form and the SAME write as everywhere else
 * (RecordDecision → recordDecisionAction → applyOp('record_decision'), manual provenance). Nothing is saved without the lawyer's tap on
 * «حفظ القرار»; «بعدين» moves on without saving. The list is the one read when the flow opened, so the order does not jump while the
 * page refreshes behind it after each save.
 */
import { ChevronLeft, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RecordDecision } from "@/components/hearings/RecordDecision";
import { CircuitNum } from "@/components/hearings/RollSheet";
import { caseNumber, hearingTitle, nHearings } from "@/components/hearings/roll-text";
import { DateText } from "@/components/ui";
import { formatDayLabel, formatDmy } from "@/lib/dates";
import { courtOf, type HearingWithCase } from "@/lib/hearings";
import { DECISION } from "@/lib/labels";

export function DecisionFlow({ rows, onClose }: { rows: HearingWithCase[]; onClose: () => void }) {
  const [list] = useState(rows);
  const [i, setI] = useState(0);
  const [saved, setSaved] = useState<{ decision: string; nextDate: string | null } | null>(null);
  const [count, setCount] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const h = list[i] as HearingWithCase | undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose]);
  // each hearing (and the end) takes the focus, so a keyboard or screen-reader user starts at its title
  useEffect(() => { heading.current?.focus(); }, [i]);

  const last = i >= list.length - 1;
  const next = () => { setSaved(null); setI((n) => n + 1); };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:block" role="dialog" aria-modal="true" aria-labelledby="flow-title">
      <button type="button" aria-label="إغلاق" tabIndex={-1} onClick={onClose} className="fade-enter absolute inset-0 bg-backdrop" />
      <div className="relative flex max-h-[90dvh] flex-col overflow-hidden rounded-t-xl border border-border-2 bg-card shadow-pop animate-[sheet-up_260ms_cubic-bezier(0.32,0.72,0,1)] sm:absolute sm:inset-y-4 sm:end-4 sm:max-h-none sm:w-110 sm:rounded-xl sm:animate-[fade-in_180ms_ease-out]" /* ds-allow: dvh: the panel is at most 90% of the visible screen */>
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" aria-hidden />
        <header className="flex items-center justify-between gap-3 border-b border-border-2 px-5 pb-3 pt-3 sm:px-6 sm:pt-5">
          <div className="text-sm font-semibold text-text-3" aria-live="polite">
            {h ? <>جلسة <span className="font-num">{i + 1}</span> من <span className="font-num">{list.length}</span></> : "خلصت"}
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق"
            className="glass glass-icon inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:text-text">
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </header>

        {h ? (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
              <div className="flex items-start gap-4">
                <CircuitNum h={h} size="sheet" />
                <div className="min-w-0 flex-1 border-s border-border-2 ps-4">
                  <div className="truncate text-sm font-semibold text-text-3">{[courtOf(h), h.location?.trim() || h.case.circuit?.trim()].filter(Boolean).join(" · ")}</div>
                  <h2 id="flow-title" ref={heading} tabIndex={-1} className="mt-0.5 text-lg font-bold leading-snug text-title outline-none">{hearingTitle(h)}</h2>
                  <div className="mt-1 text-sm text-text-3">
                    {caseNumber(h) ? <><span>{caseNumber(h)}</span> · </> : null}جلسة <DateText value={formatDayLabel(h.hearing_date)} />
                  </div>
                </div>
              </div>
              {h.purpose ? <p className="text-base text-text-2"><span className="text-text-3">المطلوب في الجلسة: </span>{h.purpose}</p> : null}

              {saved ? (
                <div role="status" className="rounded-lg bg-good-bg px-4 py-3 text-base text-good">
                  <div className="font-bold">اتسجّل القرار: {DECISION[saved.decision as keyof typeof DECISION] ?? "تم الحفظ"}.</div>
                  {saved.nextDate ? <div className="mt-0.5">الجلسة القادمة: <DateText value={formatDayLabel(saved.nextDate)} className="font-semibold" /> — اتضافت للأجندة.</div> : null}
                </div>
              ) : (
                <RecordDecision key={h.id} layout="sheet" hearingId={h.id} caseId={h.case.id} hearingDate={h.hearing_date}
                  label={`${hearingTitle(h)}، جلسة ${formatDmy(h.hearing_date)}`} cancelLabel={last ? "اقفل" : "بعدين"}
                  onSaved={(r) => { setSaved({ decision: r.decision, nextDate: r.nextDate }); setCount((n) => n + 1); }} onCancel={last ? onClose : next} />
              )}
            </div>
            <footer className="flex gap-2 border-t border-border-2 px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] sm:px-6" /* ds-allow: safe-area inset needs calc() */>
              {saved ? (
                <button type="button" onClick={last ? onClose : next} className="bg-primary-fill inline-flex h-11 flex-1 items-center justify-center rounded-full text-md font-bold">
                  {last ? "تمام" : "الجلسة اللي بعدها"}
                </button>
              ) : null}
              <Link href={`/cases/${h.case.id}?tab=hearings&hearing=${h.id}`}
                className="inline-flex h-11 flex-1 items-center justify-between gap-2 rounded-full border border-border bg-card-2 px-5 text-md text-text-2 hover:text-text">
                <span>فتح ملف الدعوى</span>
                <ChevronLeft size={18} strokeWidth={1.9} aria-hidden />
              </Link>
            </footer>
          </>
        ) : (
          <>
            <div className="flex-1 px-5 py-6 sm:px-6">
              <h2 id="flow-title" ref={heading} tabIndex={-1} className="text-lg font-bold text-title outline-none">خلصت الجلسات اللي فاتت</h2>
              <p className="mt-2 text-base text-text-3">{count ? `سجّلت قرار ${nHearings(count)}.` : "ما سجّلتش أي قرار."}</p>
            </div>
            <footer className="border-t border-border-2 px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] sm:px-6" /* ds-allow: safe-area inset needs calc() */>
              <button type="button" onClick={onClose} className="bg-primary-fill inline-flex h-11 w-full items-center justify-center rounded-full text-md font-bold">تمام</button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
