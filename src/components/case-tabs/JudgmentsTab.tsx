// «الأحكام» inside the hearings view (?tab=hearings), under the hearings panel (owner decision 2026-10-21: judgments
// leave the case page). Same panel as the hearings; each judgment: date, kind, outcome, the operative text (Naskh),
// the appeal deadline only as the lawyer stated it, its source; a suggested one gets confirm / reject.
// Nothing renders when the case has no judgment.
import { Suggested } from "@/components/cases/CaseOverview";
import { SheetReview } from "@/components/cases/ItemSheet";
import { SourceChip } from "@/components/cite/SourceChip";
import { aboutItem, citeOf, sourceText } from "@/components/cases/case-view";
import { Panel, StatusChip } from "@/components/shell/PageHero";
import type { CaseFile } from "@/lib/case-file";
import { formatDmy } from "@/lib/dates";
import { JUDGMENT_KIND } from "@/lib/labels";

type Judgment = CaseFile["judgments"][number];

const OUTCOME: Record<string, { label: string; tone: "good" | "bad" | "neutral" }> = {
  for_us: { label: "لصالحنا", tone: "good" }, against_us: { label: "ضدنا", tone: "bad" }, partial: { label: "لصالحنا جزئيًا", tone: "neutral" },
};

export function JudgmentsTab({ cf, caseId }: { cf: CaseFile; caseId: string }) {
  const pending = cf.pending_suggestions.filter((p) => p.table === "judgments").map((p) => p.item as Judgment);
  const rows = [...cf.judgments, ...pending].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  if (!rows.length) return null;
  return (
    <Panel title="الأحكام" className="mb-4">
      <ul className="divide-y divide-border-2">
        {rows.map((j) => {
          const outcome = j.outcome ? OUTCOME[j.outcome] : null;
          const suggested = j.review_status === "suggested";
          return (
            <li key={j.id} id={`item-${j.id}`} className="scroll-mt-24 space-y-3 px-4 py-4 sm:px-6">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-md font-bold text-text">{j.date ? <>حكم <span className="num font-num">{formatDmy(j.date)}</span></> : "حكم (التاريخ مش متسجل)"}</span>
                <StatusChip tone="neutral">{JUDGMENT_KIND[j.kind as keyof typeof JUDGMENT_KIND] ?? j.kind}</StatusChip>
                {outcome ? <StatusChip tone={outcome.tone}>{outcome.label}</StatusChip> : null}
                {suggested ? <Suggested /> : null}
              </div>
              <div className="rounded-md bg-card-2 px-4 py-3">
                <p className="text-sm leading-4 text-text-4">المنطوق</p>
                <p className="text-doc mt-1 text-md text-text">{j.operative_text}</p>
              </div>
              <p className="text-base text-text-2">
                {j.appeal_deadline ? <>آخر ميعاد للطعن: <span className="num font-num font-bold">{formatDmy(j.appeal_deadline)}</span> <span className="text-text-4">· كما ذكره المحامي</span>{j.appeal_deadline_note ? <span className="mt-1 block text-text-4">{j.appeal_deadline_note}</span> : null}</>
                  : <span className="text-text-4">ميعاد الطعن مش متسجل. Clausia مش بيحسبه؛ قوله لـ Clausia لو عايز تسجله.</span>}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {(() => {
                  const cite = citeOf(`item:${j.id}`, j.source, cf.documents, aboutItem("حكم", j.operative_text));
                  return cite ? <SourceChip cite={cite} /> : <span className="text-xs text-text-4">{sourceText(j.source, cf.documents)}</span>;
                })()}
                {suggested ? <div className="w-full sm:w-64"><SheetReview table="judgments" id={j.id} caseId={caseId} /></div> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
