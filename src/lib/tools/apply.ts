import "server-only";
/**
 * Execute ONE write op (after the lawyer confirmed it, or for the lawyer's own inline edits).
 * Uses the caller's RLS-bound client, so a user can only ever write into their own office.
 */
import { formatDmy, parseDmy, todayIso } from "@/lib/dates";
import type { Db } from "@/lib/supabase/server";
import type { Database } from "@/lib/db/types";
import { WRITE_TOOL_ARGS, type WriteArgs, type WriteTool } from "./registry";

type E = Database["public"]["Enums"];

export interface Provenance {
  review_status: E["item_status"]; // 'confirmed' normally; 'suggested' when the lawyer chose «save as suggestions»
  created_by_kind: E["actor_kind"]; // 'model' = drafted by the assistant; 'lawyer' = typed or edited by the lawyer
  source_kind: E["source_kind"];
  source_message_id?: string | null;
  source_document_id?: string | null;
  source_page?: number | null;
  source_quote?: string | null;
}

export const MANUAL: Provenance = { review_status: "confirmed", created_by_kind: "lawyer", source_kind: "manual" };

/** "@name" refs → ids created earlier in the same card. */
export type RefMap = Record<string, string>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveRef(v: string | undefined, refs: RefMap): string | undefined {
  if (!v) return undefined;
  if (v.startsWith("@")) {
    const id = refs[v.slice(1)];
    if (!id) throw new Error(`العنصر المرتبط «${v}» لم يُؤكَّد بعد`);
    return id;
  }
  if (!UUID.test(v)) throw new Error(`مرجع غير صالح: ${v}`);
  return v;
}

/** «7» → «الدائرة 7» (a bare number is how lawyers often say the circuit; the word is not a guess). */
function circuitText(v: string | undefined | null) {
  if (!v) return v ?? null;
  const t = v.trim();
  return /^[0-9٠-٩]+(\s|$)/.test(t) ? `الدائرة ${t}` : t;
}

function date(v: string | undefined) {
  const p = parseDmy(v);
  return p ? { iso: p.iso, precision: p.precision } : null;
}

function prov(p: Provenance) {
  return {
    review_status: p.review_status,
    created_by_kind: p.created_by_kind,
    source_kind: p.source_kind,
    source_message_id: p.source_message_id ?? null,
    source_document_id: p.source_document_id ?? null,
    source_page: p.source_page ?? null,
    source_quote: p.source_quote ?? null,
  };
}

function must<R extends { data: unknown; error: { message: string } | null }>(r: R): NonNullable<R["data"]> {
  if (r.error) throw new Error(r.error.message);
  if (r.data === null || r.data === undefined) throw new Error("no row returned");
  return r.data as NonNullable<R["data"]>;
}

