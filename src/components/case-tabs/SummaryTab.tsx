// OWNER: case-pages agent. Key fields with small inline edits, stage links, counts, the «تحليل Clausia» slot.
import Link from "next/link";
import { editCaseField } from "@/app/(app)/cases/actions";
import { InlineEdit } from "@/components/cases/InlineEdit";
import { Badge, Button, Card, DateText, SectionTitle } from "@/components/ui";
import { caseCounts, getCaseHeader, stageLinks } from "@/lib/cases";
import { formatDmy } from "@/lib/dates";
import { CASE_STATUS, STAGE, caseLabel } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

const PRECISION_NOTE = { day: "", month: "(بالشهر)", year: "(بالسنة)", unknown: "" } as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line py-3 first:border-t-0 sm:grid sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-[15px] text-ink sm:mt-0">{children}</dd>
    </div>
  );
}

export async function SummaryTab({ caseId }: { caseId: string }) {
  const db = await createClient();
  const c = await getCaseHeader(db, caseId);
  if (!c) return null;
  const [links, counts] = await Promise.all([stageLinks(db, caseId, c.previous_stage_case_id), caseCounts(db, caseId)]);
  const hidden = { case_id: caseId };
  const factsIso = c.facts_date;
  const factsInitial = factsIso ? formatDmy(factsIso, c.facts_date_precision === "unknown" ? "day" : c.facts_date_precision) : "";

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-5">
        {c.summary ? (
          <Card className="p-4">
            <SectionTitle>نبذة</SectionTitle>
            <p className="text-[15px] leading-relaxed text-ink">{c.summary}</p>
          </Card>
        ) : null}

        <Card className="px-4 py-1">
          <dl>
            <Field label="تاريخ الوقائع">
              <InlineEdit action={editCaseField} hidden={{ ...hidden, field: "facts_date" }} initial={factsInitial}
                placeholder="مثال: 15/3/2023 أو 3/2023 أو 2023"
                hint="يوم/شهر/سنة، أو شهر/سنة، أو السنة فقط. بهذا التاريخ يُختار إصدار القانون المنطبق."
                display={factsIso && c.facts_date_precision !== "unknown"
                  ? <><DateText iso={factsIso} precision={c.facts_date_precision} /> <span className="text-sm text-ink-3">{PRECISION_NOTE[c.facts_date_precision]}</span></>
                  : <span className="text-ink-3">غير محدد</span>} />
            </Field>
            <Field label="الحالة">
              <InlineEdit action={editCaseField} hidden={{ ...hidden, field: "status" }} initial={c.status}
                options={Object.entries(CASE_STATUS).map(([value, label]) => ({ value, label }))}
                display={CASE_STATUS[c.status]} />
            </Field>
            <Field label="الدائرة">
              <InlineEdit action={editCaseField} hidden={{ ...hidden, field: "circuit" }} initial={c.circuit ?? ""}
                placeholder="مثال: الدائرة 12 مدني" display={c.circuit ?? <span className="text-ink-3">غير محددة</span>} />
            </Field>
            <Field label="نوع الدعوى">
              <InlineEdit action={editCaseField} hidden={{ ...hidden, field: "case_type" }} initial={c.case_type ?? ""}
                placeholder="مدني / عمال / إيجارات / أسرة / تجاري / جنح / إداري" display={c.case_type ?? <span className="text-ink-3">غير محدد</span>} />
            </Field>
            <Field label="المحكمة">{c.court ?? <span className="text-ink-3">غير محددة</span>}</Field>
            <Field label="الدرجة">{STAGE[c.stage]}</Field>
          </dl>
        </Card>

        {links.previous || links.later.length ? (
          <Card className="p-4">
            <SectionTitle>درجات التقاضي</SectionTitle>
            <ul className="space-y-2 text-[15px]">
              {links.previous ? (
                <li className="flex flex-wrap items-center gap-2">
                  <Badge>الدرجة السابقة · {STAGE[links.previous.stage]}</Badge>
                  <Link href={`/cases/${links.previous.id}`} className="text-accent hover:underline">{caseLabel(links.previous)}</Link>
                </li>
              ) : null}
              {links.later.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">الدرجة التالية · {STAGE[l.stage]}</Badge>
                  <Link href={`/cases/${l.id}`} className="text-accent hover:underline">{caseLabel(l)}</Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <section className="rounded-[var(--radius)] border border-brass/30 bg-brass-soft p-5">
          <h2 className="font-semibold text-brass">تحليل Clausia</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">سيكتب Clausia هنا رأيًا قانونيًا أو مذكرة من ملف القضية.</p>
          <Button variant="secondary" size="sm" className="mt-4" disabled>اكتب رأيًا قانونيًا (قريبًا)</Button>
        </section>
      </div>

      <aside className="space-y-5">
        <Card className="p-4">
          <SectionTitle>محتوى الملف</SectionTitle>
          <ul className="grid grid-cols-2 gap-3 text-sm">
            {([
              ["facts", "الوقائع", counts.facts], ["parties", "الأطراف", counts.parties],
              ["hearings", "الجلسات", counts.hearings], ["documents", "المستندات", counts.documents],
              ["requests", "الطلبات والدفوع", counts.requests + counts.arguments], ["judgments", "الأحكام", counts.judgments],
            ] as const).map(([tab, label, n]) => (
              <li key={tab}>
                <Link href={`/cases/${caseId}?tab=${tab}`} className="block rounded-lg border border-line bg-surface-2 px-3 py-2 hover:border-line-strong">
                  <span className="num block text-lg font-semibold text-ink">{n}</span>
                  <span className="text-ink-3">{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <a href={`/api/cases/${caseId}/case-file?download`} className="block text-sm font-medium text-accent hover:underline">
          تنزيل ملف القضية (JSON)
        </a>
      </aside>
    </div>
  );
}
