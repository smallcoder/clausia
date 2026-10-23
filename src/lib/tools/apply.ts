import "server-only";
/**
 * Execute ONE write op (after the lawyer confirmed it, or for the lawyer's own inline edits).
 * Uses the caller's RLS-bound client, so a user can only ever write into their own office.
 */
import { formatDmy, parseDmy, todayIso } from "@/lib/dates";
import { buildDeadlines } from "@/lib/deadlines/service";
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
  /** where the quote sits in the page's original text (null for old rows, chat and manual sources) */
  source_char_start?: number | null;
  source_char_end?: number | null;
  /** the lawyer set or changed the `client` value itself (an edit of a card, or the manual picker): only then may update_case replace an existing client */
  client_by_lawyer?: boolean;
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

/** A client id must be one this lawyer can read (RLS): a foreign key alone would accept another office's id. */
async function visibleClient(db: Db, id: string): Promise<string> {
  const { data } = await db.from("clients").select("id").eq("id", id).maybeSingle();
  if (!data) throw new Error("الموكل غير موجود");
  return id;
}

function date(v: string | undefined) {
  const p = parseDmy(v);
  return p ? { iso: p.iso, precision: p.precision } : null;
}

/** A span is stored only as a real range on a paper source; anything else is null (the tables check the same). */
function span(p: Provenance): { source_char_start: number | null; source_char_end: number | null } {
  const s = p.source_char_start;
  const e = p.source_char_end;
  const ok = p.source_kind === "document" && !!p.source_document_id && Number.isInteger(s) && Number.isInteger(e) && s! >= 0 && e! > s!;
  return ok ? { source_char_start: s!, source_char_end: e! } : { source_char_start: null, source_char_end: null };
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
    ...span(p),
  };
}

function must<R extends { data: unknown; error: { message: string } | null }>(r: R): NonNullable<R["data"]> {
  if (r.error) throw new Error(r.error.message);
  if (r.data === null || r.data === undefined) throw new Error("no row returned");
  return r.data as NonNullable<R["data"]>;
}

/** Puts the database back as it was before one applied op (a card is saved all or nothing). */
export type Undo = () => Promise<void>;

type Table = "clients" | "cases" | "case_parties" | "case_facts" | "case_requests" | "case_arguments" | "hearings" | "judgments" | "doc_columns" | "doc_column_cells" | "case_deadlines" | "documents";
const del = (db: Db, table: Table, id: string): Undo => async () => { must(await db.from(table).delete().eq("id", id).select("id")); };

/**
 * The same undo as DATA (for «تراجع» after a confirm, src/lib/undo.ts): what to delete, what to write back. Mirrors the
 * closures above one to one. `after` = the row as it stood right after the op (a deleted row: all columns; a restored row:
 * the columns the op changed). A later undo compares it with the row NOW and refuses when someone changed the row since.
 */
export type UndoStep =
  | { op: "delete"; table: Table; id: string; after?: Record<string, unknown> }
  | { op: "restore"; table: Table; id: string; cols: Record<string, unknown>; after?: Record<string, unknown> };
const rm = (table: Table, id: string): UndoStep[] => [{ op: "delete", table, id }];
const back = (table: Table, id: string, cols: Record<string, unknown>): UndoStep => ({ op: "restore", table, id, cols });

export interface Applied {
  id: string;
  extra?: Record<string, unknown>;
  /** puts the database back as it was (in memory, for a card that fails half way) */
  undo: Undo;
  /** the same as data, for «تراجع» later; null = this op cannot be undone later (create_case, add_judgment) */
  steps: UndoStep[] | null;
}

/** Validate + execute. Also records the rows the undo will compare against. */
export async function applyOp(db: Db, tool: WriteTool, rawArgs: unknown, p: Provenance, refs: RefMap = {}): Promise<Applied> {
  const r = await applyOpRaw(db, tool, rawArgs, p, refs);
  if (!r.steps) return r;
  for (const st of r.steps) {
    const cols = st.op === "delete" ? "*" : Object.keys(st.cols).join(",");
    const { data } = await db.from(st.table).select(cols).eq("id", st.id).maybeSingle();
    st.after = (data ?? undefined) as unknown as Record<string, unknown> | undefined;
  }
  return r;
}

