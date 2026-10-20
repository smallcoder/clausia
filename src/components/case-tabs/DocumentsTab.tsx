// OWNER: documents agent. The case's documents: upload, open/download, text per page, inline type, pending cards.
import Link from "next/link";
import { DocTypeSelect } from "@/components/documents/DocTypeSelect";
import { UploadDocument } from "@/components/documents/UploadDocument";
import { Badge, Card, DateText, EmptyState, SectionTitle } from "@/components/ui";
import { READ_STATUS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

const STATUS_TONE = { pending: "neutral", reading: "brass", done: "ok", failed: "danger" } as const;

function sizeLabel(bytes: number | null) {
  if (!bytes) return null;
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} م.ب` : `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;
}

export async function DocumentsTab({ caseId }: { caseId: string }) {
  const db = await createClient();
  const { data: docs } = await db.from("documents")
    .select("id, file_name, title, doc_type, page_count, read_status, read_error, created_at, doc_date, mime_type, size_bytes")
    .eq("case_id", caseId).order("created_at", { ascending: false });
  const ids = (docs ?? []).map((d) => d.id);
  const [{ data: pages }, { data: pending }] = ids.length
    ? await Promise.all([
        db.from("document_pages").select("document_id, page_no, text").in("document_id", ids).order("page_no"),
        db.from("proposals").select("document_id").in("document_id", ids).in("status", ["pending", "partially_confirmed"]),
      ])
    : [{ data: [] }, { data: [] }];
  const pagesOf = new Map<string, { page_no: number; text: string }[]>();
  for (const p of pages ?? []) pagesOf.set(p.document_id, [...(pagesOf.get(p.document_id) ?? []), p]);
  const hasPending = new Set((pending ?? []).map((p) => p.document_id));

  return (
    <div className="space-y-5 pb-4">
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-semibold text-ink">إضافة مستند</h2>
          <p className="mt-1 text-callout leading-relaxed text-ink-2">
            صحيفة، مذكرة، محضر جلسة أو صورة بالهاتف (PDF أو صورة حتى 25 م.ب). يقرأ المساعد كل صفحة ويقترح ما وجده في بطاقة داخل محادثة الدعوى؛ لا يُحفظ شيء قبل تأكيدك.
          </p>
        </div>
        <div className="shrink-0"><UploadDocument caseId={caseId} /></div>
      </Card>

      <section>
        <SectionTitle>المستندات{docs?.length ? <>{" "}<span className="num font-normal text-ink-3">({docs.length})</span></> : null}</SectionTitle>
        {!docs?.length ? (
          <EmptyState title="لا توجد مستندات في هذه الدعوى بعد" hint="ارفع أول مستند وسيقرأه المساعد صفحة صفحة." />
        ) : (
          <ul className="space-y-3">
            {docs.map((d) => {
              const ps = pagesOf.get(d.id) ?? [];
              return (
                <li key={d.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="break-words font-semibold leading-snug text-ink">{d.title || d.file_name}</h3>
                        {d.title ? <p className="mt-0.5 truncate text-caption text-ink-3" dir="auto">{d.file_name}</p> : null}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption text-ink-3">
                          <DocTypeSelect documentId={d.id} value={d.doc_type} />
                          <Badge tone={STATUS_TONE[d.read_status]}>{READ_STATUS[d.read_status]}</Badge>
                          {d.page_count ? <span>{d.page_count === 1 ? "صفحة واحدة" : d.page_count === 2 ? "صفحتان" : <><span className="num">{d.page_count}</span> {d.page_count <= 10 ? "صفحات" : "صفحة"}</>}</span> : null}
                          <span>رُفع <DateText iso={d.created_at} /></span>
                          {d.doc_date ? <span>بتاريخ <DateText iso={d.doc_date} /></span> : null}
                          {sizeLabel(d.size_bytes) ? <span className="num">{sizeLabel(d.size_bytes)}</span> : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener" className="inline-flex h-8 items-center rounded-[var(--radius-sm)] px-3 text-callout font-medium text-accent hover:bg-accent-soft">فتح</a>
                        <a href={`/api/documents/${d.id}?download=1`} className="inline-flex h-8 items-center rounded-[var(--radius-sm)] px-3 text-callout font-medium text-ink-2 hover:bg-surface-2">تنزيل</a>
                      </div>
                    </div>

                    {hasPending.has(d.id) ? (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-suggest/25 bg-suggest-soft px-3 py-2">
                        <span className="text-callout text-suggest">استخرج المساعد بيانات من هذا المستند بانتظار تأكيدك.</span>
                        <Link href={`/cases/${caseId}?tab=chat`} className="text-callout font-semibold text-suggest underline-offset-4 hover:underline">مراجعة المقترحات</Link>
                      </div>
                    ) : null}
                    {d.read_status === "failed" && d.read_error ? <p className="mt-3 text-callout text-danger">تعذرت القراءة: {d.read_error.slice(0, 160)}</p> : null}

                    {ps.length ? (
                      <details className="group mt-3 border-t border-line pt-3">
                        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-callout font-medium text-ink-2 hover:text-ink">
                          <span className="inline-block transition group-open:rotate-90 rtl:rotate-180 rtl:group-open:rotate-90" aria-hidden>‹</span>
                          النص المستخرج
                        </summary>
                        <div className="mt-3 space-y-3">
                          {ps.map((p) => (
                            <details key={p.page_no} open={ps.length === 1} className="rounded-[var(--radius-sm)] border border-line bg-surface-2">
                              <summary className="cursor-pointer list-none px-3 py-2 text-caption font-semibold text-ink-3 hover:text-ink-2">
                                صفحة <span className="num">{p.page_no}</span>
                                <span className="ms-2 font-normal">{p.text.trim().split(/\s+/).slice(0, 8).join(" ")}…</span>
                              </summary>
                              <div className="text-doc max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words border-t border-line bg-surface px-4 py-3 text-[15px] text-ink">
                                {p.text || "—"}
                              </div>
                            </details>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
