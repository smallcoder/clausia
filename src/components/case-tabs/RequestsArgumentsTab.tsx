// OWNER: case-pages agent. Our client's requests; the opponent's defenses and arguments; ours if any.
import { editItemText } from "@/app/(app)/cases/actions";
import { InlineEdit } from "@/components/cases/InlineEdit";
import { ReviewButtons } from "@/components/cases/ReviewButtons";
import { Badge, EmptyState, SectionTitle, SourceBadge, cx } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

const REQUEST_KIND: Record<string, string> = { primary: "طلب أصلي", alternative: "طلب احتياطي", precautionary: "طلب تحفظي" };
const ARG_KIND: Record<string, string> = { formal_defense: "دفع شكلي", substantive_defense: "دفع موضوعي", argument: "دفاع" };

type Row = {
  id: string; text: string; kind: string | null; review_status: "suggested" | "confirmed" | "rejected";
  created_by_kind: "lawyer" | "model"; source_kind: "chat" | "document" | "manual"; source_page: number | null; source_quote: string | null;
  document: { file_name: string } | null;
};

function Item({ r, table, caseId, kindLabel }: { r: Row; table: "case_requests" | "case_arguments"; caseId: string; kindLabel?: string }) {
  const suggested = r.review_status === "suggested";
  return (
    <li className={cx("rounded-lg border p-4", suggested ? "border-gold/30 bg-gold-bg/40" : "border-border bg-card")}>
      {kindLabel ? <Badge className="mb-2">{kindLabel}</Badge> : null}
      <div className="text-md leading-relaxed text-text">
        <InlineEdit action={editItemText} hidden={{ table, id: r.id, case_id: caseId }} initial={r.text} multiline display={r.text} />
      </div>
      {r.source_quote ? <p className="mt-2 text-base leading-[1.55] text-text-4">المصدر: «{r.source_quote}»</p> : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <SourceBadge row={r} documentName={r.document?.file_name} />
        {suggested ? <ReviewButtons table={table} id={r.id} caseId={caseId} /> : null}
      </div>
    </li>
  );
}

export async function RequestsArgumentsTab({ caseId }: { caseId: string }) {
  const db = await createClient();
  const prov = "review_status, created_by_kind, source_kind, source_page, source_quote";
  const [{ data: reqs }, { data: args }] = await Promise.all([
    db.from("case_requests").select(`id, text, kind, ${prov}, document:documents!case_requests_source_document_id_fkey(file_name)`)
      .eq("case_id", caseId).neq("review_status", "rejected").order("created_at"),
    db.from("case_arguments").select(`id, side, text, kind, ${prov}, document:documents!case_arguments_source_document_id_fkey(file_name)`)
      .eq("case_id", caseId).neq("review_status", "rejected").order("created_at"),
  ]);
  const requests = reqs ?? [];
  const opponent = (args ?? []).filter((a) => a.side === "opponent");
  const ours = (args ?? []).filter((a) => a.side === "ours");

  return (
    <div className="space-y-7">
      <section>
        <SectionTitle>طلبات موكلنا</SectionTitle>
        {requests.length ? (
          <ul className="space-y-3">{requests.map((r) => <Item key={r.id} r={r} table="case_requests" caseId={caseId} kindLabel={r.kind ? REQUEST_KIND[r.kind] ?? r.kind : undefined} />)}</ul>
        ) : <EmptyState title="لم تُسجل طلبات بعد" hint="اذكر لـ Clausia طلبات الموكل الأصلية والاحتياطية." />}
      </section>
      <section>
        <SectionTitle>دفوع ودفاع الخصم</SectionTitle>
        {opponent.length ? (
          <ul className="space-y-3">{opponent.map((r) => <Item key={r.id} r={r} table="case_arguments" caseId={caseId} kindLabel={r.kind ? ARG_KIND[r.kind] ?? r.kind : undefined} />)}</ul>
        ) : <EmptyState title="لم يُسجل دفاع للخصم بعد" hint="ارفع مذكرة الخصم أو لخّص دفوعه في المحادثة." />}
      </section>
      {ours.length ? (
        <section>
          <SectionTitle>دفوعنا ودفاعنا</SectionTitle>
          <ul className="space-y-3">{ours.map((r) => <Item key={r.id} r={r} table="case_arguments" caseId={caseId} kindLabel={r.kind ? ARG_KIND[r.kind] ?? r.kind : undefined} />)}</ul>
        </section>
      ) : null}
    </div>
  );
}