/** Returns the id of the created/updated row (for @ref resolution) and how to undo it. */
async function applyOpRaw(db: Db, tool: WriteTool, rawArgs: unknown, p: Provenance, refs: RefMap = {}): Promise<Applied> {
  const parsed = WRITE_TOOL_ARGS[tool].safeParse(rawArgs);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const a = parsed.data as WriteArgs<WriteTool>;

  switch (tool) {
    case "create_client": {
      const x = a as WriteArgs<"create_client">;
      const row = must(await db.from("clients").insert({ name: x.name, kind: x.kind, phone: x.phone ?? null, address: x.address ?? null, notes: x.notes ?? null, ...prov(p) }).select("id").single());
      return { id: row.id, undo: del(db, "clients", row.id), steps: rm("clients", row.id) };
    }
    case "create_case": {
      const x = a as WriteArgs<"create_case">;
      const fd = date(x.facts_date);
      const row = must(await db.from("cases").insert({
        client_id: await visibleClient(db, resolveRef(x.client, refs)!),
        title: x.title ?? null, case_number: x.case_number ?? null, case_year: x.case_year ?? null,
        court: x.court ?? null, circuit: circuitText(x.circuit), case_type: x.case_type ?? null,
        stage: x.stage, previous_stage_case_id: resolveRef(x.previous_stage_case, refs) ?? null,
        client_role: x.client_role ?? null,
        facts_date: fd?.iso ?? null, facts_date_precision: fd?.precision ?? "unknown",
        summary: x.summary ?? null, ...prov(p),
      }).select("id").single());
      // every case gets its own chat thread
      await db.from("chat_threads").insert({ case_id: row.id, title: x.title ?? x.case_number ?? null });
      // no later undo: deleting the case would delete the card that made it (proposals.case_id cascades): a GitHub issue
      return { id: row.id, undo: async () => { await db.from("chat_threads").delete().eq("case_id", row.id); await del(db, "cases", row.id)(); }, steps: null };
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
      if (x.client !== undefined) {
        // the lawyer's own pick («حدد الموكل» / «تغيير») may set or change it; a card the model drafted only fills an EMPTY client
        const cur = must(await db.from("cases").select("client_id").eq("id", id).single());
        if (cur.client_id && !p.client_by_lawyer && p.source_kind !== "manual") throw new Error("الدعوى لها موكل بالفعل");
        patch.client_id = await visibleClient(db, resolveRef(x.client, refs)!);
      }
      if (x.circuit !== undefined) patch.circuit = circuitText(x.circuit);
      const before = must(await db.from("cases").select(Object.keys(patch).join(",")).eq("id", id).single()) as unknown as typeof patch;
      must(await db.from("cases").update(patch).eq("id", id).select("id").single());
      return { id, undo: async () => { must(await db.from("cases").update(before).eq("id", id).select("id").single()); }, steps: [back("cases", id, before as Record<string, unknown>)] };
    }
    case "add_party": {
      const x = a as WriteArgs<"add_party">;
      const row = must(await db.from("case_parties").insert({
        case_id: resolveRef(x.case, refs)!, name: x.name, role: x.role, is_our_client: x.is_our_client,
        client_id: x.client ? await visibleClient(db, resolveRef(x.client, refs)!) : null, representative: x.representative ?? null, notes: x.notes ?? null, ...prov(p),
      }).select("id").single());
      return { id: row.id, undo: del(db, "case_parties", row.id), steps: rm("case_parties", row.id) };
    }
    case "add_fact": {
      const x = a as WriteArgs<"add_fact">;
      const d = date(x.date);
      const row = must(await db.from("case_facts").insert({
        case_id: resolveRef(x.case, refs)!, fact_date: d?.iso ?? null, date_precision: d?.precision ?? "unknown",
        date_text: x.date_text ?? x.date ?? null, text: x.text, ...prov(p),
      }).select("id").single());
      return { id: row.id, undo: del(db, "case_facts", row.id), steps: rm("case_facts", row.id) };
    }
    case "add_request": {
      const x = a as WriteArgs<"add_request">;
      const row = must(await db.from("case_requests").insert({ case_id: resolveRef(x.case, refs)!, text: x.text, kind: x.kind ?? null, ...prov(p) }).select("id").single());
      return { id: row.id, undo: del(db, "case_requests", row.id), steps: rm("case_requests", row.id) };
    }
    case "add_argument": {
      const x = a as WriteArgs<"add_argument">;
      const caseId = resolveRef(x.case, refs)!;
      const answers = resolveRef(x.answers, refs);
      if (answers && x.side !== "ours") throw new Error("الرد لازم يكون دفاع من جانبنا (side = ours)");
      // a reply answers ONE defense of the opponent in the same case that has no reply yet (checked before anything is written)
      const target = answers ? (await db.from("case_arguments").select("id, case_id, side, reply_argument_id").eq("id", answers).maybeSingle()).data : null;
      if (answers && !target) throw new Error("الدفع اللي بترد عليه مش موجود");
      if (target && (target.case_id !== caseId || target.side !== "opponent")) throw new Error("الدفع اللي بترد عليه مش من دفوع الخصم في نفس الدعوى");
      if (target?.reply_argument_id) throw new Error("الدفع ده اترد عليه قبل كده");
      const row = must(await db.from("case_arguments").insert({ case_id: caseId, side: x.side, kind: x.kind ?? null, text: x.text, ...prov(p) }).select("id").single());
      if (!target) return { id: row.id, undo: del(db, "case_arguments", row.id), steps: rm("case_arguments", row.id) };
      // link the defense to our reply; if that fails the new row is removed again (a card is saved all or nothing)
      const { data: linked, error: linkErr } = await db.from("case_arguments").update({ reply_argument_id: row.id }).eq("id", target.id).select("id");
      if (linkErr || !linked?.length) {
        await del(db, "case_arguments", row.id)();
        throw new Error(linkErr?.message ?? "ما قدرتش أربط الرد بالدفع");
      }
      return {
        id: row.id,
        // the same order for both: the defense stops pointing at our reply first, then the reply is deleted
        undo: async () => { must(await db.from("case_arguments").update({ reply_argument_id: null }).eq("id", target.id).select("id").single()); await del(db, "case_arguments", row.id)(); },
        steps: [back("case_arguments", target.id, { reply_argument_id: null }), ...rm("case_arguments", row.id)],
      };
    }
    case "add_hearing": {
      const x = a as WriteArgs<"add_hearing">;
      const d = date(x.date)!;
      const row = must(await db.from("hearings").insert({ case_id: resolveRef(x.case, refs)!, hearing_date: d.iso, purpose: x.purpose ?? null, location: x.location ?? null, ...prov(p) }).select("id").single());
      return { id: row.id, undo: del(db, "hearings", row.id), steps: rm("hearings", row.id) };
    }
    case "set_hearing_location": {
      const x = a as WriteArgs<"set_hearing_location">;
      const id = resolveRef(x.hearing, refs)!;
      const before = must(await db.from("hearings").select("location").eq("id", id).single());
      must(await db.from("hearings").update({ location: x.location }).eq("id", id).select("id").single());
      return { id, undo: async () => { must(await db.from("hearings").update({ location: before.location }).eq("id", id).select("id").single()); }, steps: [back("hearings", id, { location: before.location })] };
    }
    case "record_decision": {
      const x = a as WriteArgs<"record_decision">;
      const id = resolveRef(x.hearing, refs)!;
      // a decision can only be recorded for a hearing that has happened (today or before, Africa/Cairo)
      const { data: hh } = await db.from("hearings").select("hearing_date").eq("id", id).maybeSingle();
      if (hh && hh.hearing_date > todayIso()) throw new Error(`لا يمكن تسجيل قرار لجلسة لم تُعقد بعد (${formatDmy(hh.hearing_date)})`);
      const nd = date(x.next_date);
      // what the decision changes: this hearing's decision fields, the next hearing (created or moved), the case status
      const h0 = must(await db.from("hearings").select("*").eq("id", id).single());
      const next0 = h0.next_hearing_id ? must(await db.from("hearings").select("hearing_date, purpose").eq("id", h0.next_hearing_id).single()) : null;
      const case0 = must(await db.from("cases").select("status, updated_at").eq("id", h0.case_id).single());
      const { data, error } = await db.rpc("record_hearing_decision", {
        p_hearing_id: id, p_decision: x.decision, p_decision_text: x.decision_text ?? undefined,
        p_next_date: nd?.iso ?? undefined, p_next_requirements: x.next_requirements ?? undefined,
        p_source_kind: p.source_kind, p_created_by_kind: p.created_by_kind,
        p_source_message_id: p.source_message_id ?? undefined, p_source_document_id: p.source_document_id ?? undefined,
        p_source_page: p.source_page ?? undefined, p_source_quote: p.source_quote ?? undefined,
        p_source_char_start: span(p).source_char_start ?? undefined, p_source_char_end: span(p).source_char_end ?? undefined,
      });
      if (error) throw new Error(error.message);
      const created = !h0.next_hearing_id ? ((data as { next_hearing_id?: string | null } | null)?.next_hearing_id ?? null) : null;
      const { id: _id, office_id: _o, created_at: _c, ...hBack } = h0;
      return {
        id, extra: data as Record<string, unknown>,
        // the same order as `undo`: the hearing first (so it stops pointing at the new next hearing), then that one, the moved one, the case
        steps: [
          back("hearings", id, hBack),
          ...(created ? rm("hearings", created) : []),
          ...(h0.next_hearing_id && next0 ? [back("hearings", h0.next_hearing_id, next0)] : []),
          back("cases", h0.case_id, case0),
        ],
        undo: async () => {
          const { id: _id, office_id: _o, created_at: _c, ...back } = h0;
          must(await db.from("hearings").update(back).eq("id", id).select("id").single());
          if (created) await del(db, "hearings", created)();
          if (h0.next_hearing_id && next0) must(await db.from("hearings").update(next0).eq("id", h0.next_hearing_id).select("id").single());
          must(await db.from("cases").update(case0).eq("id", h0.case_id).select("id").single());
        },
      };
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
      // no later undo: confirming a final judgment proposes the appeal-deadlines card, which would be left pointing at nothing (a GitHub issue)
      return { id: row.id, undo: del(db, "judgments", row.id), steps: null };
    }
    case "attach_document": {
      const x = a as WriteArgs<"attach_document">;
      const id = resolveRef(x.document, refs)!;
      const before = must(await db.from("documents").select("case_id, doc_type, title").eq("id", id).single());
      must(await db.from("documents").update({ case_id: resolveRef(x.case, refs)!, doc_type: x.doc_type, ...(x.title ? { title: x.title } : {}) }).eq("id", id).select("id").single());
      return { id, undo: async () => { must(await db.from("documents").update(before).eq("id", id).select("id").single()); }, steps: [back("documents", id, before)] };
    }
    case "add_doc_column": {
      const x = a as WriteArgs<"add_doc_column">;
      const row = must(await db.from("doc_columns").insert({
        case_id: resolveRef(x.case, refs)!, question: x.question.trim(), title: x.title.trim(),
        review_status: p.review_status, created_by_kind: p.created_by_kind, source_kind: "manual", // the question is typed on the documents page
      }).select("id").single());
      return { id: row.id, undo: del(db, "doc_columns", row.id), steps: rm("doc_columns", row.id) };
    }
    case "add_doc_cell": {
      const x = a as WriteArgs<"add_doc_cell">;
      const columnId = resolveRef(x.column, refs)!;
      const documentId = resolveRef(x.document, refs)!;
      // a cell belongs to a paper of the SAME case as its column
      const [col, doc] = await Promise.all([
        db.from("doc_columns").select("case_id").eq("id", columnId).maybeSingle(),
        db.from("documents").select("case_id").eq("id", documentId).maybeSingle(),
      ]);
      if (!col.data || !doc.data || doc.data.case_id !== col.data.case_id) throw new Error("المستند ده مش من نفس دعوى العمود");
      // an answer is saved only with the page and the verbatim quote that prove it («مش مذكور» has neither)
      const answer = x.answer?.trim() || null;
      if (answer && (!p.source_page || !p.source_quote)) throw new Error("الإجابة لازم يكون ليها صفحة واقتباس من الورقة");
      const row = must(await db.from("doc_column_cells").insert({
        column_id: columnId, document_id: documentId, answer, note: x.note?.trim() || null,
        review_status: p.review_status, created_by_kind: p.created_by_kind, source_kind: "document", source_document_id: documentId,
        source_page: answer ? p.source_page ?? null : null,
        source_quote: answer ? p.source_quote ?? null : null,
        ...(answer ? span({ ...p, source_kind: "document", source_document_id: documentId }) : { source_char_start: null, source_char_end: null }),
      }).select("id").single());
      return { id: row.id, undo: del(db, "doc_column_cells", row.id), steps: rm("doc_column_cells", row.id) };
    }
    case "add_deadline": {
      const x = a as WriteArgs<"add_deadline">;
      // the days and the last day are worked out HERE, by code, from the article text and the approved holidays; only the lawyer's inputs come from the card
      const built = await buildDeadlines(db, {
        caseId: resolveRef(x.case, refs)!, judgmentId: resolveRef(x.judgment, refs)!, kind: x.kind,
        startBasis: x.start_basis, serviceDate: x.service_date, urgent: x.urgent, reminders: x.reminders,
      });
      if (!built.save) throw new Error(built.blocked ?? "ماقدرتش أحسب الميعاد");
      const row = must(await db.from("case_deadlines").insert({
        ...built.save, review_status: p.review_status, created_by_kind: "lawyer", source_kind: "manual", // the lawyer's tap on «حطهم في الأجندة» is the act; code made the numbers
      }).select("id").single());
      return { id: row.id, undo: del(db, "case_deadlines", row.id), steps: rm("case_deadlines", row.id) };
    }
  }
}
