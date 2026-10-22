/** One hearing row in a roll / home list: case → case page, client and role, purpose, decision status. */
import Link from "next/link";
import { StatusChip } from "@/components/shell/PageHero";
import type { HearingWithCase } from "@/lib/hearings";
import { formatDmy } from "@/lib/dates";
import { CASE_STATUS, DECISION, PARTY_ROLE, caseLabel } from "@/lib/labels";
import { RecordDecision } from "./RecordDecision";

/**
 * The one status chip for a hearing, everywhere: before today and undecided → gold «محتاجة قرار»;
 * today → «النهارده» (a decision can be recorded all day); later → «قادمة»; decided → the decision (+ next date).
 */
export function DecisionBadge({ h, today }: { h: { decision_type: HearingWithCase["decision_type"]; next_date: string | null; hearing_date: string }; today: string }) {
  if (!h.decision_type) {
    if (h.hearing_date < today) return <StatusChip tone="warn">محتاجة قرار</StatusChip>;
    return h.hearing_date === today ? <StatusChip tone="accent">النهارده</StatusChip> : <StatusChip tone="good">قادمة</StatusChip>;
  }
  return (
    <StatusChip tone="neutral">
      {DECISION[h.decision_type]}
      {h.next_date ? <>&nbsp;←&nbsp;<span className="num font-num">{formatDmy(h.next_date)}</span></> : null}
    </StatusChip>
  );
}

export function HearingItem({ h, today, showCourt = false, showCircuit = true, showDate = false, decide = false }: { h: HearingWithCase; today: string; showCourt?: boolean; showCircuit?: boolean; showDate?: boolean; decide?: boolean }) {
  const c = h.case;
  const needed = h.purpose;
  return (
    <li className="px-5 py-3.5 print:break-inside-avoid print:px-0 print:py-2">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <Link href={`/cases/${c.id}?tab=hearings&hearing=${h.id}`} className="text-md font-bold text-text hover:underline">
            {caseLabel(c)}
          </Link>
          {c.title && (c.case_number || c.case_year) ? <p className="mt-0.5 text-sm text-text-3">{c.title}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {c.status === "reserved_for_judgment" && !h.decision_type ? <StatusChip tone="neutral">{CASE_STATUS[c.status]}</StatusChip> : null}
          {h.review_status === "suggested" ? <StatusChip tone="warn">مقترحة</StatusChip> : null}
          <DecisionBadge h={h} today={today} />
        </div>
      </div>
      <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-text-3">
        {showDate ? <div><dt className="sr-only">التاريخ</dt><dd className="num font-num font-semibold text-text">{formatDmy(h.hearing_date)}</dd></div> : null}
        {showCourt ? <div><dt className="sr-only">المحكمة</dt><dd>{c.court ?? "محكمة غير محددة"}</dd></div> : null}
        {showCircuit && c.circuit ? <div><dt className="sr-only">الدائرة</dt><dd>{c.circuit}</dd></div> : null}
        <div>
          <dt className="inline text-text-4">الموكل: </dt>
          <dd className="inline">{c.client_name ?? "غير محدد"}{c.client_role ? <span className="text-text-4"> ({PARTY_ROLE[c.client_role]})</span> : null}</dd>
        </div>
      </dl>
      {needed ? <p className="mt-1 text-base text-text-2"><span className="text-text-4">المطلوب: </span>{needed}</p> : null}
      {h.decision_text ? <p className="mt-1 text-base text-text-2"><span className="text-text-4">القرار: </span>{h.decision_text}</p> : null}
      {decide && !h.decision_type ? <div className="print:hidden"><RecordDecision hearingId={h.id} caseId={c.id} hearingDate={h.hearing_date} label={`${caseLabel(c)}، جلسة ${formatDmy(h.hearing_date)}`} compact /></div> : null}
    </li>
  );
}
