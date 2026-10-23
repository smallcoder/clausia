import "server-only";
/**
 * Confirmation cards. The assistant's write tools and the document reader both call `createProposal`;
 * the card UI calls `decideProposal` (wrapped as a server action by the chat feature).
 * Nothing reaches the content tables until `decideProposal` runs for that op.
 */
import { deadlinesEnabled } from "@/lib/flags";
import { normalizeForMatch } from "@/lib/quote-match";
import type { Db } from "@/lib/supabase/server";
import type { Json } from "@/lib/db/types";
import { applyOp, type Provenance, type RefMap, type Undo, type UndoStep } from "@/lib/tools/apply";
import { logConfirm } from "@/lib/undo";
import { OP_TITLE, WRITE_TOOL_ARGS, isWriteTool, type WriteTool } from "@/lib/tools/registry";

export interface OpSource {
  kind: "chat" | "document";
  message_id?: string | null;
  document_id?: string | null;
  page?: number | null;
  quote?: string | null;
  /**
   * Where `quote` sits in the page's ORIGINAL text (page_text.slice(char_start, char_end)), worked out by code when
   * the quote was checked against the page (src/lib/quote-match.ts), never by the model. Only for document sources;
   * absent when the quote was not verified or the span could not be mapped.
   */
  char_start?: number | null;
  char_end?: number | null;
}

export interface ProposalOp {
  op_id: string; // "op1", "op2", ...
  tool: WriteTool;
  args: Record<string, unknown>;
  source: OpSource;
  /** false = the quote was not found in the source text: the card shows a warning. */
  quote_verified: boolean;
  status: "pending" | "confirmed" | "suggested" | "rejected" | "failed";
  result_id?: string | null;
  error?: string | null;
  edited?: boolean;
  /**
   * Date args that code worked out from a relative word in the lawyer's message (src/lib/relative-days.ts):
   * arg key → the word and its date. The card shows «بكرة = الخميس 22/10/2026» next to that field; the lawyer's
   * edit of that field drops it.
   */
  resolved_from?: Record<string, ResolvedFrom>;
}

export interface ResolvedFrom { word: string; iso: string; label: string }

export interface Proposal {
  id: string;
  thread_id: string | null;
  message_id: string | null;
  case_id: string | null;
  document_id: string | null;
  ops: ProposalOp[];
  status: "pending" | "confirmed" | "partially_confirmed" | "rejected";
  created_at: string;
}

export { normalizeForMatch };

/** True when the quote appears in one of the source texts (lawyer's messages or the document page). */
export function verifyQuote(quote: string | null | undefined, sourceTexts: string[]): boolean {
  if (!quote) return false;
  const q = normalizeForMatch(quote);
  if (q.length < 2) return false;
  return sourceTexts.some((t) => normalizeForMatch(t).includes(q));
}

export interface DraftOp {
  tool: string;
  args: Record<string, unknown>;
  source: OpSource;
  resolved_from?: Record<string, ResolvedFrom>;
  /** the texts THIS op's quote must come from (default: the card's `sourceTexts`): a column cell is checked against its own paper */
  sourceTexts?: string[];
}

/**
 * Validate the drafted ops and store one card. Throws with an Arabic message the model can act on
 * (e.g. «تاريخ غير واضح») if any op is invalid — the chat loop returns that to the model so it asks the lawyer.
 * `sourceTexts`: the texts the quotes must come from (lawyer messages in this thread, or the document pages).
 */
export async function createProposal(
  db: Db,
  input: { threadId?: string | null; messageId?: string | null; caseId?: string | null; documentId?: string | null; ops: DraftOp[]; sourceTexts: string[] },
): Promise<Proposal> {
  const ops: ProposalOp[] = input.ops.map((o, i) => {
    if (!isWriteTool(o.tool)) throw new Error(`أداة غير معروفة: ${o.tool}`);
    const parsed = WRITE_TOOL_ARGS[o.tool].safeParse(o.args);
    if (!parsed.success) throw new Error(`${o.tool}: ${parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`);
    const quote = (o.args.quote as string | undefined) ?? o.source.quote ?? null;
    const verified = verifyQuote(quote, o.sourceTexts ?? input.sourceTexts);
    // a verified paper quote should carry its span (the callers map it with code); if one does not, no span is stored
    // and the panel finds the sentence with the same matcher when it opens
    if (verified && o.source.kind === "document" && (o.source.char_start == null || o.source.char_end == null)) {
      console.warn(`[proposals] verified quote with no span (op ${i + 1} ${o.tool}, document ${o.source.document_id ?? "?"}, page ${o.source.page ?? "?"})`);
    }
    return {
      op_id: `op${i + 1}`,
      tool: o.tool,
      args: o.args,
      source: { ...o.source, quote },
      quote_verified: verified,
      status: "pending",
      ...(o.resolved_from && Object.keys(o.resolved_from).length ? { resolved_from: o.resolved_from } : {}),
    };
  });
  const { data, error } = await db.from("proposals").insert({
    thread_id: input.threadId ?? null, message_id: input.messageId ?? null, case_id: input.caseId ?? null,
    document_id: input.documentId ?? null, ops: ops as unknown as Json,
  }).select("*").single();
  if (error) throw new Error(error.message);
  return data as unknown as Proposal;
}

