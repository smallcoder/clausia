// OWNER: case-pages agent. Facts as a timeline ordered by date, with precision and provenance.
import { editItemText } from "@/app/(app)/cases/actions";
import { InlineEdit } from "@/components/cases/InlineEdit";
import { ReviewButtons } from "@/components/cases/ReviewButtons";
import { Badge, EmptyState, SourceBadge, cx } from "@/components/ui";
import { compareFacts } from "@/lib/case-file";
import { formatDmy } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export async function FactsTab({ caseId }: { caseId: string }) {
  const db = await createClient();
  const { data } = await db.from("case_facts")
    .select("id, fact_date, date_precision, date_text, text, sort_order, created_at, review_status, created_by_kind, source_kind, source_page, source_quote, source_document_id, document:documents!case_facts_source_document_id_fkey(file_name)")
    .eq("case_id", caseId).neq("review_status", "rejected");
  const facts = (data ?? []).sort(compareFacts);
  if (!facts.length) return <EmptyState title="لا توجد وقائع بعد" hint="احكِ للمساعد في المحادثة ما حدث وتواريخه، أو ارفع صحيفة الدعوى، وسيقترح الوقائع لتؤكدها." />;

  return (
    <ol className="relative space-y-4 border-s border-line ps-5">
      {facts.map((f) => {
        const suggested = f.review_status === "suggested";
        const dated = f.fact_date && f.date_precision !== "unknown";
        return (
          <li key={f.id} className="relative">
            <span className={cx("absolute -start-[1.6rem] top-1.5 size-2.5 rounded-full border-2 border-paper", suggested ? "bg-suggest" : "bg-accent")} />
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className={cx("font-semibold", dated ? "num text-ink" : "text-ink-3")}>{dated ? formatDmy(f.fact_date, f.date_precision) : "تاريخ غير محدد"}</span>
              {f.date_text && f.date_text !== formatDmy(f.fact_date, f.date_precision) ? <span className="text-callout text-ink-3">«{f.date_text}»</span> : null}
              {f.date_precision === "month" || f.date_precision === "year" ? <Badge>{f.date_precision === "month" ? "بالشهر" : "بالسنة"}</Badge> : null}
            </div>
            <div className={cx("mt-1.5 rounded-[var(--radius)] p-4", suggested ? "bg-suggest-soft ring-1 ring-suggest/25" : "bg-surface shadow-1")}>
              <div className="text-doc text-[17px] text-ink">
                <InlineEdit action={editItemText} hidden={{ table: "case_facts", id: f.id, case_id: caseId }} initial={f.text} multiline display={f.text} />
              </div>
              {f.source_quote ? <p className="mt-2 text-callout text-ink-3">المصدر: <span className="text-doc">«{f.source_quote}»</span></p> : null}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <SourceBadge row={f} documentName={f.document?.file_name} />
                {suggested ? <ReviewButtons table="case_facts" id={f.id} caseId={caseId} /> : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
