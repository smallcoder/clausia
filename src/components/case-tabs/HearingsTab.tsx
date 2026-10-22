// «الجلسات» (?tab=hearings): the case's hearings as a vertical timeline, like the facts timeline on the case page.
// Each hearing: date · dot · its state chip (DecisionBadge), what was needed, the decision, the link to the next one.
// A held hearing (today or before) without a decision gets «سجّل القرار» inline. «أضف جلسة» is the panel's last row.
import { AddHearing } from "@/components/hearings/AddHearing";
import { DecisionNotices } from "@/components/hearings/DecisionNotices";
import { DecisionBadge } from "@/components/hearings/HearingItem";
import { RecordDecision } from "@/components/hearings/RecordDecision";
import { SourceChip } from "@/components/cite/SourceChip";
import { Panel, StatusChip } from "@/components/shell/PageHero";
import { cx } from "@/components/ui";
import { formatDayLabel, formatDmy, todayIso } from "@/lib/dates";
import { DOC_TYPE } from "@/lib/labels";
import { caseHearings } from "@/lib/hearings";
import type { CiteSource } from "@/components/cite/context";
import { createClient } from "@/lib/supabase/server";

type Row = Awaited<ReturnType<typeof caseHearings>>[number];

const countLabel = (n: number) => (n === 1 ? "جلسة واحدة" : n === 2 ? "جلستين" : n <= 10 ? `${n} جلسات` : `${n} جلسة`);

function sourceLine(h: Row): string {
  if (h.source_kind === "document") return `من مستند${h.source_page ? ` ص ${h.source_page}` : ""}`;
  if (h.source_kind === "chat") return h.created_by_kind === "model" ? "من رسالتك · صاغها Clausia" : "من رسالتك";
  return "سجّلها المحامي";
}

type DocNames = Map<string, string>;

/** «الصحيفة · ص 2» as a chip that opens the paper at the sentence; null when the source is not a paper */
function paperChip(id: string, names: DocNames, src: { document_id: string | null; page: number | null; quote: string | null; start: number | null; end: number | null }, about: string): CiteSource | null {
  if (!src.document_id) return null;
  return { id, documentId: src.document_id, page: src.page ?? 1, start: src.start, end: src.end, quote: src.quote, about, label: `${names.get(src.document_id) ?? "مستند"}${src.page ? ` · ص ${src.page}` : ""}` };
}

