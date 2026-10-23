/**
 * «استخدمت:» (split layout, PR 4): the papers a chat turn REALLY used, kept with the answer (chat_messages.sources).
 * Pure code (no database, no server-only): the turn, the thread loader, the chip and the tests all use it.
 *
 * What counts as used (only these, nothing is added from the model's words):
 *   - pages a read tool returned (get_document_text → the page_no values in its result, not the pages that were asked for);
 *   - the paper source of each op of a card the turn made (page, quote and span);
 *   - the paper source of each context chip the lawyer attached (the row's own source).
 * One item per paper page. A page both read and cited is ONE item and keeps the span. Pages that were only read are grouped per
 * paper when there are more than three (a whole paper read is one chip, not twenty).
 */

export interface SourceItem {
  document_id: string;
  /** the pages this item stands for (one when it came from a quote); the panel opens at the first */
  pages: number[];
  /** the cited sentence, when the item came from a card or a chip; null for a page that was only read */
  quote: string | null;
  start: number | null;
  end: number | null;
}

const MAX_GROUP = 3;

export class SourceLog {
  private cited = new Map<string, SourceItem>();
  private read = new Map<string, Set<number>>();
  private order: string[] = [];

  private seen(documentId: string) {
    if (!this.order.includes(documentId)) this.order.push(documentId);
  }

  /** A read tool returned these pages of a paper. */
  addRead(documentId: string, pages: number[]) {
    const ok = pages.filter((n) => Number.isInteger(n) && n >= 1);
    if (!documentId || !ok.length) return;
    this.seen(documentId);
    const set = this.read.get(documentId) ?? new Set<number>();
    ok.forEach((n) => set.add(n));
    this.read.set(documentId, set);
  }

  /** A card op or a chip points at this page of a paper (with the quote and its span when it has them). */
  addCited(documentId: string, page: number | null | undefined, quote?: string | null, start?: number | null, end?: number | null) {
    if (!documentId || !page || !Number.isInteger(page) || page < 1) return;
    this.seen(documentId);
    const key = `${documentId}:${page}`;
    const had = this.cited.get(key);
    // the first quote of a page wins; a later one only fills what is missing
    this.cited.set(key, {
      document_id: documentId, pages: [page],
      quote: had?.quote ?? quote ?? null,
      start: had?.start ?? (start != null && end != null ? start : null),
      end: had?.end ?? (start != null && end != null ? end : null),
    });
  }

  get empty(): boolean {
    return this.cited.size === 0 && this.read.size === 0;
  }

  /** The list to store: in order of first use, no duplicates. */
  items(): SourceItem[] {
    const out: SourceItem[] = [];
    for (const doc of this.order) {
      const citedPages = [...this.cited.values()].filter((c) => c.document_id === doc).sort((a, b) => a.pages[0] - b.pages[0]);
      const readOnly = [...(this.read.get(doc) ?? [])].filter((n) => !this.cited.has(`${doc}:${n}`)).sort((a, b) => a - b);
      const all = [...citedPages];
      if (readOnly.length > MAX_GROUP) all.push({ document_id: doc, pages: readOnly, quote: null, start: null, end: null });
      else for (const n of readOnly) all.push({ document_id: doc, pages: [n], quote: null, start: null, end: null });
      out.push(...all.sort((a, b) => a.pages[0] - b.pages[0]));
    }
    return out;
  }
}

/** «ص 2» / «ص 2، 3» / «ص 1–20» (a run of pages is written as a range). */
export function pagesText(pages: number[]): string {
  const p = [...pages].sort((a, b) => a - b);
  if (!p.length) return "";
  const run = p.length > 2 && p.every((n, i) => i === 0 || n === p[i - 1] + 1);
  return run ? `ص ${p[0]}–${p[p.length - 1]}` : `ص ${p.join("، ")}`;
}

/** What comes back from the database is Json: keep only well-formed items. */
export function parseSources(raw: unknown): SourceItem[] {
  if (!Array.isArray(raw)) return [];
  const out: SourceItem[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const pages = Array.isArray(r.pages) ? r.pages.filter((n): n is number => Number.isInteger(n) && (n as number) >= 1) : [];
    if (typeof r.document_id !== "string" || !pages.length) continue;
    const num = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : null);
    out.push({ document_id: r.document_id, pages, quote: typeof r.quote === "string" ? r.quote : null, start: num(r.start), end: num(r.end) });
  }
  return out;
}
