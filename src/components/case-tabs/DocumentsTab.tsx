// «المستندات» (?tab=documents): the case documents table (docs/design/next/Review*.dc.html) — one row per paper, a cell per
// section (parties, facts and dates, requests, defenses) and the lawyer's own columns, each value with its page — then, below,
// one panel per document: its type (inline select), read state, open / download, pending proposals, and the extracted text
// page by page (in Naskh). A question asked of every paper («+ عمود جديد») waits as ONE confirmation card above the table.
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { DocsTable } from "@/components/case-tabs/DocsTable";
import { buildDocsTable, type PendingOp, type TableCell, type TableColumn } from "@/components/case-tabs/docs-table";
import { pagesLabel } from "@/components/documents/DocThumb";
import { AddColumn } from "@/components/documents/AddColumn";
import { DocTypeSelect } from "@/components/documents/DocTypeSelect";
import { UploadDocument } from "@/components/documents/UploadDocument";
import { ProposalCard } from "@/components/proposal/ProposalCard";
import { ClausiaSays, Panel, StatusChip } from "@/components/shell/PageHero";
import { buildProposalLookup } from "@/lib/assistant/lookup";
import type { CaseFile } from "@/lib/case-file";
import { formatDmy } from "@/lib/dates";
import { DOC_TYPE, READ_STATUS } from "@/lib/labels";
import type { Proposal } from "@/lib/proposals";
import { createClient } from "@/lib/supabase/server";

const STATUS_TONE = { pending: "neutral", reading: "neutral", done: "good", failed: "bad" } as const;

function sizeLabel(bytes: number | null) {
  if (!bytes) return null;
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} م.ب` : `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;
}

/** «مستند واحد», «مستندين», «3 مستندات», «12 مستند» */
const pagesWord = (n: number) => (n === 1 ? "مستند واحد" : n === 2 ? "مستندين" : `${n} ${n <= 10 ? "مستندات" : "مستند"}`);

const firstWords = (t: string, n = 9) => t.trim().split(/\s+/).slice(0, n).join(" ");

/** a card of this page: its column or its cells wait for the lawyer */
const COLUMN_TOOLS = ["add_doc_column", "add_doc_cell"];
const isOpen = (s: string) => s === "pending" || s === "failed";
const TABLE_TOOLS = ["add_party", "add_fact", "add_request", "add_argument"];

