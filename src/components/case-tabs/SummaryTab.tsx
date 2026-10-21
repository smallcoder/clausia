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
    <div className="border-t border-border-2 py-3 first:border-t-0 sm:grid sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-base leading-[1.55] text-text-4">{label}</dt>
      <dd className="mt-0.5 text-md text-text sm:mt-0">{children}</dd>
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
            <p className="text-md leading-relaxed text-text">{c.summary}</p>
          </Card>
        ) : null}

        <Card className="px-4 py-1">
          <dl>
            <Field label="تاريخ الوقائع">
              <InlineEdit action={editCaseField} hidden={{ ...hidden, field: "facts_date" }} initial={factsInitial}
                placeholder="مثال: 15/3/2023 أو 3/2023 أو 2023"
                hint="يوم/شهر/سنة، أو شهر/سنة، أو السنة فقط. بهذا التاريخ يُختار إصدار القانون المنطبق."
                display={factsIso && c.facts_date_precision !== "unknown"
                  ? <><DateText iso={factsIso} precision={c.facts_date_precision} /> <span className="text-base leading-[1.55] text-text-4">{PRECISION_NOTE[c.facts_date_precision]}</span></>
                  : <span className="text-text-4">غير محدد</span>} />
            </Field>
            <Field label="الحالة">
              <InlineEdit action={editCaseField} hidden={{ ...hidden, field: "status" }} initial={c.status}
                options={Object.entries(CASE_STATUS).map(([value, label]) => ({ value, label }))}
                display={CASE_STATUS[c.status]} />
            </Field>
            <Field label="الدائرة">
              <InlineEdit action={editCaseField} hidden={{ ...hidden, field: "circuit" }} initial={c.circuit ?? ""}
                placeholder="مثال: الدائرة 12 مدني" display={c.circuit ?? <span className="text-text-4">غير محددة</span>} />
            </Field>
            <Field label="نوع الدعوى">
              <InlineEdit action={editCaseField} hidden={{ ...hidden, field: "case_type" }} initial={c.case_type ?? ""}
                placeholder="مدني / عمال / إيجارات / أسرة / تجاري / جنح / إداري" display={c.case_type ?? <span className="text-text-4">غير محدد</span>} />
            </Field>
            <Field label="المحكمة">{c.court ?? <span className="text-text-4">غير محددة</span>}</Field>
            <Field label="الدرجة">{STAGE[c.stage]}</Field>
          </dl>
        </Card>

        {links.previous || links.later.length ? (
          <Card className="p-4">
            <SectionTitle>درجات التقاضي</SectionTitle>
            <ul className="space-y-2 text-md">
              {links.previous ? (
                <li className="flex flex-wrap items-center gap-2">
                  <Badge>الدرجة السابقة · {STAGE[links.previous.stage]}</Badge>
                  <Link href={`/cases/${links.previous.id}`} className="text-primary hover:underline">{caseLabel(links.previous)}</Link>
                </li>
              ) : null}
              {links.later.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">الدرجة التالية · {STAGE[l.stage]}</Badge>
                  <Link href={`/cases/${l.id}`} className="text-primary hover:underline">{caseLabel(l)}</Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <section className="rounded-lg bg-gold-bg p-5">
          <h2 className="font-semibold text-gold">تحليل Clausia</h2>
          <p className="mt-2 text-md leading-relaxed text-text-3">سيكتب Clausia هنا رأيًا قانونيًا أو مذكرة من ملف القضية.</p>
          <Button variant="secondary" size="sm" className="mt-4" disabled>اكتب رأيًا قانونيًا (قريبًا)</Button>
        </section>
      </div>

      <aside className="space-y-5">
        <Card className="p-4">
          <SectionTitle>محتوى الملف</SectionTitle>
          <ul className="grid grid-cols-2 gap-3 text-base leading-[1.55]">
            {([
              ["facts", "الوقائع", counts.facts], ["parties", "الأطراف", counts.parties],
              ["hearings", "الجلسات", counts.hearings], ["documents", "المستندات", counts.documents],
              ["requests", "الطلبات والدفوع", counts.requests + counts.arguments], ["judgments", "الأحكام", counts.judgments],
            ] as const).map(([tab, label, n]) => (
              <li key={tab}>
                <Link href={`/cases/${caseId}?tab=${tab}`} className="block rounded-md bg-card-2 px-3 py-2 hover:border-border-strong">
                  <span className="num block text-lg leading-7 font-semibold text-text">{n}</span>
                  <span className="text-text-4">{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <a href={`/api/cases/${caseId}/case-file?download`} className="block text-base leading-[1.55] font-medium text-primary hover:underline">
          تنزيل ملف القضية (JSON)
        </a>
      </aside>
    </div>
  );
}
