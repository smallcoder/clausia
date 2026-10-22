/**
 * The case documents table (docs/design/next/Review{Light,Dark}.dc.html): one row per paper, one cell per section.
 * Pure: it builds the cells from what the case already holds, grouped by `source_document_id`, and never invents a value.
 *   parties = case_parties · facts and dates = case_facts · requests = case_requests · defenses = case_arguments (opponent side)
 * A cell item is SUGGESTED (gold dot, «مقترحة، راجعها») when it is a saved row with review_status 'suggested', or an op still
 * waiting in an open confirmation card (its paper is the op's source document). Custom columns come from doc_columns /
 * doc_column_cells: a paper with no cell row was not asked (shown «—»); a cell with no answer is «مش مذكور».
 */
import type { CiteSource } from "@/components/cite/context";
import { aboutItem, factDate } from "@/components/cases/case-view";
import type { CaseFile } from "@/lib/case-file";
import { PARTY_ROLE } from "@/lib/labels";

export type SectionKey = "parties" | "facts" | "requests" | "defenses";
export const SECTIONS: { key: SectionKey; title: string }[] = [
  { key: "parties", title: "الأطراف" },
  { key: "facts", title: "الوقائع والتواريخ" },
  { key: "requests", title: "الطلبات" },
  { key: "defenses", title: "الدفوع" },
];
const KIND: Record<SectionKey, string> = { parties: "طرف", facts: "واقعة", requests: "طلب", defenses: "دفع" };

/** One value in a cell, with the sentence it came from. */
export interface CellItem {
  /** unique per item: the paper panel's «which chip is open» */
  id: string;
  text: string;
  page: number | null;
  start: number | null;
  end: number | null;
  quote: string | null;
  suggested: boolean;
}

export type CustomCell =
  | { state: "empty" } // this paper was not asked (it came after the column)
  | { state: "not_mentioned"; cellId: string; note: string | null; suggested: boolean }
  /** `byLawyer`: the wording is the lawyer's own (they edited it, or edited it before the tap); the quote is still the paper's */
  | { state: "answer"; cellId: string; item: CellItem; byLawyer: boolean };

/** what the row's status line and «…» menu need about the paper (the old per-paper panel's content) */
export interface DocInfo {
  caseId: string;
  readStatus: "pending" | "reading" | "done" | "failed";
  readError: string | null;
  docType: string;
  fileName: string;
  /** «117 ك.ب · اترفع 22/10/2026» */
  meta: string;
  /** the paper has extracted text to open in the panel */
  hasText: boolean;
  /** an open card of this paper still waits in the chat */
  hasPending: boolean;
}

export interface DocRow {
  id: string;
  info: DocInfo | null;
  name: string;
  pages: number | null;
  /** the date written on the paper (documents.doc_date), ISO, when known */
  docDate: string | null;
  sections: Record<SectionKey, CellItem[]>;
  custom: Record<string, CustomCell>;
}

export interface TableDoc { id: string; name: string; page_count: number | null; doc_date: string | null; info?: DocInfo }
export interface TableColumn { id: string; title: string; suggested: boolean }
export interface TableCell {
  id: string; column_id: string; document_id: string; answer: string | null; note: string | null; review_status: string;
  /** 'lawyer' | 'model' (optional so that older callers and fixtures still build) */
  created_by_kind?: string;
  source_page: number | null; source_quote: string | null; source_char_start: number | null; source_char_end: number | null;
}
/** an op of an open card that still waits for the lawyer */
export interface PendingOp {
  proposalId: string; opId: string; tool: string; args: Record<string, unknown>;
  source: { kind: string; document_id?: string | null; page?: number | null; quote?: string | null; char_start?: number | null; char_end?: number | null };
}

type Src = { document_id: string | null; page: number | null; quote: string | null; char_start: number | null; char_end: number | null };

/** «عادل النموذجي (مدعٍ)» */
export const partyText = (name: string, role: string) => `${name} (${PARTY_ROLE[role as keyof typeof PARTY_ROLE] ?? role})`;

/** «1/9/2022 · تحرير عقد إيجار الشقة»: the date as the paper gave it (unknown date: just the text) */
export function factText(f: { date: string | null; date_precision: string; date_text: string | null; text: string }): string {
  const d = f.date ? factDate(f.date, f.date_precision) : f.date_text;
  return d ? `${d} · ${f.text}` : f.text;
}

