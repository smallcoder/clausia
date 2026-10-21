// «المستندات» (?tab=documents): the case's papers as the mockup's 3-up paper grid (name, type, pages), the upload,
// then one panel per document — its type (inline select), read state, open / download, pending proposals,
// and the extracted text page by page (in Naskh).
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { DocThumb, pagesLabel } from "@/components/documents/DocThumb";
import { DocTypeSelect } from "@/components/documents/DocTypeSelect";
import { UploadDocument } from "@/components/documents/UploadDocument";
import { Panel, StatusChip } from "@/components/shell/PageHero";
import { formatDmy } from "@/lib/dates";
import { DOC_TYPE, READ_STATUS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

const STATUS_TONE = { pending: "neutral", reading: "neutral", done: "good", failed: "bad" } as const;

function sizeLabel(bytes: number | null) {
  if (!bytes) return null;
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} م.ب` : `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;
}

/** «مستند واحد», «مستندين», «3 مستندات», «12 مستند» */
const pagesWord = (n: number) => (n === 1 ? "مستند واحد" : n === 2 ? "مستندين" : `${n} ${n <= 10 ? "مستندات" : "مستند"}`);

const firstWords = (t: string, n = 9) => t.trim().split(/\s+/).slice(0, n).join(" ");

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
  const name = (d: { title: string | null; doc_type: string; file_name: string }) => d.title || DOC_TYPE[d.doc_type as keyof typeof DOC_TYPE] || d.file_name;

  return (
    <div className="space-y-4 pb-4">
      <section className="rounded-xl border border-border-2 bg-card shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-2 px-6 py-4">
          <h2 className="text-lg font-bold text-title">
            {docs?.length ? pagesWord(docs.length) : "ارفع أول ورقة"}
          </h2>
          <UploadDocument caseId={caseId} />
        </div>
        <p className="max-w-[640px] px-5 pt-3.5 text-sm leading-6 text-text-3">
          صحيفة، مذكرة، محضر جلسة أو صورة بالموبايل (PDF أو صورة لحد 25 م.ب). Clausia بيقرا كل صفحة ويقترح اللي لقاه في محادثة القضية، ومش بيتحفظ حاجة قبل ما تأكد.
        </p>
        {docs?.length ? (
          <ul className="grid grid-cols-3 gap-3 px-5 pb-5 pt-4 sm:grid-cols-[repeat(3,minmax(0,132px))] sm:gap-5">
            {docs.map((d) => (
              <li key={d.id} className="min-w-0">
                <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener" className="group block" title={d.file_name}>
                  <DocThumb note={d.read_status !== "done" ? READ_STATUS[d.read_status] : null} />
                  <span className="mt-2 line-clamp-2 block text-center text-sm font-semibold leading-5 text-text">{name(d)}</span>
                </a>
                <span className="mt-0.5 block truncate text-center text-xs text-text-3 sm:text-sm">
                  {[d.title ? DOC_TYPE[d.doc_type as keyof typeof DOC_TYPE] : null, pagesLabel(d.page_count)].filter(Boolean).join(" · ") || " "}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 pb-5 pt-2 text-base leading-7 text-text-3">لسه مفيش مستندات في القضية دي، وأي ورقة ترفعها Clausia هيقراها صفحة صفحة.</p>
        )}
      </section>

      {(docs ?? []).map((d) => {
        const ps = pagesOf.get(d.id) ?? [];
        const meta = [
          `اترفع ${formatDmy(d.created_at)}`,
          d.doc_date ? `بتاريخ ${formatDmy(d.doc_date)}` : null,
          pagesLabel(d.page_count),
          sizeLabel(d.size_bytes),
        ].filter(Boolean).join(" · ");
        return (
          <Panel key={d.id} title={<span id={`doc-${d.id}`} className="scroll-mt-24">{name(d)}</span>} meta={<StatusChip tone={STATUS_TONE[d.read_status]}>{READ_STATUS[d.read_status]}</StatusChip>}
            className="overflow-hidden">
            <ul className="divide-y divide-border-2">
              <li className="flex min-h-12 items-center justify-between gap-3 px-5 py-1.5">
                <span className="text-md text-text">النوع</span>
                <DocTypeSelect documentId={d.id} value={d.doc_type} />
              </li>
              <li className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate text-md text-text" dir="auto">{d.file_name}</span>
                  <span className="block text-sm text-text-4">{meta}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener" className="bg-primary-fill inline-flex h-11 items-center rounded-full px-5 text-base font-bold">فتح</a>
                  <a href={`/api/documents/${d.id}?download=1`} className="inline-flex h-11 items-center rounded-full border border-border bg-chip px-5 text-base text-text-2 shadow-soft hover:text-text">تنزيل</a>
                </span>
              </li>
              {hasPending.has(d.id) ? (
                <li className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-2">
                  <span className="flex items-center gap-2 text-base text-text-2"><StatusChip tone="warn">مقترحات</StatusChip>Clausia طلّع من الورقة دي حاجات مستنية تأكيدك.</span>
                  <Link href={`/cases/${caseId}?tab=chat`} className="inline-flex min-h-11 items-center text-base font-semibold text-gold hover:underline">راجعها ←</Link>
                </li>
              ) : null}
              {d.read_status === "failed" && d.read_error ? (
                <li className="px-5 py-3 text-base text-bad">ما قدرناش نقرا الورقة: {d.read_error.slice(0, 160)}</li>
              ) : null}
              {ps.length ? (
                <li>
                  <details className="group/text" open={ps.length <= 3}>
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-2 hover:bg-card-2/60 [&::-webkit-details-marker]:hidden">
                      <span className="text-md text-text">النص المستخرج</span>
                      <span className="flex items-center gap-1.5 text-sm text-text-3">
                        {pagesLabel(ps.length)}
                        <ChevronDown aria-hidden size={16} strokeWidth={2} className="transition-transform group-open/text:rotate-180" />
                      </span>
                    </summary>
                    <div className="space-y-2.5 px-4 pb-4 sm:px-5">
                      {ps.map((p) => (
                        <details key={p.page_no} open={p.page_no === ps[0].page_no} className="group/page overflow-hidden rounded-md border border-border-2 bg-card-2">
                          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 [&::-webkit-details-marker]:hidden">
                            <span className="shrink-0 text-sm font-bold text-text">صفحة <span className="font-num">{p.page_no}</span></span>
                            <span className="text-doc min-w-0 flex-1 truncate text-sm text-text-3">{firstWords(p.text)}…</span>
                            <ChevronDown aria-hidden size={15} strokeWidth={2} className="shrink-0 text-text-4 transition-transform group-open/page:rotate-180" />
                          </summary>
                          <div className="text-doc max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words border-t border-border-2 bg-field px-4 py-3 text-md text-text sm:px-6">
                            {p.text || "—"}
                          </div>
                        </details>
                      ))}
                    </div>
                  </details>
                </li>
              ) : null}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}
