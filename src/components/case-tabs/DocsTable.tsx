// The case documents table (docs/design/next/Review{Light,Dark}.dc.html): one row per paper; the columns are the paper
// (thumb, name, pages · date), parties, facts and dates, requests, defenses, then the lawyer's own columns. Every value shows
// its page («ص 4») and opens the paper panel on the sentence; a suggested value has a gold dot and «ص 1 · مقترحة، راجعها».
// Phone (not drawn): the same DOM re-flows as one card per paper with the sections stacked, each under its own small title.
import { CellCite } from "@/components/cite/SourceChip";
import { DocMenu } from "@/components/documents/DocMenu";
import { DocThumb, pagesLabel } from "@/components/documents/DocThumb";
import { cx } from "@/components/ui";
import { formatDmy } from "@/lib/dates";
import { READ_STATUS } from "@/lib/labels";
import { SECTIONS, cellCite, sectionKind, type CellItem, type CustomCell, type DocRow, type SectionKey, type TableColumn } from "./docs-table";

const NOT_MENTIONED = "مش مذكور";
/** values shown in a cell before «+N كمان» */
const VISIBLE = 3;

const HEAD = "px-4 py-3 text-sm font-semibold text-text-3 sm:not-first:border-s sm:border-border-2";
const CELL = "px-4 py-3.5 sm:not-first:border-s sm:border-border-2";

/** a cell's values: values that point at the same sentence share one line («عادل (مؤجر) · وليد (مستأجر)») and one chip */
function groups(items: CellItem[]) {
  const out: { key: string; text: string; item: CellItem; suggested: boolean }[] = [];
  for (const it of items) {
    const same = it.page != null && out.find((g) => g.item.page === it.page && g.item.start === it.start && g.item.end === it.end && g.item.start != null);
    if (same) { same.text += ` · ${it.text}`; same.suggested ||= it.suggested; continue; }
    out.push({ key: it.id, text: it.text, item: it, suggested: it.suggested });
  }
  return out;
}

function Value({ row, text, item, suggested, kind }: { row: DocRow; text: string; item: CellItem; suggested: boolean; kind: string }) {
  const cite = cellCite(row, item, kind);
  return (
    <div>
      <p className="text-base font-medium leading-6 text-text">{text}</p>
      {cite ? <CellCite cite={cite} suggested={suggested} className="mt-1.5" /> : suggested ? <p className="mt-1.5 text-xs text-gold">مقترحة، راجعها</p> : null}
    </div>
  );
}

function Items({ row, items, kind }: { row: DocRow; items: CellItem[]; kind: string }) {
  if (!items.length) return <span className="text-base text-text-4">—</span>;
  const g = groups(items);
  const vals = (list: typeof g) => list.map((x) => <Value key={x.key} row={row} text={x.text} item={x.item} suggested={x.suggested} kind={kind} />);
  return (
    <div className="space-y-2.5">
      {vals(g.slice(0, VISIBLE))}
      {g.length > VISIBLE ? (
        <details className="group/more space-y-2.5">
          <summary className="tap inline-flex cursor-pointer list-none items-center text-xs font-semibold text-text-3 hover:text-text group-open/more:hidden [&::-webkit-details-marker]:hidden">
            و <span className="font-num mx-1">{g.length - VISIBLE}</span> كمان
          </summary>
          {vals(g.slice(VISIBLE))}
        </details>
      ) : null}
    </div>
  );
}

function Custom({ row, cell, column }: { row: DocRow; cell: CustomCell | undefined; column: TableColumn }) {
  if (!cell || cell.state === "empty") return <span className="text-base text-text-4">—</span>;
  if (cell.state === "not_mentioned") {
    return (
      <div>
        <p className="text-base text-text-4">{NOT_MENTIONED}</p>
        {cell.note ? <p className="mt-1 text-xs leading-4 text-text-4">{cell.note}</p> : null}
      </div>
    );
  }
  return <Value row={row} text={cell.item.text} item={cell.item} suggested={cell.item.suggested} kind={column.title} />;
}

export function DocsTable({ rows, columns }: { rows: DocRow[]; columns: TableColumn[] }) {
  const template = `15rem repeat(${SECTIONS.length + columns.length}, minmax(12rem, 1fr))`;
  const small = "text-xs font-semibold text-text-3 sm:hidden";
  return (
    <div className="sm:overflow-x-auto sm:rounded-xl sm:border sm:border-border-2 sm:bg-card sm:shadow-card" role="table" aria-label="جدول مستندات القضية">
      {/* wide enough for every column at its least width; with the four sections it is the page's own width */}
      <div className="space-y-3 sm:min-w-(--table-w) sm:space-y-0" style={{ "--table-w": `calc(15rem + ${SECTIONS.length + columns.length} * 12rem)` } as React.CSSProperties}>
        <div role="row" className="hidden bg-card-2 sm:grid" style={{ gridTemplateColumns: template }}>
          <div role="columnheader" className={HEAD}>المستند</div>
          {SECTIONS.map((s) => <div key={s.key} role="columnheader" className={HEAD}>{s.title}</div>)}
          {columns.map((c) => (
            <div key={c.id} role="columnheader" className={cx(HEAD, "flex items-center gap-1.5")}>
              {c.title}
              {c.suggested ? <span className="inline-flex items-center gap-1 text-xs text-gold"><span aria-hidden className="size-dot rounded-full bg-gold" />مقترح</span> : null}
            </div>
          ))}
        </div>
        {rows.map((r) => {
          const meta = [pagesLabel(r.pages), r.docDate ? formatDmy(r.docDate) : null].filter(Boolean).join(" · ");
          return (
            <div key={r.id} role="row" style={{ gridTemplateColumns: template }}
              className="rounded-xl border border-border-2 bg-card shadow-card sm:grid sm:rounded-none sm:border-0 sm:border-t sm:bg-transparent sm:shadow-none">
              <div role="cell" className="flex items-start gap-2.5 border-b border-border-2 px-4 py-3.5 sm:border-b-0">
                <DocThumb className="w-6.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-base font-bold leading-6 text-text">{r.name}</p>
                  {meta ? <p className="mt-0.5 text-xs text-text-3">{meta}</p> : null}
                  {r.info && r.info.readStatus !== "done" ? (
                    <p role="status" className={cx("mt-0.5 text-xs font-semibold", r.info.readStatus === "failed" ? "text-bad" : "text-text-3")}>
                      {r.info.readStatus === "failed" ? "ما اتقرتش" : READ_STATUS[r.info.readStatus]}
                    </p>
                  ) : null}
                  {r.info?.readStatus === "failed" && r.info.readError ? <p className="mt-0.5 text-xs leading-4 text-bad">{r.info.readError.slice(0, 120)}</p> : null}
                </div>
                {r.info ? <DocMenu documentId={r.id} caseId={r.info.caseId} name={r.name} fileName={r.info.fileName} docType={r.info.docType} meta={r.info.meta} hasText={r.info.hasText} hasPending={r.info.hasPending} /> : null}
              </div>
              {SECTIONS.map((s: { key: SectionKey; title: string }) => (
                <div key={s.key} role="cell" className={cx(CELL, "max-sm:space-y-1")}>
                  <p className={small}>{s.title}</p>
                  <Items row={r} items={r.sections[s.key]} kind={sectionKind(s.key)} />
                </div>
              ))}
              {columns.map((c) => (
                <div key={c.id} role="cell" className={cx(CELL, "max-sm:space-y-1")}>
                  <p className={small}>{c.title}</p>
                  <Custom row={r} cell={r.custom[c.id]} column={c} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
