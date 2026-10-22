import "server-only";
/**
 * getCaseFile(caseId) → the whole case as ONE JSON object. This is what the opinion/memo LLM will read
 * later (with LawMill), so it must be complete, stable and self-describing. Every item keeps its
 * provenance. Suggested (unconfirmed) items are kept apart in `pending_suggestions`; rejected items are left out.
 */
import type { Db } from "@/lib/supabase/server";
import { caseLabel } from "@/lib/labels";

export interface Provenance {
  review_status: "suggested" | "confirmed" | "rejected";
  created_by: "lawyer" | "model";
  source: { kind: "chat" | "document" | "manual"; message_id: string | null; document_id: string | null; page: number | null; quote: string | null; char_start: number | null; char_end: number | null };
}

type Party = { id: string; name: string; role: string; is_our_client: boolean; representative: string | null; notes: string | null } & Provenance;
type Fact = { id: string; date: string | null; date_precision: string; date_text: string | null; text: string } & Provenance;
type Req = { id: string; text: string; kind: string | null } & Provenance;
type Arg = { id: string; side: "opponent" | "ours"; kind: string | null; text: string } & Provenance;
type Hearing = { id: string; date: string; purpose: string | null; location: string | null; decision_type: string | null; decision_text: string | null; next_requirements: string | null; next_hearing_id: string | null;
  /** where the DECISION came from (the hearing row's own provenance is in the shared fields) */
  decision_source: { created_by: string | null; kind: string | null; message_id: string | null; document_id: string | null; page: number | null; quote: string | null; char_start: number | null; char_end: number | null } | null } & Provenance;
type Judgment = { id: string; date: string | null; kind: string; operative_text: string; outcome: string | null; appeal_deadline: string | null; appeal_deadline_note: string | null; hearing_id: string | null } & Provenance;

export interface CaseFile {
  schema_version: 1;
  generated_at: string; // ISO timestamp
  case: {
    id: string; label: string; title: string | null; case_number: string | null; case_year: number | null;
    court: string | null; circuit: string | null; case_type: string | null;
    stage: "first_instance" | "appeal" | "cassation";
    status: string; client_role: string | null; summary: string | null;
    facts_date: string | null; // ISO; LawMill picks the law version by it
    facts_date_precision: "day" | "month" | "year" | "unknown";
    previous_stage_case: { id: string; label: string; stage: string } | null;
    later_stage_cases: { id: string; label: string; stage: string }[];
  } & Provenance;
  client: { id: string; name: string; kind: string; phone: string | null } | null;
  parties: Party[]; // confirmed only
  facts: Fact[]; // confirmed only, ordered by date (undated last)
  requests: Req[];
  arguments: Arg[];
  hearings: Hearing[];
  judgments: Judgment[];
  /**
   * Exception to "sections hold confirmed items only": documents are files the lawyer uploaded, so every
   * non-rejected document is listed here (with its own review_status), none go to pending_suggestions.
   */
  documents: { id: string; file_name: string; doc_type: string; title: string | null; page_count: number | null; read_status: string; review_status: string; pages: { page_no: number; text: string }[] }[];
  /** Items with review_status 'suggested': not yet confirmed by the lawyer. `item` has the same shape as in its section. */
  pending_suggestions: { table: string; id: string; text: string; item: Party | Fact | Req | Arg | Hearing | Judgment }[];
}

type ProvRow = {
  review_status: Provenance["review_status"]; created_by_kind: Provenance["created_by"]; source_kind: Provenance["source"]["kind"];
  source_message_id: string | null; source_document_id?: string | null; source_page?: number | null; source_quote: string | null;
  source_char_start?: number | null; source_char_end?: number | null;
};
const PROV = "review_status, created_by_kind, source_kind, source_message_id, source_document_id, source_page, source_quote, source_char_start, source_char_end";

