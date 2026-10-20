// OWNER: case-pages agent. Parties grouped by role; our client highlighted.
import { ReviewButtons } from "@/components/cases/ReviewButtons";
import { Badge, EmptyState, SectionTitle, SourceBadge, cx } from "@/components/ui";
import type { Database } from "@/lib/db/types";
import { PARTY_ROLE } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

type Role = Database["public"]["Enums"]["party_role"];
const ORDER = Object.keys(PARTY_ROLE) as Role[];

export async function PartiesTab({ caseId }: { caseId: string }) {
  const db = await createClient();
  const { data } = await db.from("case_parties")
    .select("id, name, role, is_our_client, representative, notes, review_status, created_by_kind, source_kind, source_page, source_quote, document:documents!case_parties_source_document_id_fkey(file_name)")
    .eq("case_id", caseId).neq("review_status", "rejected").order("created_at");
  const parties = data ?? [];
  if (!parties.length) return <EmptyState title="لا توجد أطراف بعد" hint="اذكر للمساعد أطراف الدعوى وصفاتهم، وسيقترحهم لتؤكدهم." />;

  const groups = ORDER.map((role) => ({ role, items: parties.filter((p) => p.role === role) })).filter((g) => g.items.length);

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.role}>
          <SectionTitle>{PARTY_ROLE[g.role]}</SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-2">
            {g.items.map((p) => {
              const suggested = p.review_status === "suggested";
              return (
                <li key={p.id} className={cx("rounded-[var(--radius)] border p-4",
                  suggested ? "border-suggest/30 bg-suggest-soft/40" : p.is_our_client ? "border-accent/30 bg-accent-soft" : "border-line bg-surface")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">{p.name}</p>
                    {p.is_our_client ? <Badge tone="accent">موكلنا</Badge> : null}
                  </div>
                  {p.representative ? <p className="mt-1 text-sm text-ink-2">يمثله: {p.representative}</p> : null}
                  {p.notes ? <p className="mt-1 text-sm text-ink-3">{p.notes}</p> : null}
                  {p.source_quote ? <p className="mt-2 text-sm text-ink-3">المصدر: «{p.source_quote}»</p> : null}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <SourceBadge row={p} documentName={p.document?.file_name} />
                    {suggested ? <ReviewButtons table="case_parties" id={p.id} caseId={caseId} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
