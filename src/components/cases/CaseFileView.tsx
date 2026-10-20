// OWNER: case-pages agent. «الملف»: one scroll — facts, parties, requests/arguments, judgments, then the Clausia slot.
// Rows are <details>: the summary is the row, the content holds the existing edit / confirm-reject controls.
import Link from "next/link";
import { editCaseField, editItemText } from "@/app/(app)/cases/actions";
import { JudgmentsTab } from "@/components/case-tabs/JudgmentsTab";
import { InlineEdit } from "@/components/cases/InlineEdit";
import { ReviewButtons } from "@/components/cases/ReviewButtons";
import { SourceBadge, cx } from "@/components/ui";
import { compareFacts } from "@/lib/case-file";
import { formatDmy } from "@/lib/dates";
import { getCaseHeader, stageLinks } from "@/lib/cases";
import { CASE_STATUS, PARTY_ROLE, STAGE, caseLabel } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

type Table = "case_facts" | "case_parties" | "case_requests" | "case_arguments";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[22px] font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Group({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div>
      {label ? <p className="mb-1.5 px-4 text-[13px] text-ink-3">{label}</p> : null}
      <ul className="divide-y divide-hairline overflow-hidden rounded-[var(--radius)] bg-surface shadow-1">{children}</ul>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-[var(--radius)] bg-surface px-4 py-3 text-[13px] text-ink-3 shadow-1">{text}</p>;
}

const Suggest = () => <span className="shrink-0 rounded-full bg-suggest-soft px-2 py-0.5 text-[13px] font-medium text-suggest">مقترح</span>;

function RowDetails({ table, id, caseId, text, suggested, sourceQuote, row, documentName, summary }: {
  table: Table; id: string; caseId: string; text?: string; suggested: boolean; sourceQuote: string | null;
  row: Parameters<typeof SourceBadge>[0]["row"]; documentName?: string; summary: React.ReactNode;
}) {
  return (
    <li>
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-start gap-3 px-4 py-3 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">{summary}</summary>
        <div className="space-y-2 border-t border-hairline bg-surface-2 px-4 py-3">
          {text !== undefined ? (
            <div className="text-doc text-[15px] text-ink">
              <InlineEdit action={editItemText} hidden={{ table, id, case_id: caseId }} initial={text} multiline display={text} label="تحرير النص" />
            </div>
          ) : null}
          {sourceQuote ? <p className="text-[13px] text-ink-3">المصدر: <span className="text-doc">«{sourceQuote}»</span></p> : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SourceBadge row={row} documentName={documentName} />
            {suggested ? <ReviewButtons table={table} id={id} caseId={caseId} /> : null}
          </div>
        </div>
      </details>
    </li>
  );
}

function FieldRow({ label, value, children }: { label: string; value: React.ReactNode; children: React.ReactNode }) {
  return (
    <li>
      <details>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
          <span className="text-[17px] text-ink">{label}</span>
          <span className="truncate text-[15px] text-ink-2">{value}</span>
        </summary>
        <div className="border-t border-hairline bg-surface-2 px-4 py-3 text-[15px] text-ink">{children}</div>
      </details>
    </li>
  );
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join(" ");
}

const REQUEST_KIND: Record<string, string> = { primary: "طلب أصلي", alternative: "طلب احتياطي", precautionary: "طلب تحفظي" };
const ARG_KIND: Record<string, string> = { formal_defense: "دفع شكلي", substantive_defense: "دفع موضوعي", argument: "دفاع" };

export async function CaseFileView({ caseId }: { caseId: string }) {
  const db = await createClient();
  const c = await getCaseHeader(db, caseId);
  const links = c ? await stageLinks(db, caseId, c.previous_stage_case_id) : null;
  const factsInitial = c?.facts_date ? formatDmy(c.facts_date, c.facts_date_precision === "unknown" ? "day" : c.facts_date_precision) : "";
  const hidden = { case_id: caseId };
  const prov = "review_status, created_by_kind, source_kind, source_page, source_quote";
  const [{ data: factRows }, { data: partyRows }, { data: reqRows }, { data: argRows }] = await Promise.all([
    db.from("case_facts").select(`id, fact_date, date_precision, date_text, text, sort_order, created_at, ${prov}, document:documents!case_facts_source_document_id_fkey(file_name)`)
      .eq("case_id", caseId).neq("review_status", "rejected"),
    db.from("case_parties").select(`id, name, role, is_our_client, representative, notes, ${prov}, document:documents!case_parties_source_document_id_fkey(file_name)`)
      .eq("case_id", caseId).neq("review_status", "rejected").order("created_at"),
    db.from("case_requests").select(`id, text, kind, ${prov}, document:documents!case_requests_source_document_id_fkey(file_name)`)
      .eq("case_id", caseId).neq("review_status", "rejected").order("created_at"),
    db.from("case_arguments").select(`id, side, text, kind, ${prov}, document:documents!case_arguments_source_document_id_fkey(file_name)`)
      .eq("case_id", caseId).neq("review_status", "rejected").order("created_at"),
  ]);
  const facts = (factRows ?? []).sort(compareFacts);
  const parties = partyRows ?? [];
  const requests = reqRows ?? [];
  const opponent = (argRows ?? []).filter((a) => a.side === "opponent");
  const ours = (argRows ?? []).filter((a) => a.side === "ours");

  const textRow = (table: "case_requests" | "case_arguments", kinds: Record<string, string>) =>
    (r: (typeof requests)[number]) => (
      <RowDetails key={r.id} table={table} id={r.id} caseId={caseId} text={r.text} suggested={r.review_status === "suggested"}
        sourceQuote={r.source_quote} row={r} documentName={r.document?.file_name}
        summary={<div className="min-w-0 flex-1">
          <div className="flex items-start gap-2"><p className="line-clamp-2 flex-1 text-[17px] text-ink">{r.text}</p>{r.review_status === "suggested" ? <Suggest /> : null}</div>
          {r.kind ? <p className="mt-0.5 text-[13px] text-ink-3">{kinds[r.kind] ?? r.kind}</p> : null}
        </div>} />
    );

  return (
    <div className="space-y-10">
      {c ? (
        <Section title="بيانات الدعوى">
          <Group>
            <FieldRow label="تاريخ الوقائع" value={c.facts_date && c.facts_date_precision !== "unknown" ? <span className="num">{formatDmy(c.facts_date, c.facts_date_precision)}</span> : "غير محدد"}>
              <InlineEdit action={editCaseField} hidden={{ ...hidden, field: "facts_date" }} initial={factsInitial} label="تغيير"
                placeholder="مثال: 15/3/2023 أو 3/2023 أو 2023" hint="يوم/شهر/سنة، أو شهر/سنة، أو السنة فقط. بهذا التاريخ يُختار إصدار القانون المنطبق."
                display={factsInitial || "غير محدد"} />
            </FieldRow>
            <FieldRow label="الحالة" value={CASE_STATUS[c.status]}>
              <InlineEdit action={editCaseField} hidden={{ ...hidden, field: "status" }} initial={c.status} label="تغيير"
                options={Object.entries(CASE_STATUS).map(([value, label]) => ({ value, label }))} display={CASE_STATUS[c.status]} />
            </FieldRow>
            <FieldRow label="الدائرة" value={c.circuit ?? "غير محددة"}>
              <InlineEdit action={editCaseField} hidden={{ ...hidden, field: "circuit" }} initial={c.circuit ?? ""} label="تغيير"
                placeholder="مثال: الدائرة 12 مدني" display={c.circuit ?? "غير محددة"} />
            </FieldRow>
            <FieldRow label="نوع الدعوى" value={c.case_type ?? "غير محدد"}>
              <InlineEdit action={editCaseField} hidden={{ ...hidden, field: "case_type" }} initial={c.case_type ?? ""} label="تغيير"
                placeholder="مدني / عمال / إيجارات / أسرة / تجاري / جنح / إداري" display={c.case_type ?? "غير محدد"} />
            </FieldRow>
            {links?.previous ? (
              <li><Link href={`/cases/${links.previous.id}`} className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                <span className="text-[17px] text-ink">الدرجة السابقة · {STAGE[links.previous.stage]}</span>
                <span className="truncate text-[15px] text-accent">{caseLabel(links.previous)}</span></Link></li>
            ) : null}
            {links?.later.map((l) => (
              <li key={l.id}><Link href={`/cases/${l.id}`} className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                <span className="text-[17px] text-ink">الدرجة التالية · {STAGE[l.stage]}</span>
                <span className="truncate text-[15px] text-accent">{caseLabel(l)}</span></Link></li>
            ))}
          </Group>
        </Section>
      ) : null}
      <Section title="الوقائع">
        {facts.length ? (
          <Group>
            {facts.map((f) => {
              const dated = f.fact_date && f.date_precision !== "unknown";
              const suggested = f.review_status === "suggested";
              return (
                <RowDetails key={f.id} table="case_facts" id={f.id} caseId={caseId} text={f.text} suggested={suggested}
                  sourceQuote={f.source_quote} row={f} documentName={f.document?.file_name}
                  summary={<>
                    <span className={cx("num w-[5.5rem] shrink-0 pt-0.5 text-[13px] font-semibold tabular-nums", dated ? "text-ink-2" : "text-ink-3")}>
                      {dated ? formatDmy(f.fact_date, f.date_precision) : "غير محدد"}
                    </span>
                    <span className={cx("mt-1.5 size-2.5 shrink-0 rounded-full", suggested ? "bg-suggest" : "bg-accent")} aria-hidden />
                    <p className="text-doc line-clamp-2 min-w-0 flex-1 text-[17px] text-ink">{f.text}</p>
                    {suggested ? <Suggest /> : null}
                  </>} />
              );
            })}
          </Group>
        ) : <Empty text="لا توجد وقائع بعد. احكِ للمساعد في المحادثة ما حدث وتواريخه، أو ارفع صحيفة الدعوى." />}
      </Section>

      <Section title="الأطراف">
        {parties.length ? (
          <Group>
            {parties.map((p) => (
              <RowDetails key={p.id} table="case_parties" id={p.id} caseId={caseId} suggested={p.review_status === "suggested"}
                sourceQuote={p.source_quote} row={p} documentName={p.document?.file_name}
                summary={<>
                  <span aria-hidden className={cx("flex size-10 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold",
                    p.is_our_client ? "bg-accent text-surface" : "bg-surface-2 text-ink-2")}>{initials(p.name)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[17px] text-ink">{p.name}</p>
                    <p className="text-[13px] text-ink-3">{PARTY_ROLE[p.role]}{p.is_our_client ? " · موكلنا" : ""}{p.representative ? ` · يمثله ${p.representative}` : ""}</p>
                  </div>
                  {p.review_status === "suggested" ? <Suggest /> : null}
                </>} />
            ))}
          </Group>
        ) : <Empty text="لا توجد أطراف بعد. اذكر للمساعد أطراف الدعوى وصفاتهم." />}
      </Section>

      <Section title="الطلبات والدفوع">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            {requests.length ? <Group label="لنا">{requests.map(textRow("case_requests", REQUEST_KIND))}</Group>
              : <><p className="mb-1.5 px-4 text-[13px] text-ink-3">لنا</p><Empty text="لم تُسجل طلبات بعد." /></>}
            {ours.length ? <div className="mt-4"><Group label="دفوعنا">{ours.map(textRow("case_arguments", ARG_KIND))}</Group></div> : null}
          </div>
          <div>
            {opponent.length ? <Group label="ضدنا">{opponent.map(textRow("case_arguments", ARG_KIND))}</Group>
              : <><p className="mb-1.5 px-4 text-[13px] text-ink-3">ضدنا</p><Empty text="لم يُسجل دفاع للخصم بعد." /></>}
          </div>
        </div>
      </Section>

      <Section title="الأحكام"><JudgmentsTab caseId={caseId} /></Section>
      <section className="rounded-[var(--radius)] bg-surface-2 p-5">
        <h2 className="text-[17px] font-semibold text-ink-3">تحليل Clausia</h2>
        <p className="mt-1 text-[13px] text-ink-3">سيكتب Clausia هنا رأيًا قانونيًا أو مذكرة من ملف القضية (قريبًا).</p>
      </section>
      <a href={`/api/cases/${caseId}/case-file?download`} className="inline-flex min-h-11 items-center text-[15px] font-medium text-accent hover:underline">تنزيل ملف القضية (JSON)</a>
    </div>
  );
}