export function buildDocsTable(input: {
  docs: TableDoc[];
  cf: Pick<CaseFile, "parties" | "facts" | "requests" | "arguments" | "pending_suggestions">;
  pending: PendingOp[];
  columns: TableColumn[];
  cells: TableCell[];
}): DocRow[] {
  const rows = new Map<string, DocRow>();
  for (const d of input.docs) {
    rows.set(d.id, { id: d.id, info: d.info ?? null, name: d.name, pages: d.page_count, docDate: d.doc_date, sections: { parties: [], facts: [], requests: [], defenses: [] }, custom: {} });
  }
  const add = (section: SectionKey, id: string, src: Src, text: string, suggested: boolean) => {
    const row = src.document_id ? rows.get(src.document_id) : undefined;
    if (!row || !text.trim()) return;
    row.sections[section].push({ id, text, page: src.page, start: src.char_start, end: src.char_end, quote: src.quote, suggested });
  };

  // saved items (confirmed), then the saved ones still «مقترح»
  const { parties, facts, requests, arguments: args, pending_suggestions: sug } = input.cf;
  for (const p of parties) add("parties", `cell:p:${p.id}`, p.source, partyText(p.name, p.role), false);
  for (const f of facts) add("facts", `cell:f:${f.id}`, f.source, factText(f), false);
  for (const r of requests) add("requests", `cell:r:${r.id}`, r.source, r.text, false);
  for (const a of args) if (a.side === "opponent") add("defenses", `cell:a:${a.id}`, a.source, a.text, false);
  for (const s of sug) {
    const it = s.item;
    if (s.table === "case_parties") { const p = it as CaseFile["parties"][number]; add("parties", `cell:p:${p.id}`, p.source, partyText(p.name, p.role), true); }
    else if (s.table === "case_facts") { const f = it as CaseFile["facts"][number]; add("facts", `cell:f:${f.id}`, f.source, factText(f), true); }
    else if (s.table === "case_requests") { const r = it as CaseFile["requests"][number]; add("requests", `cell:r:${r.id}`, r.source, r.text, true); }
    else if (s.table === "case_arguments") { const a = it as CaseFile["arguments"][number]; if (a.side === "opponent") add("defenses", `cell:a:${a.id}`, a.source, a.text, true); }
  }
  // ops waiting in an open card
  for (const o of input.pending) {
    if (o.source.kind !== "document") continue;
    const src: Src = { document_id: o.source.document_id ?? null, page: o.source.page ?? null, quote: o.source.quote ?? null, char_start: o.source.char_start ?? null, char_end: o.source.char_end ?? null };
    const a = o.args;
    const id = `cell:op:${o.proposalId}:${o.opId}`;
    if (o.tool === "add_party") add("parties", id, src, partyText(String(a.name ?? ""), String(a.role ?? "other")), true);
    else if (o.tool === "add_fact") add("facts", id, src, factText({ date: null, date_precision: "unknown", date_text: (a.date_text ?? a.date ?? null) as string | null, text: String(a.text ?? "") }), true);
    else if (o.tool === "add_request") add("requests", id, src, String(a.text ?? ""), true);
    else if (o.tool === "add_argument" && a.side !== "ours") add("defenses", id, src, String(a.text ?? ""), true);
  }

  // custom columns
  const col = new Map(input.columns.map((c) => [c.id, c]));
  for (const c of input.cells) {
    const row = rows.get(c.document_id);
    const column = col.get(c.column_id);
    if (!row || !column) continue;
    // a cell is suggested when ITS status says so (a column saved as suggestions has suggested cells; confirming a cell is its own tap)
    const suggested = c.review_status === "suggested";
    row.custom[c.column_id] = c.answer
      ? { state: "answer", cellId: c.id, byLawyer: c.created_by_kind === "lawyer", item: { id: `cell:c:${c.id}`, text: c.answer, page: c.source_page, start: c.source_char_start, end: c.source_char_end, quote: c.source_quote, suggested } }
      : { state: "not_mentioned", cellId: c.id, note: c.note, suggested };
  }
  return input.docs.map((d) => rows.get(d.id)!);
}

/** What a cell chip needs to open the paper panel on the sentence («الصحيفة · ص 2» in the panel's header). */
export function cellCite(row: Pick<DocRow, "id" | "name">, item: CellItem, kind: string): CiteSource | null {
  if (!item.page) return null;
  return { id: item.id, documentId: row.id, page: item.page, start: item.start, end: item.end, quote: item.quote, label: `${row.name} · ص ${item.page}`, about: aboutItem(kind, item.text) };
}
export const sectionKind = (s: SectionKey) => KIND[s];
