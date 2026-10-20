import "server-only";
/**
 * getCaseFile(caseId) → the whole case as ONE JSON object. This is what the opinion/memo LLM will read
 * later (with LawMill), so it must be complete, stable and self-describing. Every item keeps its
 * provenance. Suggested (unconfirmed) items are kept apart in `pending_suggestions`.
 * Implementation: case-pages feature (owner: case pages agent). Shape below is the contract.
 */
import type { Db } from "@/lib/supabase/server";

export interface Provenance {
  review_status: "suggested" | "confirmed" | "rejected";
  created_by: "lawyer" | "model";
  source: { kind: "chat" | "document" | "manual"; message_id: string | null; document_id: string | null; page: number | null; quote: string | null };
}

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
  parties: ({ id: string; name: string; role: string; is_our_client: boolean; representative: string | null; notes: string | null } & Provenance)[];
  facts: ({ id: string; date: string | null; date_precision: string; date_text: string | null; text: string } & Provenance)[]; // ordered by date
  requests: ({ id: string; text: string; kind: string | null } & Provenance)[];
  arguments: ({ id: string; side: "opponent" | "ours"; kind: string | null; text: string } & Provenance)[];
  hearings: ({ id: string; date: string; purpose: string | null; decision_type: string | null; decision_text: string | null; next_requirements: string | null; next_hearing_id: string | null } & Provenance)[];
  judgments: ({ id: string; date: string | null; kind: string; operative_text: string; outcome: string | null; appeal_deadline: string | null; appeal_deadline_note: string | null; hearing_id: string | null } & Provenance)[];
  documents: { id: string; file_name: string; doc_type: string; title: string | null; page_count: number | null; read_status: string; pages: { page_no: number; text: string }[] }[];
  pending_suggestions: { table: string; id: string; text: string }[];
}

export async function getCaseFile(db: Db, caseId: string): Promise<CaseFile> {
  void db; void caseId;
  throw new Error("getCaseFile: not implemented yet (case pages feature)");
}
