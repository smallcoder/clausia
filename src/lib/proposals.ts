import "server-only";
/**
 * Confirmation cards. The assistant's write tools and the document reader both call `createProposal`;
 * the card UI calls `decideProposal` (wrapped as a server action by the chat feature).
 * Nothing reaches the content tables until `decideProposal` runs for that op.
 */
import { normalizeDigits } from "@/lib/dates";
import type { Db } from "@/lib/supabase/server";
import type { Json } from "@/lib/db/types";
import { applyOp, type Provenance, type RefMap } from "@/lib/tools/apply";
import { WRITE_TOOL_ARGS, isWriteTool, type WriteTool } from "@/lib/tools/registry";

export interface OpSource {
  kind: "chat" | "document";
  message_id?: string | null;
  document_id?: string | null;
  page?: number | null;
  quote?: string | null;
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
}

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

/** Loose match: digits normalised, diacritics/tatweel/punctuation and spacing ignored, alef/ya/ta-marbuta folded. */
export function normalizeForMatch(s: string): string {
  return normalizeDigits(s)
    .replace(/[ً-ْـ]/g, "")
    .replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();
}

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
    return {
      op_id: `op${i + 1}`,
      tool: o.tool,
      args: o.args,
      source: { ...o.source, quote },
      quote_verified: verifyQuote(quote, input.sourceTexts),
      status: "pending",
    };
  });
  const { data, error } = await db.from("proposals").insert({
    thread_id: input.threadId ?? null, message_id: input.messageId ?? null, case_id: input.caseId ?? null,
    document_id: input.documentId ?? null, ops: ops as unknown as Json,
  }).select("*").single();
  if (error) throw new Error(error.message);
  return data as unknown as Proposal;
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
): Promise<Proposal> {
  const p = await getProposal(db, proposalId);
  if (!p) throw new Error("البطاقة غير موجودة");
  const { data: { user } } = await db.auth.getUser();
  const chosen = new Set(decision.opIds ?? p.ops.filter((o) => o.status === "pending").map((o) => o.op_id));

  const refs: RefMap = {};
  for (const o of p.ops) {
    const r = o.args.ref as string | undefined;
    if (r && o.result_id && (o.status === "confirmed" || o.status === "suggested")) refs[r] = o.result_id;
  }

  for (const o of p.ops) {
    if (!chosen.has(o.op_id) || o.status !== "pending" && o.status !== "failed") continue;
    if (decision.mode === "reject") { o.status = "rejected"; continue; }
    const edit = decision.edits?.[o.op_id];
    const args = edit ? { ...o.args, ...edit } : o.args;
    const provenance: Provenance = {
      review_status: decision.mode === "suggest" ? "suggested" : "confirmed",
      created_by_kind: edit ? "lawyer" : "model",
      source_kind: o.source.kind,
      source_message_id: o.source.message_id ?? null,
      source_document_id: o.source.document_id ?? null,
      source_page: o.source.page ?? null,
      source_quote: (args.quote as string | undefined) ?? o.source.quote ?? null,
    };
    try {
      const res = await applyOp(db, o.tool, args, provenance, refs);
      o.status = decision.mode === "suggest" ? "suggested" : "confirmed";
      o.result_id = res.id;
      o.error = null;
      if (edit) { o.args = args; o.edited = true; }
      const r = args.ref as string | undefined;
      if (r) refs[r] = res.id;
    } catch (e) {
      o.status = "failed";
      o.error = e instanceof Error ? e.message : String(e);
    }
  }

  const all = p.ops.map((o) => o.status);
  const status: Proposal["status"] = all.every((s) => s === "rejected")
    ? "rejected"
    : all.every((s) => s === "confirmed" || s === "suggested" || s === "rejected") ? "confirmed"
    : all.some((s) => s === "confirmed" || s === "suggested") ? "partially_confirmed" : "pending";

  // a card that created the case is from then on «this case's» card
  const createdCase = p.ops.find((o) => o.tool === "create_case" && o.result_id && (o.status === "confirmed" || o.status === "suggested"));
  const caseId = p.case_id ?? createdCase?.result_id ?? null;

  const { data, error } = await db.from("proposals").update({
    ops: p.ops as unknown as Json, status, case_id: caseId, decided_at: new Date().toISOString(), decided_by: user?.id ?? null,
  }).eq("id", p.id).select("*").single();
  if (error) throw new Error(error.message);
  return data as unknown as Proposal;
}
