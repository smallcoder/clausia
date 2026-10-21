// «بيانات الدعوى» (?tab=details): the editable case fields — facts date (picks the law version), status, circuit,
// case type — and the links to the previous / next stage. A row opens straight into its field (one input + حفظ).
import { ChevronDown, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { editCaseField } from "@/app/(app)/cases/actions";
import { InlineEdit } from "@/components/cases/InlineEdit";
import { Panel } from "@/components/shell/PageHero";
import type { CaseFile } from "@/lib/case-file";
import { formatDmy } from "@/lib/dates";
import { CASE_STATUS, STAGE } from "@/lib/labels";

function Row({ label, value, children }: { label: string; value: React.ReactNode; children: React.ReactNode }) {
  return (
    <li>
      <details className="group">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 hover:bg-card-2/60 [&::-webkit-details-marker]:hidden">
          <span className="shrink-0 text-[15px] text-text">{label}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-[14px] text-text-3">
            <span className="truncate">{value}</span>
            <ChevronDown aria-hidden size={16} strokeWidth={2} className="shrink-0 text-text-4 transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="border-t border-border-2 bg-card-2 px-5 py-4 text-[15px] text-text"><div className="max-w-[560px]">{children}</div></div>
      </details>
    </li>
  );
}

export function CaseDetails({ cf }: { cf: CaseFile }) {
  const c = cf.case;
  const hidden = { case_id: c.id };
  const fd = c.facts_date && c.facts_date_precision !== "unknown" ? formatDmy(c.facts_date, c.facts_date_precision) : "";
  const status = CASE_STATUS[c.status as keyof typeof CASE_STATUS] ?? c.status;
  return (
    <div className="pb-4">
    <p className="mb-3 px-2 text-[13px] text-text-3">اضغط على أي سطر لتعديله.</p>
    <Panel className="overflow-hidden">
      <ul className="divide-y divide-border-2">
        <Row label="تاريخ الوقائع" value={fd ? <span className="num font-num">{fd}</span> : "غير محدد"}>
          <InlineEdit action={editCaseField} hidden={{ ...hidden, field: "facts_date" }} initial={fd} label="تغيير" startOpen
            placeholder="مثال: 15/3/2023 أو 3/2023 أو 2023" hint="يوم/شهر/سنة، أو شهر/سنة، أو السنة بس. بالتاريخ ده بيتحدد إصدار القانون اللي ينطبق."
            display={fd || "غير محدد"} />
        </Row>
        <Row label="الحالة" value={status}>
          <InlineEdit action={editCaseField} hidden={{ ...hidden, field: "status" }} initial={c.status} label="تغيير" startOpen
            options={Object.entries(CASE_STATUS).map(([value, label]) => ({ value, label }))} display={status} />
        </Row>
        <Row label="الدائرة" value={c.circuit ?? "غير محددة"}>
          <InlineEdit action={editCaseField} hidden={{ ...hidden, field: "circuit" }} initial={c.circuit ?? ""} label="تغيير" startOpen
            placeholder="مثال: الدائرة 12 مدني" display={c.circuit ?? "غير محددة"} />
        </Row>
        <Row label="نوع الدعوى" value={c.case_type ?? "غير محدد"}>
          <InlineEdit action={editCaseField} hidden={{ ...hidden, field: "case_type" }} initial={c.case_type ?? ""} label="تغيير" startOpen
            placeholder="مدني / عمال / إيجارات / أسرة / تجاري / جنح / إداري" display={c.case_type ?? "غير محدد"} />
        </Row>
        <li className="flex min-h-12 items-center justify-between gap-3 px-5 py-3">
          <span className="text-[15px] text-text">المحكمة</span>
          <span className="truncate text-[14px] text-text-3">{c.court ?? "غير محددة"}</span>
        </li>
        {c.previous_stage_case ? (
          <li><Link href={`/cases/${c.previous_stage_case.id}`} className="flex min-h-12 items-center justify-between gap-3 px-5 py-3 hover:bg-card-2/60">
            <span className="text-[15px] text-text">الدرجة السابقة · {STAGE[c.previous_stage_case.stage as keyof typeof STAGE]}</span>
            <span className="flex min-w-0 items-center gap-1 text-[14px] text-text-2"><span className="truncate">{c.previous_stage_case.label}</span><ChevronLeft aria-hidden size={16} strokeWidth={2} className="shrink-0" /></span></Link></li>
        ) : null}
        {c.later_stage_cases.map((l) => (
          <li key={l.id}><Link href={`/cases/${l.id}`} className="flex min-h-12 items-center justify-between gap-3 px-5 py-3 hover:bg-card-2/60">
            <span className="text-[15px] text-text">الدرجة التالية · {STAGE[l.stage as keyof typeof STAGE]}</span>
            <span className="flex min-w-0 items-center gap-1 text-[14px] text-text-2"><span className="truncate">{l.label}</span><ChevronLeft aria-hidden size={16} strokeWidth={2} className="shrink-0" /></span></Link></li>
        ))}
      </ul>
    </Panel>
    </div>
  );
}
