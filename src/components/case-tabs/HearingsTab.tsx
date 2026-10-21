// «الجلسات» (?tab=hearings): the case's hearings as a vertical timeline, like the facts timeline on the case page.
// Each hearing: date · dot · its state chip (DecisionBadge), what was needed, the decision, the link to the next one.
// A held hearing (today or before) without a decision gets «سجّل القرار» inline. «أضف جلسة» is the panel's last row.
import { AddHearing } from "@/components/hearings/AddHearing";
import { DecisionNotices } from "@/components/hearings/DecisionNotices";
import { DecisionBadge } from "@/components/hearings/HearingItem";
import { RecordDecision } from "@/components/hearings/RecordDecision";
import { Panel, StatusChip } from "@/components/shell/PageHero";
import { cx } from "@/components/ui";
import { formatDayLabel, formatDmy, todayIso } from "@/lib/dates";
import { caseHearings } from "@/lib/hearings";
import { createClient } from "@/lib/supabase/server";

type Row = Awaited<ReturnType<typeof caseHearings>>[number];

const countLabel = (n: number) => (n === 1 ? "جلسة واحدة" : n === 2 ? "جلستين" : n <= 10 ? `${n} جلسات` : `${n} جلسة`);

function sourceLine(h: Row): string {
  if (h.source_kind === "document") return `من مستند${h.source_page ? ` ص ${h.source_page}` : ""}`;
  if (h.source_kind === "chat") return h.created_by_kind === "model" ? "من رسالتك · صاغها Clausia" : "من رسالتك";
  return "سجّلها المحامي";
}

function HearingRow({ h, today, nextUp, last, caseId }: { h: Row; today: string; nextUp: boolean; last: boolean; caseId: string }) {
  const held = h.hearing_date <= today;
  const needsDecision = !h.decision_type && h.hearing_date < today;
  const isToday = !h.decision_type && h.hearing_date === today;
  const dot = needsDecision ? "bg-amber ring-4 ring-[var(--amber-bg)]"
    : (nextUp && !h.decision_type) || isToday ?"bg-gold ring-4 ring-[var(--accent-wash)]"
    : h.decision_type ? "bg-primary"
    : "border-2 border-primary bg-card";
  return (
    <li id={`h-${h.id}`} className="flex scroll-mt-24 gap-2.5 sm:gap-3.5">
      <span className="w-[68px] shrink-0 pt-px sm:w-[84px]">
        <span className="num font-num block text-[12.5px] font-bold leading-[22px] text-primary sm:text-[13px]">{formatDmy(h.hearing_date)}</span>
        <span className="block text-[11px] text-text-4 sm:text-[11.5px]">{formatDayLabel(h.hearing_date).split(" ")[0]}</span>
      </span>
      <span className="flex w-2.5 shrink-0 flex-col items-center sm:w-3" aria-hidden>
        <span className={cx("mt-2 size-2 shrink-0 rounded-full sm:size-[9px]", dot)} />
        {!last ? <span className="mt-[5px] w-px flex-1 bg-border" /> : null}
      </span>
      <div className="min-w-0 flex-1 pb-5 sm:pb-6">
        <div className="flex min-h-[23px] flex-wrap items-center gap-1.5">
          <DecisionBadge h={h} today={today} />
          {h.review_status === "suggested" ? <StatusChip tone="accent">مقترحة · راجعها</StatusChip> : null}
          {nextUp && !h.decision_type && h.hearing_date > today ?<span className="text-[12px] font-semibold text-gold-text">الجلسة الجاية</span> : null}
        </div>
        <div className="mt-1.5 max-w-[680px] space-y-1 text-[15px] leading-[1.75]">
          {h.purpose ? <p className="text-text"><span className="text-text-3">المطلوب: </span>{h.purpose}</p> : null}
          {h.decision_text ? <p className="text-text"><span className="text-text-3">القرار: </span>{h.decision_text}</p> : null}
          {h.next_requirements ? <p className="text-text"><span className="text-text-3">المطلوب للجلسة الجاية: </span>{h.next_requirements}</p> : null}
          {!h.purpose && !h.decision_text && !h.next_requirements && !held ? <p className="text-text-3">لسه مفيش مطلوب متسجل للجلسة دي.</p> : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3">
          <span className="text-[12px] text-text-4">{sourceLine(h)}</span>
          {h.next_hearing_id ? (
            <a href={`#h-${h.next_hearing_id}`} className="inline-flex min-h-11 items-center text-[13px] font-semibold text-gold-text hover:underline sm:min-h-8">
              الجلسة التالية&nbsp;<span className="num font-num">{formatDmy(h.next_date)}</span>&nbsp;←
            </a>
          ) : null}
        </div>
        {!h.decision_type && held ? <RecordDecision hearingId={h.id} caseId={caseId} hearingDate={h.hearing_date} label={`جلسة ${formatDmy(h.hearing_date)}`} /> : null}
      </div>
    </li>
  );
}

export async function HearingsTab({ caseId }: { caseId: string }) {
  const db = await createClient();
  const today = todayIso();
  const rows = await caseHearings(db, caseId);
  // the nearest hearing today or later gets the accent dot
  const nextUp = rows.find((h) => h.hearing_date >= today)?.id;
  const waiting = rows.filter((h) => !h.decision_type && h.hearing_date < today).length;

  return (
    <div className="pb-4">
      <DecisionNotices>
        <Panel title="الجلسات"
          meta={rows.length ? <>{countLabel(rows.length)}{waiting ? <> · <span className="font-semibold text-[var(--amber-text)]">{waiting === 1 ? "واحدة محتاجة قرار" : `${waiting} محتاجة قرار`}</span></> : null}</> : null}>
          {rows.length ? (
            <ol className="px-4 pt-5 sm:px-5">
              {rows.map((h, i) => <HearingRow key={h.id} h={h} today={today} nextUp={h.id === nextUp} last={i === rows.length - 1} caseId={caseId} />)}
            </ol>
          ) : (
            <p className="px-5 py-5 text-[14px] leading-7 text-text-3">لسه مفيش جلسات متسجلة للقضية دي. أضف أول جلسة بتاريخها، أو قول لـ Clausia ميعادها.</p>
          )}
          <div className="overflow-hidden rounded-b-[22px] border-t border-border-2">
            <AddHearing caseId={caseId} />
          </div>
        </Panel>
      </DecisionNotices>
    </div>
  );
}