/** Validate + execute. Returns the id of the created/updated row (for @ref resolution). */
export async function applyOp(db: Db, tool: WriteTool, rawArgs: unknown, p: Provenance, refs: RefMap = {}): Promise<{ id: string; extra?: Record<string, unknown> }> {
  const parsed = WRITE_TOOL_ARGS[tool].safeParse(rawArgs);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const a = parsed.data as WriteArgs<WriteTool>;

  switch (tool) {
    case "create_client": {
      const x = a as WriteArgs<"create_client">;
      const row = must(await db.from("clients").insert({ name: x.name, kind: x.kind, phone: x.phone ?? null, address: x.address ?? null, notes: x.notes ?? null, ...prov(p) }).select("id").single());
      return { id: row.id };
    }
    case "create_case": {
      const x = a as WriteArgs<"create_case">;
      const fd = date(x.facts_date);
      const row = must(await db.from("cases").insert({
        client_id: resolveRef(x.client, refs) ?? null,
        title: x.title ?? null, case_number: x.case_number ?? null, case_year: x.case_year ?? null,
        court: x.court ?? null, circuit: circuitText(x.circuit), case_type: x.case_type ?? null,
        stage: x.stage, previous_stage_case_id: resolveRef(x.previous_stage_case, refs) ?? null,
        client_role: x.client_role ?? null,
        facts_date: fd?.iso ?? null, facts_date_precision: fd?.precision ?? "unknown",
        summary: x.summary ?? null, ...prov(p),
      }).select("id").single());
      // every case gets its own chat thread
      await db.from("chat_threads").insert({ case_id: row.id, title: x.title ?? x.case_number ?? null });
      return { id: row.id };
    }
    case "update_case": {
      const x = a as WriteArgs<"update_case">;
      const id = resolveRef(x.case, refs)!;
      const fd = date(x.facts_date);
      const patch: Database["public"]["Tables"]["cases"]["Update"] = { updated_at: new Date().toISOString() };
      for (const k of ["title", "case_number", "case_year", "court", "circuit", "case_type", "stage", "status", "client_role", "summary"] as const) {
        if (x[k] !== undefined) (patch as Record<string, unknown>)[k] = x[k];
      }
      if (fd) { patch.facts_date = fd.iso; patch.facts_date_precision = fd.precision; }
      if (x.circuit !== undefined) patch.circuit = circuitText(x.circuit);
      must(await db.from("cases").update(patch).eq("id", id).select("id").single());
      return { id };
    }
    case "add_party": {
      const x = a as WriteArgs<"add_party">;
      const row = must(await db.from("case_parties").insert({
        case_id: resolveRef(x.case, refs)!, name: x.name, role: x.role, is_our_client: x.is_our_client,
        client_id: resolveRef(x.client, refs) ?? null, representative: x.representative ?? null, notes: x.notes ?? null, ...prov(p),
      }).select("id").single());
      return { id: row.id };
    }
    case "add_fact": {
      const x = a as WriteArgs<"add_fact">;
      const d = date(x.date);
      const row = must(await db.from("case_facts").insert({
        case_id: resolveRef(x.case, refs)!, fact_date: d?.iso ?? null, date_precision: d?.precision ?? "unknown",
        date_text: x.date_text ?? x.date ?? null, text: x.text, ...prov(p),
      }).select("id").single());
      return { id: row.id };
    }
    case "add_request": {
      const x = a as WriteArgs<"add_request">;
      const row = must(await db.from("case_requests").insert({ case_id: resolveRef(x.case, refs)!, text: x.text, kind: x.kind ?? null, ...prov(p) }).select("id").single());
      return { id: row.id };
    }
    case "add_argument": {
      const x = a as WriteArgs<"add_argument">;
      const row = must(await db.from("case_arguments").insert({ case_id: resolveRef(x.case, refs)!, side: x.side, kind: x.kind ?? null, text: x.text, ...prov(p) }).select("id").single());
      return { id: row.id };
    }
    case "add_hearing": {
      const x = a as WriteArgs<"add_hearing">;
      const d = date(x.date)!;
      const row = must(await db.from("hearings").insert({ case_id: resolveRef(x.case, refs)!, hearing_date: d.iso, purpose: x.purpose ?? null, ...prov(p) }).select("id").single());
      return { id: row.id };
    }
    case "record_decision": {
      const x = a as WriteArgs<"record_decision">;
      const id = resolveRef(x.hearing, refs)!;
      // a decision can only be recorded for a hearing that has happened (today or before, Africa/Cairo)
      const { data: hh } = await db.from("hearings").select("hearing_date").eq("id", id).maybeSingle();
      if (hh && hh.hearing_date > todayIso()) throw new Error(`لا يمكن تسجيل قرار لجلسة لم تُعقد بعد (${formatDmy(hh.hearing_date)})`);
      const nd = date(x.next_date);
      const { data, error } = await db.rpc("record_hearing_decision", {
        p_hearing_id: id, p_decision: x.decision, p_decision_text: x.decision_text ?? undefined,
        p_next_date: nd?.iso ?? undefined, p_next_requirements: x.next_requirements ?? undefined,
        p_source_kind: p.source_kind, p_created_by_kind: p.created_by_kind,
        p_source_message_id: p.source_message_id ?? undefined, p_source_document_id: p.source_document_id ?? undefined,
        p_source_page: p.source_page ?? undefined, p_source_quote: p.source_quote ?? undefined,
      });
      if (error) throw new Error(error.message);
      return { id, extra: data as Record<string, unknown> };
    }
    case "add_judgment": {
      const x = a as WriteArgs<"add_judgment">;
      const d = date(x.date);
      const dl = date(x.appeal_deadline);
      const row = must(await db.from("judgments").insert({
        case_id: resolveRef(x.case, refs)!, hearing_id: resolveRef(x.hearing, refs) ?? null, judgment_date: d?.iso ?? null,
        kind: x.kind, operative_text: x.operative_text, outcome: x.outcome ?? null,
        appeal_deadline: dl?.iso ?? null, appeal_deadline_note: x.appeal_deadline_note ?? null, ...prov(p),
      }).select("id").single());
      return { id: row.id };
    }
    case "attach_document": {
      const x = a as WriteArgs<"attach_document">;
      const id = resolveRef(x.document, refs)!;
      must(await db.from("documents").update({ case_id: resolveRef(x.case, refs)!, doc_type: x.doc_type, ...(x.title ? { title: x.title } : {}) }).eq("id", id).select("id").single());
      return { id };
    }
  }
}
