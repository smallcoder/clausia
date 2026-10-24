// «المذكرات والأحكام» (?tab=memos): the case's judgments (the saved ones, as the lawyer stated them) and the documents whose type says
// they are a memo or a judgment (مذكرتنا، مذكرة الخصم، حكم). `?draft=` opens one draft in the editor (PR 7); «افتح ملف Word كمسودة» makes a draft from a Word file.
// A document's home is «المستندات»: each row only opens the file and the footer links to that tab.
import Link from "next/link";
import { JudgmentsTab } from "@/components/case-tabs/JudgmentsTab";
import { docName } from "@/components/cases/case-view";
import { memoDocs } from "@/components/cases/dossier";
import { pagesLabel } from "@/components/documents/DocThumb";
import { DraftEditor } from "@/components/draft/DraftEditor";
import { ImportWord } from "@/components/draft/ImportWord";
import { DateText } from "@/components/ui";
import type { CaseFile } from "@/lib/case-file";
import type { VersionRow } from "@/lib/draft/store";
import { DOC_TYPE } from "@/lib/labels";
import type { DraftFull, DraftSummary } from "@/lib/library/list";
import type { OfficeStyle } from "@/lib/word/office-style";

/**
 * `drafts`: the case's drafts from the library, newest first; `draft`: the one opened with `?draft=` (the editor, PR 7) with its `versions` and the office's
 * paper (`style`, null = none yet).
 */
export function MemosTab({ cf, caseId, drafts = [], draft = null, style = null, versions = [], word = false }: { cf: CaseFile; caseId: string; drafts?: DraftSummary[]; draft?: DraftFull | null; style?: OfficeStyle | null; versions?: VersionRow[]; word?: boolean }) {
  if (draft) return <DraftEditor draft={draft} caseId={caseId} clientName={cf.client?.name ?? null} style={style} versions={versions} word={word} />;
  const docs = memoDocs(cf);
  const judgments = cf.judgments.length + cf.pending_suggestions.filter((p) => p.table === "judgments").length;
  if (!docs.length && !judgments && !drafts.length) {
    return (
      <section className="rounded-xl border border-border-2 bg-card px-6 py-6 shadow-card">
        <p className="text-md font-semibold text-text">لسه مفيش مذكرات أو أحكام في القضية دي</p>
        <p className="mt-1.5 max-w-160 text-base leading-7 text-text-3">
          ارفع المذكرة أو الحكم من <Link href={`/cases/${caseId}?tab=documents`} className="font-semibold text-text-2 underline underline-offset-4">المستندات</Link>، أو قول لـ Clausia تكتبلك مذكرة في المحادثة، أو اختار صيغة من <Link href="/library" className="font-semibold text-text-2 underline underline-offset-4">المكتبة</Link>، أو افتح ملف Word عندك كمسودة.
        </p>
        <div className="mt-3"><ImportWord caseId={caseId} /></div>
      </section>
    );
  }
  return (
    <div className="space-y-4 pb-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><ImportWord caseId={caseId} /></div>
      {drafts.length ? (
        <section className="overflow-hidden rounded-xl border border-border-2 bg-card shadow-card" aria-label="المسودات">
          <h2 className="px-6 py-4 text-lg font-bold text-title">المسودات</h2>
          <ul>
            {drafts.map((d) => (
              <li key={d.id} className="border-t border-border-2">
                <Link href={`/cases/${caseId}?tab=memos&draft=${d.id}`} className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 px-6 py-3 transition-colors hover:bg-card-2/60">
                  <span className="min-w-0 flex-1 basis-48 truncate text-md font-semibold text-text">{d.title}</span>
                  <span className="text-sm text-text-3">مسودة · {d.template_name}</span>
                  {d.open_spots ? <span className="text-sm font-semibold text-gold">{d.open_spots === 1 ? "خانة محتاجة منك" : d.open_spots === 2 ? "خانتين محتاجين منك" : `${d.open_spots} خانات محتاجة منك`}</span> : null}
                  <span className="text-sm text-text-3"><DateText iso={d.created_at.slice(0, 10)} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <JudgmentsTab cf={cf} caseId={caseId} />
      {docs.length ? (
        <section className="overflow-hidden rounded-xl border border-border-2 bg-card shadow-card" aria-label="مذكرات وأحكام في المستندات">
          <h2 className="px-6 py-4 text-lg font-bold text-title">في المستندات</h2>
          <ul>
            {docs.map((d) => (
              <li key={d.id} className="border-t border-border-2">
                <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener" title={d.file_name}
                  className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 px-6 py-3 transition-colors hover:bg-card-2/60">
                  <span className="min-w-0 flex-1 basis-48 truncate text-md font-semibold text-text">{docName(d)}</span>
                  <span className="text-sm text-text-3">{DOC_TYPE[d.doc_type as keyof typeof DOC_TYPE] ?? d.doc_type}</span>
                  <span className="text-sm text-text-3">
                    {d.doc_date ? <DateText iso={d.doc_date} /> : null}{d.doc_date && d.page_count ? " · " : null}{pagesLabel(d.page_count)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <div className="border-t border-border-2 px-6 py-2">
            <Link href={`/cases/${caseId}?tab=documents`} className="tap inline-flex min-h-11 items-center text-sm font-semibold text-text-2 hover:text-text hover:underline">كل المستندات ←</Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