export async function DocumentsTab({ caseId, cf }: { caseId: string; cf: CaseFile }) {
  const db = await createClient();
  const { data: docs } = await db.from("documents")
    .select("id, file_name, title, doc_type, page_count, read_status, read_error, created_at, doc_date, mime_type, size_bytes")
    .eq("case_id", caseId).neq("review_status", "rejected").order("created_at");
  const ids = (docs ?? []).map((d) => d.id);
  const [{ data: pages }, { data: pending }, { data: open }, { data: cols }] = await Promise.all([
    ids.length ? db.from("document_pages").select("document_id, page_no, text").in("document_id", ids).order("page_no") : { data: [] },
    ids.length ? db.from("proposals").select("document_id").in("document_id", ids).in("status", ["pending", "partially_confirmed"]) : { data: [] },
    db.from("proposals").select("*").eq("case_id", caseId).in("status", ["pending", "partially_confirmed"]).order("created_at"),
    db.from("doc_columns").select("id, title, review_status").eq("case_id", caseId).neq("review_status", "rejected").order("created_at"),
  ]);
  const { data: cellRows } = cols?.length
    ? await db.from("doc_column_cells").select("id, column_id, document_id, answer, note, review_status, source_page, source_quote, source_char_start, source_char_end").in("column_id", cols.map((c) => c.id))
    : { data: [] };
  const pagesOf = new Map<string, { page_no: number; text: string }[]>();
  for (const p of pages ?? []) pagesOf.set(p.document_id, [...(pagesOf.get(p.document_id) ?? []), p]);
  const hasPending = new Set((pending ?? []).map((p) => p.document_id));
  const name = (d: { title: string | null; doc_type: string; file_name: string }) => d.title || DOC_TYPE[d.doc_type as keyof typeof DOC_TYPE] || d.file_name;

  // the open cards: a question's card (column + cells) is shown here; every other open card feeds the table as «مقترحة»
  const cards = (open ?? []) as unknown as Proposal[];
  const columnCards = cards.filter((p) => p.ops.some((o) => COLUMN_TOOLS.includes(o.tool) && isOpen(o.status)));
  const lookup = columnCards.length ? await buildProposalLookup(db, columnCards) : {};
  const pendingOps: PendingOp[] = cards.filter((p) => !columnCards.includes(p)).flatMap((p) =>
    p.ops.filter((o) => o.status === "pending" && TABLE_TOOLS.includes(o.tool)).map((o) => ({ proposalId: p.id, opId: o.op_id, tool: o.tool, args: o.args, source: o.source })));
  const columns: TableColumn[] = (cols ?? []).map((c) => ({ id: c.id, title: c.title, suggested: c.review_status === "suggested" }));
  const rows = buildDocsTable({
    docs: (docs ?? []).map((d) => ({ id: d.id, name: name(d), page_count: d.page_count, doc_date: d.doc_date })),
    cf, pending: pendingOps, columns, cells: (cellRows ?? []) as TableCell[],
  });

  // the Clausia line: what was read, and how many cells wait for the lawyer (a cell = one paper's value in one column)
  const read = (docs ?? []).filter((d) => d.read_status === "done").length;
  const total = docs?.length ?? 0;
  const suggestedCells = rows.reduce((n, r) => n
    + Object.values(r.sections).filter((items) => items.some((i) => i.suggested)).length
    + Object.values(r.custom).filter((c) => (c.state === "answer" ? c.item.suggested : c.state === "not_mentioned" && c.suggested)).length, 0);
  const readWord = read === total ? (total === 1 ? "المستند الوحيد" : total === 2 ? "المستندين" : `الـ ${total} ${total <= 10 ? "مستندات" : "مستند"}`) : `${read} من ${total} مستندات`;
  const cellsWord = suggestedCells === 1 ? "خانة واحدة" : suggestedCells === 2 ? "خانتين" : `${suggestedCells} ${suggestedCells <= 10 ? "خانات" : "خانة"}`;

  return (
    <div className="space-y-4 pb-4">
      {/* phone: the count, the upload and the new column live here; desktop: they are the title row's stat and far-end buttons (CaseSubHeader) */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 sm:hidden">
        <h2 className="text-lg font-bold text-title">{total ? pagesWord(total) : "ارفع أول ورقة"}</h2>
        <div className="flex items-center gap-2"><UploadDocument caseId={caseId} compact /><AddColumn caseId={caseId} disabled={!total} /></div>
      </div>

      {total ? (
        <>
          <ClausiaSays size="md">
            <span className="text-text">
              {read ? <>قريت {readWord} وطلّعت من كل واحد اللي يخص القضية. كل خانة عليها رقم الصفحة، دوس عليها تفتحلك الجملة.</> : <>لسه ما قريتش مستندات القضية. أول ما أخلص هتلاقي كل حاجة هنا.</>}
              {suggestedCells ? <> فيه {cellsWord} <span className="font-semibold text-gold">مقترحة</span> محتاجة مراجعتك.</> : null}
            </span>
          </ClausiaSays>

          {columnCards.map((p) => <ProposalCard key={p.id} proposal={p} lookup={lookup} />)}

          <DocsTable rows={rows} columns={columns} />

          <p className="flex items-center gap-2 px-2 text-sm text-text-3">
            <span aria-hidden className="size-dot shrink-0 rounded-full bg-text-4" />
            اسأل سؤال على كل المستندات مرة واحدة، وهيبقى عمود جديد في الجدول: مثلاً «فيه شرط جزائي؟»
          </p>
        </>
      ) : (
        <section className="rounded-xl border border-border-2 bg-card px-5 py-5 shadow-card">
          <p className="max-w-160 text-sm leading-6 text-text-3">
            صحيفة، مذكرة، محضر جلسة أو صورة بالموبايل (PDF أو صورة لحد 25 م.ب). Clausia بيقرا كل صفحة ويقترح اللي لقاه في محادثة القضية، ومش بيتحفظ حاجة قبل ما تأكد.
          </p>
          <p className="pt-2 text-base leading-7 text-text-3">لسه مفيش مستندات في القضية دي، وأي ورقة ترفعها Clausia هيقراها صفحة صفحة.</p>
        </section>
      )}

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
                          <div className="text-doc max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words border-t border-border-2 bg-field px-4 py-3 text-md text-text sm:px-6" /* ds-allow: a share of the screen height (vh), not a length: long court text scrolls inside it */>
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
