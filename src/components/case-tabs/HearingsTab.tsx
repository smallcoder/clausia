// «الجلسات» (?tab=hearings, the dossier's first tab; docs/design/ia/IACase*, MCase*): a table of the case's hearings — date, decision,
// and the minutes. The next hearing comes first with «الجاية», then the held ones, newest first. A held hearing with no decision says
// «القرار متسجلش · سجّله» in gold; «سجّله» opens the decision recorder in place (RecordDecision → recordDecisionAction → applyOp), so
// nothing is saved without the tap. This tab is the home of hearings and decisions: «أضف جلسة» is its last row.
import { SourceChip } from "@/components/cite/SourceChip";
import type { CiteSource } from "@/components/cite/context";
import { Change, SuggestedTag, WaitingLine } from "@/components/cases/Suggest";
import { decisionLine } from "@/components/cases/case-view";
import { AddHearing } from "@/components/hearings/AddHearing";
import { DecisionNotices } from "@/components/hearings/DecisionNotices";
import { RecordDecision } from "@/components/hearings/RecordDecision";
import { DateText, cx } from "@/components/ui";
import { formatDmy } from "@/lib/dates";
import type { PendingEdits } from "@/lib/edits";
import { DOC_TYPE } from "@/lib/labels";
import { caseHearings } from "@/lib/hearings";
import { createClient } from "@/lib/supabase/server";

type Row = Awaited<ReturnType<typeof caseHearings>>[number];

/** The paper the decision was recorded from (the minutes): a chip that opens it at the sentence. Null when the decision has no paper. */
function minutesChip(h: Row, names: Map<string, string>): CiteSource | null {
  if (!h.decision_type || h.decision_source_kind !== "document" || !h.decision_source_document_id) return null;
  const page = h.decision_source_page;
  return {
    id: `hearing-decision:${h.id}`, documentId: h.decision_source_document_id, page: page ?? 1, start: h.decision_source_char_start, end: h.decision_source_char_end,
    quote: h.decision_source_quote, about: `قرار · ${formatDmy(h.hearing_date)}${h.decision_text ? ` · ${h.decision_text}` : ""}`,
    label: `${names.get(h.decision_source_document_id) ?? "المحضر"}${page ? ` · ص ${page}` : ""}`,
  };
}

/** «الجاية»: the ink pill (champagne frame in dark) */
const NextPill = () => <span className="pill-on inline-flex h-6 items-center rounded-md px-2.5 text-xs font-bold">الجاية</span>;

function HearingRow({ h, today, next, needed, caseId, names }: { h: Row; today: string; next: boolean; needed: string | null; caseId: string; names: Map<string, string> }) {
  const held = h.hearing_date <= today;
  const minutes = minutesChip(h, names);
  const suggested = h.review_status === "suggested";
  return (
    <li id={`h-${h.id}`} className="flex scroll-mt-24 flex-wrap items-start gap-x-4 gap-y-1 border-t border-border-2 px-4 py-3.5 sm:items-center sm:px-6 sm:py-4">
      <DateText iso={h.hearing_date} className={cx("w-21 shrink-0 text-base sm:w-30 sm:text-md", next ? "font-bold text-title" : "font-medium text-text")} />
      <div className="min-w-0 flex-1 basis-40 text-base sm:text-md">
        {h.decision_type ? (
          <span className="text-text">{decisionLine(h.decision_type, h.decision_text)}</span>
        ) : held ? (
          <RecordDecision hearingId={h.id} caseId={caseId} hearingDate={h.hearing_date} label={`جلسة ${formatDmy(h.hearing_date)}`} trigger="القرار متسجلش · سجّله" />
        ) : (
          <>
            {next ? <NextPill /> : null}
            {needed ? <span className={next ? "ms-2 text-text" : "text-text"}>{needed}</span> : next ? null : <span className="text-text-3">لسه مفيش مطلوب متسجل للجلسة دي</span>}
          </>
        )}
        {suggested ? <span className="ms-2 inline-flex align-middle"><SuggestedTag>مقترحة · راجعها</SuggestedTag></span> : null}
      </div>
      {minutes ? <SourceChip cite={minutes} /> : null}
    </li>
  );
}

/** the decisions and hearings the chat proposed (nothing is saved until the lawyer confirms): a gold wash, «old ← new» */
function Proposed({ edits }: { edits: PendingEdits }) {
  const added = edits.timeline.filter((r) => r.on === "hearings" && r.kind !== "decision");
  const decisions = edits.decisions.flatMap((d) => d.rows);
  if (!decisions.length && !added.length) return null;
  return (
    <div className="gold-wash space-y-2.5 rounded-xl px-5 py-4" data-pending-row>
      {decisions.map((r) => (
        <div key={r.key + r.label}>
          <div className="flex items-center gap-1.5 text-xs text-gold-text-small">{r.label}<SuggestedTag /></div>
          <div className="mt-0.75 text-md font-semibold leading-[1.5]"><Change old={r.old} next={r.new} /></div>
        </div>
      ))}
      {added.map((r) => (
        <div key={r.key}>
          <div className="flex items-center gap-1.5 text-xs text-gold-text-small">جلسة جديدة<SuggestedTag /></div>
          <div className="mt-0.75 text-md font-semibold leading-[1.5]">{r.text}</div>
          <WaitingLine />
        </div>
      ))}
    </div>
  );
}

export async function HearingsTab({ caseId, today, edits }: { caseId: string; today: string; edits?: PendingEdits }) {
  const db = await createClient();
  const rows = await caseHearings(db, caseId);
  const { data: docs } = await db.from("documents").select("id, file_name, title, doc_type").eq("case_id", caseId);
  const names = new Map((docs ?? []).map((d) => [d.id, d.title || DOC_TYPE[d.doc_type] || d.file_name]));
  // the next hearing first (the nearest one today or later), the others after it, then the held ones, newest first
  const upcoming = rows.filter((h) => h.hearing_date >= today);
  const held = rows.filter((h) => h.hearing_date < today).reverse();
  const ordered = [...upcoming, ...held];
  const nextId = upcoming.find((h) => !h.decision_type)?.id;
  /** what is asked for a hearing: the previous decision's requirements, else its own purpose */
  const needed = (h: Row) => rows.find((p) => p.next_hearing_id === h.id)?.next_requirements || h.purpose || null;

  return (
    <div className="space-y-4 pb-4">
      {edits ? <Proposed edits={edits} /> : null}
      <DecisionNotices>
        <section className="overflow-hidden rounded-xl border border-border-2 bg-card shadow-card" aria-label="الجلسات">
          <div className="hidden gap-x-4 px-6 py-3 text-sm font-semibold text-text-3 sm:flex">
            <span className="w-30 shrink-0">التاريخ</span><span className="flex-1">القرار</span><span className="sr-only">المحضر</span>
          </div>
          {ordered.length ? (
            <ol>{ordered.map((h) => <HearingRow key={h.id} h={h} today={today} next={h.id === nextId} needed={needed(h)} caseId={caseId} names={names} />)}</ol>
          ) : (
            <p className="border-t border-border-2 px-6 py-5 text-base leading-7 text-text-3">لسه مفيش جلسات متسجلة للقضية دي. أضف أول جلسة بتاريخها، أو قول لـ Clausia ميعادها.</p>
          )}
          <div className="border-t border-border-2"><AddHearing caseId={caseId} /></div>
        </section>
      </DecisionNotices>
    </div>
  );
}
