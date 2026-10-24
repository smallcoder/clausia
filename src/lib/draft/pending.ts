import "server-only";
/**
 * The changes Clausia proposed to one draft and the lawyer has not decided yet (PR 7b), for the editor to draw as tracked changes. They are the open
 * `edit_draft` ops of the case's open cards (read through RLS, this case only): the same ops the chat card shows, so a tap in either place decides the
 * same change. Nothing is written here.
 */
import type { Proposal } from "@/lib/proposals";
import type { Db } from "@/lib/supabase/server";
import type { ChangeArgs, ResolvedCite } from "./changes";

export interface PendingChange {
  proposalId: string;
  opId: string;
  args: ChangeArgs;
  label: string;
  why: string;
  /** a paragraph taken from a paper: the words code read off the page when the change was proposed */
  cite: ResolvedCite | null;
}

export async function loadDraftChanges(db: Db, caseId: string, draftId: string): Promise<PendingChange[]> {
  const { data, error } = await db.from("proposals").select("*").eq("case_id", caseId).in("status", ["pending", "partially_confirmed"]).order("created_at");
  if (error) throw new Error(`proposals: ${error.message}`);
  const out: PendingChange[] = [];
  for (const p of (data ?? []) as unknown as Proposal[]) {
    for (const o of p.ops) {
      if (o.tool !== "edit_draft" || o.status !== "pending" || o.args.draft !== draftId) continue;
      const a = o.args as Record<string, unknown>;
      const kind = a.kind === "add" ? "add" : "replace";
      const cite = o.edit?.cite && o.edit.src ? { text: o.edit.after, src: o.edit.src, doc: o.edit.cite.doc, page: o.edit.cite.page } : null;
      out.push({
        proposalId: p.id, opId: o.op_id, label: String(a.label ?? "تعديل"), why: String(a.why ?? ""), cite,
        args: { kind, block: String(a.block ?? ""), old_text: typeof a.old_text === "string" ? a.old_text : undefined, new_text: typeof a.new_text === "string" ? a.new_text : undefined, style: a.style === "h" ? "h" : a.style === "p" ? "p" : undefined },
      });
    }
  }
  return out;
}