function HearingRow({ h, today, nextUp, last, caseId, names }: { h: Row; today: string; nextUp: boolean; last: boolean; caseId: string; names: DocNames }) {
  const label = formatDmy(h.hearing_date);
  const own = h.source_kind === "document"
    ? paperChip(`hearing:${h.id}`, names, { document_id: h.source_document_id, page: h.source_page, quote: h.source_quote, start: h.source_char_start, end: h.source_char_end }, `جلسة · ${label}${h.purpose ? ` · ${h.purpose}` : ""}`) : null;
  // the decision's own paper, when it is not the one the hearing came from
  const decided = h.decision_type && h.decision_source_kind === "document"
    ? paperChip(`hearing-decision:${h.id}`, names, { document_id: h.decision_source_document_id, page: h.decision_source_page, quote: h.decision_source_quote, start: h.decision_source_char_start, end: h.decision_source_char_end }, `قرار · ${label}${h.decision_text ? ` · ${h.decision_text}` : ""}`) : null;
  const held = h.hearing_date <= today;
  const needsDecision = !h.decision_type && h.hearing_date < today;
  const isToday = !h.decision_type && h.hearing_date === today;
  // v2: gold only where a decision is due; decided = muted dot; upcoming = muted ring (the next one darker)
  const dot = needsDecision || isToday ? "bg-gold"
    : h.decision_type ? "bg-text-3"
    : nextUp ? "border-[1.5px] border-text-2 bg-card"
    : "border border-text-4 bg-card";
  return (
    <li id={`h-${h.id}`} className="flex scroll-mt-24 gap-2.5 sm:gap-3.5">
      <span className="w-17 shrink-0 pt-px sm:w-21">
        <span className="num font-num block text-sm font-semibold leading-[22px] text-title">{formatDmy(h.hearing_date)}</span>
        <span className="block text-xs text-text-4">{formatDayLabel(h.hearing_date).split(" ")[0]}</span>
      </span>
      <span className="flex w-2.5 shrink-0 flex-col items-center sm:w-3" aria-hidden>
        <span className={cx("mt-2 size-dot-lg shrink-0 rounded-full", dot)} />
        {!last ? <span className="mt-1 w-px flex-1 bg-border-2" /> : null}
      </span>
      <div className="min-w-0 flex-1 pb-5 sm:pb-6">
        <div className="flex min-h-5.75 flex-wrap items-center gap-1.5">
          <DecisionBadge h={h} today={today} />
          {h.review_status === "suggested" ? <StatusChip tone="warn">مقترحة · راجعها</StatusChip> : null}
          {nextUp && !h.decision_type && h.hearing_date > today ?<span className="text-sm font-semibold text-text-3">الجلسة الجاية</span> : null}
        </div>
        <div className="mt-1.5 max-w-170 space-y-1 text-md leading-[1.75]">
          {h.purpose ? <p className="text-text"><span className="text-text-3">المطلوب: </span>{h.purpose}</p> : null}
          {h.decision_text ? <p className="text-text"><span className="text-text-3">القرار: </span>{h.decision_text}</p> : null}
          {h.next_requirements ? <p className="text-text"><span className="text-text-3">المطلوب للجلسة الجاية: </span>{h.next_requirements}</p> : null}
          {!h.purpose && !h.decision_text && !h.next_requirements && !held ? <p className="text-text-3">لسه مفيش مطلوب متسجل للجلسة دي.</p> : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3">
          {own ? <SourceChip cite={own} /> : <span className="text-sm text-text-4">{sourceLine(h)}</span>}
          {decided && decided.id !== own?.id ? <><span className="text-sm text-text-4">القرار:</span><SourceChip cite={decided} /></> : null}
          {h.next_hearing_id ? (
            <a href={`#h-${h.next_hearing_id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-text-2 hover:text-text hover:underline sm:min-h-8">
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
  const { data: docs } = await db.from("documents").select("id, file_name, title, doc_type").eq("case_id", caseId);
  const names: DocNames = new Map((docs ?? []).map((d) => [d.id, d.title || DOC_TYPE[d.doc_type] || d.file_name]));
  // the nearest hearing today or later gets the darker ring
  const nextUp = rows.find((h) => h.hearing_date >= today)?.id;
  const waiting = rows.filter((h) => !h.decision_type && h.hearing_date < today).length;

  return (
    <div className="pb-4">
      <DecisionNotices>
        <Panel title={rows.length ? countLabel(rows.length) : "لسه مفيش جلسات"}
          meta={waiting ? <span className="font-semibold text-gold">{waiting === 1 ? "واحدة محتاجة قرار" : `${waiting} محتاجة قرار`}</span> : null}>
          {rows.length ? (
            <ol className="px-4 pt-5 sm:px-5">
              {rows.map((h, i) => <HearingRow key={h.id} h={h} today={today} nextUp={h.id === nextUp} last={i === rows.length - 1} caseId={caseId} names={names} />)}
            </ol>
          ) : (
            <p className="px-5 py-5 text-base leading-7 text-text-3">لسه مفيش جلسات متسجلة للقضية دي. أضف أول جلسة بتاريخها، أو قول لـ Clausia ميعادها.</p>
          )}
          <div className="overflow-hidden rounded-b-lg border-t border-border-2">
            <AddHearing caseId={caseId} />
          </div>
        </Panel>
      </DecisionNotices>
    </div>
  );
}
