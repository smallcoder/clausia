"use client";
/**
 * The «محتاجة قرار» tab (mockup docs/design/ia/BannerOptsLight, option A; the rows are the agenda's own): every past hearing with no decision,
 * oldest first. A row: the date (d/m/yyyy), the court · circuit and the case number, «client ضد opponent», what was required, and «سجّل القرار».
 * «سجّل القرار» opens the small form inside the row (RecordDecision, layout "row") — the same form, the same save
 * (recordDecisionAction → applyOp('record_decision'), MANUAL provenance) as everywhere else. Nothing is saved without the tap on «حفظ القرار»; the date of the
 * next hearing is what the lawyer types. After a save the row leaves and the count drops (AgendaView keeps the saved ids; the page is read again behind it).
 * A decision typed in the chat is unchanged: it gives its usual confirm card.
 */
import Link from "next/link";
import { useRef, useState } from "react";
import { Sides } from "@/components/agenda/AgendaRows";
import { RecordDecision } from "@/components/hearings/RecordDecision";
import { caseNumber } from "@/components/hearings/roll-text";
import { DateText, cx } from "@/components/ui";
import { formatDmy } from "@/lib/dates";
import { courtOf, type HearingWithCase } from "@/lib/hearings";

const GRID = "sm:grid-cols-[minmax(0,1.1fr)_minmax(0,4fr)_minmax(0,2.6fr)_auto]";
const PAD = "px-4 sm:px-6";

export type Saved = { id: string; label: string; nextDate: string | null };

function Row({ h, onSaved }: { h: HearingWithCase; onSaved: (s: Saved) => void }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const c = h.case;
  const where = [courtOf(h), c.circuit?.trim()].filter(Boolean).join(" · ");
  const need = h.purpose?.trim() || null;
  const label = `جلسة ${formatDmy(h.hearing_date)}`;
  return (
    <li>
      <div className={cx("grid gap-x-4 gap-y-1.5 py-3.5 sm:items-center sm:py-4", GRID, PAD)}>
        <DateText iso={h.hearing_date} className="text-md font-bold text-text sm:text-base" />
        <div className="min-w-0">
          <Link href={`/cases/${c.id}?tab=hearings&hearing=${h.id}`} className="block text-md font-bold leading-[1.5] text-text hover:underline"><Sides h={h} /></Link>
          <div className="text-base text-text-3">{[where, caseNumber(h) ?? "بلا رقم"].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="min-w-0 text-base text-text-3">
          {need ? <><span className="sm:hidden">المطلوب: </span><span>{need}</span></> : <span aria-label="لا يوجد مطلوب مسجل">—</span>}
        </div>
        {open ? <span /> : (
          <button ref={opener} type="button" onClick={() => setOpen(true)} aria-label={`سجّل القرار، ${label}`}
            className="tap inline-flex h-chip w-fit items-center rounded-full border border-border bg-chip px-4 text-sm font-semibold text-text shadow-soft transition hover:bg-card-2">
            سجّل القرار
          </button>
        )}
      </div>
      {open ? (
        <div className={cx("border-t border-border-2 bg-card-2 py-4", PAD)}>
          <RecordDecision layout="row" hearingId={h.id} caseId={c.id} hearingDate={h.hearing_date} label={label} cancelLabel="إلغاء"
            onSaved={(r) => onSaved({ id: h.id, label, nextDate: r.nextDate })}
            onCancel={() => { setOpen(false); requestAnimationFrame(() => opener.current?.focus()); }} />
        </div>
      ) : null}
    </li>
  );
}

/** `rows`: still waiting, oldest first (decide.ts). `total`: the tab's number. */
export function DecideList({ rows, total, saved, onSaved }: { rows: HearingWithCase[]; total: number; saved: Saved[]; onSaved: (s: Saved) => void }) {
  return (
    <div className="space-y-3.5">
      {saved.length ? (
        <ul className="space-y-2" aria-label="اللي اتسجل">
          {saved.map((s) => (
            <li key={s.id} role="status" className="rounded-md border border-good/20 bg-good-bg px-3 py-2 text-base leading-[1.55] text-good">
              <span className="block">تم حفظ قرار {s.label}</span>
              {s.nextDate ? <span className="block">الجلسة القادمة: <DateText iso={s.nextDate} className="font-semibold" /></span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {rows.length ? (
        <section aria-label="جلسات محتاجة قرار" className="overflow-hidden rounded-xl border border-border-2 bg-card shadow-card">
          <ul className="divide-y divide-border-2">
            {rows.map((h) => <Row key={h.id} h={h} onSaved={onSaved} />)}
          </ul>
        </section>
      ) : (
        <div className="rounded-xl border border-border-2 bg-card px-5 py-10 text-center text-md text-text-3 shadow-card">كل القرارات متسجلة ✓</div>
      )}
      {total > rows.length && rows.length ? <p className="px-1 text-sm text-text-3">دي أقدم {rows.length} جلسة. فيه {total - rows.length} كمان هتظهر بعد ما تسجّل دول.</p> : null}
    </div>
  );
}
