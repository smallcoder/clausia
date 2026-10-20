// OWNER: hearings agent — the case's hearings as a timeline; add a hearing and record decisions inline.
import { AddHearing } from "@/components/hearings/AddHearing";
import { DecisionBadge } from "@/components/hearings/HearingItem";
import { RecordDecision } from "@/components/hearings/RecordDecision";
import { EmptyState, SourceBadge, cx } from "@/components/ui";
import { formatDayLabel, formatDmy, todayIso } from "@/lib/dates";
import { caseHearings } from "@/lib/hearings";
import { createClient } from "@/lib/supabase/server";

export async function HearingsTab({ caseId }: { caseId: string }) {
  const db = await createClient();
  const today = todayIso();
  const rows = await caseHearings(db, caseId);
  // the nearest upcoming hearing gets the accent dot
  const nextUp = rows.find((h) => h.hearing_date >= today)?.id;

  return (
    <div className="max-w-3xl space-y-5">
      <AddHearing caseId={caseId} />

      {rows.length === 0 ? (
        <EmptyState title="لا جلسات مسجلة لهذه الدعوى" hint="أضف أول جلسة بتاريخها، أو أخبر المساعد في تبويب المحادثة." />
      ) : (
        <ol className="relative border-s border-line-strong ps-5">
          {rows.map((h) => {
            const past = h.hearing_date < today;
            return (
              <li key={h.id} id={`h-${h.id}`} className="relative pb-6 last:pb-0">
                <span aria-hidden
                  className={cx("absolute -start-[1.6rem] top-1.5 size-3 rounded-full border-2",
                    h.id === nextUp ? "border-accent bg-accent" : h.decision_type ? "border-line-strong bg-surface-2" : past ? "border-brass bg-brass-soft" : "border-accent bg-surface")} />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="font-semibold text-ink">{formatDayLabel(h.hearing_date)}</h3>
                  {h.id === nextUp ? <span className="text-xs font-medium text-accent">الجلسة القادمة</span> : null}
                  <DecisionBadge h={h} today={today} />
                </div>
                {h.purpose ? <p className="mt-1 text-sm text-ink-2"><span className="text-ink-3">الغرض / المطلوب: </span>{h.purpose}</p> : null}
                {h.decision_text ? <p className="mt-1 text-sm text-ink"><span className="text-ink-3">القرار: </span>{h.decision_text}</p> : null}
                {h.next_requirements ? <p className="mt-1 text-sm text-ink"><span className="text-ink-3">المطلوب للجلسة القادمة: </span>{h.next_requirements}</p> : null}
                {h.next_hearing_id ? (
                  <a href={`#h-${h.next_hearing_id}`} className="mt-1 inline-block text-sm text-accent hover:underline">
                    الجلسة التالية: <span className="num">{formatDmy(h.next_date)}</span>
                  </a>
                ) : null}
                <div className="mt-1.5"><SourceBadge row={h} /></div>
                {!h.decision_type && h.hearing_date <= today ? <RecordDecision hearingId={h.id} caseId={caseId} hearingDate={h.hearing_date} /> : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