/** The «بكرة = …» notes that still hold after an edit: a field whose value the lawyer changed loses its note. */
export function withoutEdited(
  resolved: Record<string, ResolvedFrom> | undefined, args: Record<string, unknown>, edit: Record<string, unknown>,
): Record<string, ResolvedFrom> | undefined {
  if (!resolved) return undefined;
  const kept = Object.entries(resolved).filter(([k]) => !(k in edit) || edit[k] === args[k]);
  return kept.length ? Object.fromEntries(kept) : undefined;
}

/** The card's status from its ops. */
export function statusOfOps(ops: Pick<ProposalOp, "status">[]): Proposal["status"] {
  const all = ops.map((o) => o.status);
  return all.every((s) => s === "rejected")
    ? "rejected"
    : all.every((s) => s === "confirmed" || s === "suggested" || s === "rejected") ? "confirmed"
    : all.some((s) => s === "confirmed" || s === "suggested") ? "partially_confirmed" : "pending";
}

export async function getProposal(db: Db, id: string): Promise<Proposal | null> {
  const { data } = await db.from("proposals").select("*").eq("id", id).maybeSingle();
  return (data as unknown as Proposal) ?? null;
}

/**
 * The lawyer's tap. `mode`: 'confirm' (save as confirmed), 'suggest' (save, flagged «مقترح» for later review),
 * 'reject' (save nothing). `opIds` = which ops (default: all pending). `edits` = lawyer's changes per op.
 * Ops run in card order; "@ref" args resolve to ids created by earlier ops of the same card.
 */