function prov(r: ProvRow): Provenance {
  return {
    review_status: r.review_status,
    created_by: r.created_by_kind,
    source: { kind: r.source_kind, message_id: r.source_message_id, document_id: r.source_document_id ?? null, page: r.source_page ?? null, quote: r.source_quote, char_start: r.source_char_start ?? null, char_end: r.source_char_end ?? null },
  };
}

/** Facts ordered by date (undated last), then by the lawyer's sort order, then creation. */
export function compareFacts<T extends { fact_date: string | null; sort_order: number | null; created_at: string }>(a: T, b: T) {
  if (a.fact_date !== b.fact_date) {
    if (!a.fact_date) return 1;
    if (!b.fact_date) return -1;
    return a.fact_date < b.fact_date ? -1 : 1;
  }
  return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.created_at.localeCompare(b.created_at);
}

function ok<R extends { data: unknown; error: { message: string } | null }>(r: R, what: string): R["data"] {
  if (r.error) throw new Error(`getCaseFile ${what}: ${r.error.message}`);
  return r.data;
}

const NONE = { data: null, error: null } as const;

/** The whole case as one JSON. RLS-bound `db`: a case of another office is not found (throws «case not found»). */
export async function getCaseFile(db: Db, caseId: string): Promise<CaseFile> {
  const c = ok(await db.from("cases").select(`id, title, case_number, case_year, court, circuit, case_type, stage, status, client_role, summary, facts_date, facts_date_precision, previous_stage_case_id, client_id, ${PROV}`).eq("id", caseId).maybeSingle(), "case");
  if (!c) throw new Error("case not found");

  const [client, prev, later, parties, facts, requests, args, hearings, judgments, documents] = await Promise.all([
    c.client_id ? db.from("clients").select("id, name, kind, phone").eq("id", c.client_id).maybeSingle() : Promise.resolve(NONE),
    c.previous_stage_case_id ? db.from("cases").select("id, case_number, case_year, title, stage").eq("id", c.previous_stage_case_id).maybeSingle() : Promise.resolve(NONE),
    db.from("cases").select("id, case_number, case_year, title, stage").eq("previous_stage_case_id", caseId).order("created_at"),
    db.from("case_parties").select(`id, name, role, is_our_client, representative, notes, created_at, ${PROV}`).eq("case_id", caseId).neq("review_status", "rejected").order("created_at"),
    db.from("case_facts").select(`id, fact_date, date_precision, date_text, text, sort_order, created_at, ${PROV}`).eq("case_id", caseId).neq("review_status", "rejected"),
    db.from("case_requests").select(`id, text, kind, created_at, ${PROV}`).eq("case_id", caseId).neq("review_status", "rejected").order("created_at"),
    db.from("case_arguments").select(`id, side, kind, text, created_at, ${PROV}`).eq("case_id", caseId).neq("review_status", "rejected").order("created_at"),
    db.from("hearings").select(`id, hearing_date, purpose, location, decision_type, decision_text, next_requirements, next_hearing_id, decision_created_by_kind, decision_source_kind, decision_source_message_id, decision_source_document_id, decision_source_page, decision_source_quote, decision_source_char_start, decision_source_char_end, ${PROV}`).eq("case_id", caseId).neq("review_status", "rejected").order("hearing_date"),
    db.from("judgments").select(`id, judgment_date, kind, operative_text, outcome, appeal_deadline, appeal_deadline_note, hearing_id, ${PROV}`).eq("case_id", caseId).neq("review_status", "rejected").order("judgment_date"),
    db.from("documents").select("id, file_name, doc_type, title, page_count, read_status, created_at, review_status").eq("case_id", caseId).neq("review_status", "rejected").order("created_at"),
  ]);

  const docs = ok(documents, "documents") ?? [];
  const pages = docs.length
    ? ok(await db.from("document_pages").select("document_id, page_no, text").in("document_id", docs.map((d) => d.id)).order("page_no"), "pages") ?? []
    : [];

  const stageRef = (s: { id: string; case_number: string | null; case_year: number | null; title: string | null; stage: string }) => ({ id: s.id, label: caseLabel(s), stage: s.stage });
  const prevRow = ok(prev, "previous stage");
  const cl = ok(client, "client");

  const pending: CaseFile["pending_suggestions"] = [];
  /** Split rows: confirmed → section, suggested → pending_suggestions. */
  function split<R extends ProvRow & { id: string }, O extends Party | Fact | Req | Arg | Hearing | Judgment>(table: string, rows: R[], map: (r: R) => O, text: (o: O) => string): O[] {
    const out: O[] = [];
    for (const r of rows) {
      const o = map(r);
      if (r.review_status === "suggested") pending.push({ table, id: r.id, text: text(o), item: o });
      else out.push(o);
    }
    return out;
  }

  const factRows = (ok(facts, "facts") ?? []).sort(compareFacts);

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    case: {
      id: c.id, label: caseLabel(c), title: c.title, case_number: c.case_number, case_year: c.case_year,
      court: c.court, circuit: c.circuit, case_type: c.case_type, stage: c.stage, status: c.status,
      client_role: c.client_role, summary: c.summary, facts_date: c.facts_date, facts_date_precision: c.facts_date_precision,
      previous_stage_case: prevRow ? stageRef(prevRow) : null,
      later_stage_cases: (ok(later, "later stages") ?? []).map(stageRef),
      ...prov(c),
    },
    client: cl ? { id: cl.id, name: cl.name, kind: cl.kind, phone: cl.phone } : null,
    parties: split("case_parties", ok(parties, "parties") ?? [],
      (r) => ({ id: r.id, name: r.name, role: r.role, is_our_client: r.is_our_client, representative: r.representative, notes: r.notes, ...prov(r) }),
      (o) => `${o.name} (${o.role})`),
    facts: split("case_facts", factRows,
      (r) => ({ id: r.id, date: r.fact_date, date_precision: r.date_precision, date_text: r.date_text, text: r.text, ...prov(r) }),
      (o) => o.text),
    requests: split("case_requests", ok(requests, "requests") ?? [], (r) => ({ id: r.id, text: r.text, kind: r.kind, ...prov(r) }), (o) => o.text),
    arguments: split("case_arguments", ok(args, "arguments") ?? [], (r) => ({ id: r.id, side: r.side, kind: r.kind, text: r.text, ...prov(r) }), (o) => o.text),
    hearings: split("hearings", ok(hearings, "hearings") ?? [],
      (r) => ({ id: r.id, date: r.hearing_date, purpose: r.purpose, location: r.location, decision_type: r.decision_type, decision_text: r.decision_text, next_requirements: r.next_requirements, next_hearing_id: r.next_hearing_id,
        decision_source: r.decision_type ? { created_by: r.decision_created_by_kind, kind: r.decision_source_kind, message_id: r.decision_source_message_id, document_id: r.decision_source_document_id, page: r.decision_source_page, quote: r.decision_source_quote, char_start: r.decision_source_char_start, char_end: r.decision_source_char_end } : null,
        ...prov(r) }),
      (o) => `${o.date}${o.purpose ? ` — ${o.purpose}` : ""}`),
    judgments: split("judgments", ok(judgments, "judgments") ?? [],
      (r) => ({ id: r.id, date: r.judgment_date, kind: r.kind, operative_text: r.operative_text, outcome: r.outcome, appeal_deadline: r.appeal_deadline, appeal_deadline_note: r.appeal_deadline_note, hearing_id: r.hearing_id, ...prov(r) }),
      (o) => o.operative_text),
    documents: docs.map((d) => ({
      id: d.id, file_name: d.file_name, doc_type: d.doc_type, title: d.title, page_count: d.page_count, read_status: d.read_status, review_status: d.review_status,
      pages: pages.filter((p) => p.document_id === d.id).map((p) => ({ page_no: p.page_no, text: p.text })),
    })),
    pending_suggestions: pending,
  };
}
