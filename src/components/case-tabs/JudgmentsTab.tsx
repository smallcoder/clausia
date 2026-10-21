// OWNER: case-pages agent. Judgments: operative text, kind, outcome, appeal deadline as the lawyer stated it.
import { ReviewButtons } from "@/components/cases/ReviewButtons";
import { Badge, DateText, EmptyState, SourceBadge, cx } from "@/components/ui";
import { JUDGMENT_KIND } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

const OUTCOME: Record<string, { label: string; tone: "ok" | "danger" | "brass" }> = {
  for_us: { label: "لصالحنا", tone: "ok" },
  against_us: { label: "ضدنا", tone: "danger" },
  partial: { label: "لصالحنا جزئيًا", tone: "brass" },
};

export async function JudgmentsTab({ caseId }: { caseId: string }) {
  const db = await createClient();
  const { data } = await db.from("judgments")
    .select("id, judgment_date, kind, operative_text, outcome, appeal_deadline, appeal_deadline_note, review_status, created_by_kind, source_kind, source_page, source_quote, document:documents!judgments_source_document_id_fkey(file_name)")
    .eq("case_id", caseId).neq("review_status", "rejected").order("judgment_date", { ascending: false });
  const rows = data ?? [];
  if (!rows.length) return <EmptyState title="لم يصدر حكم مسجل بعد" hint="عند صدور حكم، أخبر Clausia بمنطوقه أو ارفع صورة الحكم." />;

  return (
    <ul className="space-y-4">
      {rows.map((j) => {
        const suggested = j.review_status === "suggested";
        const outcome = j.outcome ? OUTCOME[j.outcome] : null;
        return (
          <li key={j.id} className={cx("rounded-[var(--radius)] border p-4 lg:p-5", suggested ? "border-suggest/30 bg-suggest-soft/40" : "border-line bg-surface")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink">{j.judgment_date ? <>حكم بتاريخ <DateText iso={j.judgment_date} /></> : "حكم (التاريخ غير مسجل)"}</span>
              <Badge>{JUDGMENT_KIND[j.kind]}</Badge>
              {outcome ? <Badge tone={outcome.tone}>{outcome.label}</Badge> : j.outcome ? <Badge>{j.outcome}</Badge> : null}
            </div>
            <div className="mt-3 rounded-[var(--radius-sm)] border border-line bg-paper p-4">
              <p className="mb-1 text-caption text-ink-3">المنطوق</p>
              <p className="text-doc text-[16px] text-ink">{j.operative_text}</p>
            </div>
            <div className="mt-3 text-callout">
              {j.appeal_deadline ? (
                <p className="text-ink">
                  آخر ميعاد للطعن: <DateText iso={j.appeal_deadline} className="font-semibold" /> <span className="text-ink-3">— كما ذكره المحامي</span>
                  {j.appeal_deadline_note ? <span className="mt-1 block text-ink-3">{j.appeal_deadline_note}</span> : null}
                </p>
              ) : (
                <p className="text-ink-3">ميعاد الطعن لم يُسجل. Clausia لا يحسبه تلقائيًا؛ اذكره لـ Clausia إن أردت تسجيله.</p>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <SourceBadge row={j} documentName={j.document?.file_name} />
              {suggested ? <ReviewButtons table="judgments" id={j.id} caseId={caseId} /> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