export async function decideProposal(
  db: Db,
  proposalId: string,
  decision: { mode: "confirm" | "suggest" | "reject"; opIds?: string[]; edits?: Record<string, Record<string, unknown>> },
): Promise<Proposal & { undo_event_id?: string | null }> {
  const p = await getProposal(db, proposalId);
  if (!p) throw new Error("البطاقة غير موجودة");
  const row = p as Proposal & { decided_at?: string | null; decided_by?: string | null };
  const proposalBefore = { status: p.status, case_id: p.case_id, decided_at: row.decided_at ?? null, decided_by: row.decided_by ?? null };
  const { data: { user } } = await db.auth.getUser();
  const chosen = new Set(decision.opIds ?? p.ops.filter((o) => o.status === "pending").map((o) => o.op_id));

  const refs: RefMap = {};
  for (const o of p.ops) {
    const r = o.args.ref as string | undefined;
    if (r && o.result_id && (o.status === "confirmed" || o.status === "suggested")) refs[r] = o.result_id;
  }

  // all or nothing (owner decision 2026-10-21): if one chosen op fails, the ops already applied in this tap are
  // undone and the card stays as it was, so a failure never leaves a half-saved card
  const before = p.ops.map((o) => ({ status: o.status, result_id: o.result_id, error: o.error, args: o.args, edited: o.edited, resolved_from: o.resolved_from }));
  const undos: Undo[] = [];
  /** what «تراجع» needs, per op saved by this tap */
  const applied: { op_id: string; before: (typeof before)[number]; steps: UndoStep[] | null }[] = [];
  const newJudgments: string[] = [];
  let failure: { index: number; title: string; error: string } | null = null;

  for (const o of p.ops) {
    if (failure) break;
    if (!chosen.has(o.op_id) || o.status !== "pending" && o.status !== "failed") continue;
    if (decision.mode === "reject") { o.status = "rejected"; continue; }
    const edit = decision.edits?.[o.op_id];
    const args = edit ? { ...o.args, ...edit } : o.args;
    const provenance: Provenance = {
      review_status: decision.mode === "suggest" ? "suggested" : "confirmed",
      created_by_kind: edit ? "lawyer" : "model",
      client_by_lawyer: !!edit && "client" in edit && edit.client !== o.args.client,
      source_kind: o.source.kind,
      source_message_id: o.source.message_id ?? null,
      source_document_id: o.source.document_id ?? null,
      source_page: o.source.page ?? null,
      source_quote: (args.quote as string | undefined) ?? o.source.quote ?? null,
      // the span belongs to the quote the model gave; a quote the lawyer rewrote has none (the panel finds it again)
      ...(edit && "quote" in edit && edit.quote !== o.args.quote ? {} : { source_char_start: o.source.char_start ?? null, source_char_end: o.source.char_end ?? null }),
    };
    try {
      const res = await applyOp(db, o.tool, args, provenance, refs);
      undos.push(res.undo);
      applied.push({ op_id: o.op_id, before: before[p.ops.indexOf(o)], steps: res.steps });
      if (o.tool === "add_judgment" && decision.mode === "confirm") newJudgments.push(res.id);
      o.status =decision.mode === "suggest" ? "suggested" : "confirmed";
      o.result_id = res.id;
      o.error = null;
      if (edit) {
        // a date the lawyer changed is the lawyer's own now, not the one worked out from «بكرة»
        const resolved = withoutEdited(o.resolved_from, o.args, edit);
        o.args = args;
        o.edited = true;
        if (resolved) o.resolved_from = resolved; else delete o.resolved_from;
      }
      const r = args.ref as string | undefined;
      if (r) refs[r] = res.id;
    } catch (e) {
      failure = { index: p.ops.indexOf(o), title: OP_TITLE[o.tool] ?? o.tool, error: e instanceof Error ? e.message : String(e) };
    }
  }

  if (failure) {
    const undoErrors: string[] = [];
    for (const u of undos.reverse()) {
      try { await u(); } catch (e) { undoErrors.push(e instanceof Error ? e.message : String(e)); }
    }
    if (undoErrors.length) console.error(`[proposals] undo after a failed save of ${p.id} incomplete: ${undoErrors.join("; ")}`);
    p.ops.forEach((o, i) => Object.assign(o, before[i]));
    Object.assign(p.ops[failure.index], { status: "failed", error: failure.error });
    const { error } = await db.from("proposals").update({ ops: p.ops as unknown as Json }).eq("id", p.id);
    if (error) console.error(`[proposals] could not mark the failed op on ${p.id}: ${error.message}`);
    console.error(`[proposals] save of ${p.id} undone: ${failure.title}: ${failure.error}`);
    // the raw reason stays on the op (shown under it); the lawyer gets one plain sentence
    throw new Error(`ماتحفظش حاجة من البطاقة: «${failure.title}» ما اتحفظش. البطاقة زي ما هي، جرّب تاني.`);
  }

  const status = statusOfOps(p.ops);

  // a card that created the case is from then on «this case's» card
  const createdCase = p.ops.find((o) => o.tool === "create_case" && o.result_id && (o.status === "confirmed" || o.status === "suggested"));
  const caseId = p.case_id ?? createdCase?.result_id ?? null;

  const { data, error } = await db.from("proposals").update({
    ops: p.ops as unknown as Json, status, case_id: caseId, decided_at: new Date().toISOString(), decided_by: user?.id ?? null,
  }).eq("id", p.id).select("*").single();
  if (error) throw new Error(error.message);

  // the confirm goes in the log (and, when it can be reverted, «تراجع» can find it): only a tap on «أكّد», not «as suggestions»
  let undoEventId: string | null = null;
  if (decision.mode === "confirm" && applied.length) {
    undoEventId = await logConfirm(db, { proposalId: p.id, userId: user?.id ?? null, at: Date.now(), applied, proposalBefore });
  }

  // a judgment was just saved (confirmed, not «as a suggestion»): propose the appeal-deadlines card, made by code. A failure here
  // (LawMill down, no thread) never undoes the judgment the lawyer confirmed.
  if (decision.mode === "confirm" && deadlinesEnabled()) {
    for (const j of newJudgments) {
      try {
        const { proposeDeadlinesForJudgment } = await import("@/lib/deadlines/propose"); // lazy: propose.ts imports this file
        await proposeDeadlinesForJudgment(db, { judgmentId: j, threadId: p.thread_id });
      } catch (e) {
        console.error(`[deadlines] card for judgment ${j} not proposed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return { ...(data as unknown as Proposal), undo_event_id: undoEventId };
}
