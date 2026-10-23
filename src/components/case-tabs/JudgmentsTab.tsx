// «الأحكام» in the «المذكرات والأحكام» tab (?tab=memos); they were under the hearings before.
// Each judgment: date, kind, outcome, the operative text (Naskh),
// the appeal deadline only as the lawyer stated it, its source; a suggested one gets confirm / reject.
// Nothing renders when the case has no judgment.
import { Suggested } from "@/components/cases/CaseItems";
import { SheetReview } from "@/components/cases/ItemSheet";
import { SourceChip } from "@/components/cite/SourceChip";
import { aboutItem, citeOf, sourceText } from "@/components/cases/case-view";
import { Panel, StatusChip } from "@/components/shell/PageHero";
import type { CaseFile } from "@/lib/case-file";
import { JUDGMENT_KIND } from "@/lib/labels";
import { DateText } from "@/components/ui";

type Judgment = CaseFile["judgments"][number];

const OUTCOME: Record<string, { label: string; tone: "good" | "bad" | "neutral" }> = {
  for_us: { label: "لصالحنا", tone: "good" }, against_us: { label: "ضدنا", tone: "bad" }, partial: { label: "لصالحنا جزئيًا", tone: "neutral" },
};

export function JudgmentsTab({ cf, caseId }: { cf: CaseFile; caseId: string }) {
  const pending = cf.pending_suggestions.filter((p) => p.table === "judgments").map((p) => p.item as Judgment);
  const rows = [...cf.judgments, ...pending].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  if (!rows.length) return null;
  return (
    <Panel title="الأحكام">
      <ul className="divide-y divide-border-2">
        {rows.map((j) => {
          const outcome = j.outcome ? OUTCOME[j.outcome] : null;
          const suggested = j.review_status === "suggested";
          return (
            <li key={j.id} id={`item-${j.id}`} className="scroll-mt-24 space-y-3 px-4 py-4 sm:px-6">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-md font-bold text-text">{j.date ? <>حكم <DateText iso={j.date} /></> : "حكم (التاريخ مش متسجل)"}</span>
                <StatusChip tone="neutral">{JUDGMENT_KIND[j.kind as keyof typeof JUDGMENT_KIND] ?? j.kind}</StatusChip>
                {outcome ? <StatusChip tone={outcome.tone}>{outcome.label}</StatusChip> : null}
                {suggested ? <Suggested /> : null}
              </div>
              <div className="rounded-md bg-card-2 px-4 py-3">
                <p className="text-sm leading-4 text-text-4">المنطوق</p>
                <p className="text-doc mt-1 text-md text-text">{j.operative_text}</p>
              </div>
              <p className="text-base text-text-2">
                {j.appeal_deadline ? <>آخر ميعاد للطعن: <DateText iso={j.appeal_deadline} className="font-bold" /> <span className="text-text-4">· كما ذكره المحامي</span>{j.appeal_deadline_note ? <span className="mt-1 block text-text-4">{j.appeal_deadline_note}</span> : null}</>
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
