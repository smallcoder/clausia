import "server-only";
/**
 * «تراجع» after a confirm (split layout, PR 2b). The RLS-bound client only; nothing is written by the model.
 *
 *  - `logConfirm`: called by `decideProposal` after a confirm is saved. Writes ONE `proposal_events` row (action 'confirm')
 *    with what is needed to put exactly that back: per op, the undo steps (rows to delete, columns to restore, with the
 *    row as it stood right after the op) and the op as it was; and the card as it was.
 *  - `undoConfirm`: the lawyer's tap on «تراجع». Allowed once, and only for UNDO_WINDOW_MS (+ a few seconds of slack,
 *    server clock). If a row changed since the confirm it refuses and changes nothing. Otherwise it reverts the ops in
 *    reverse order, sets them back to pending (so the card and the page highlights come back) and logs action 'undo'.
 *
 * A confirm that cannot be reverted later (a new case, a judgment) is still logged, with no undo data: no toast.
 */
import type { Json } from "@/lib/db/types";
import { getProposal, statusOfOps, type Proposal, type ProposalOp } from "@/lib/proposals";
import type { Db } from "@/lib/supabase/server";
import type { UndoStep } from "@/lib/tools/apply";

/** The toast's time. The server accepts a few seconds more (network, a slow tap), never less. */
export const UNDO_WINDOW_MS = 10_000;
export const UNDO_SLACK_MS = 5_000;

type OpBefore = Pick<ProposalOp, "status" | "result_id" | "error" | "args" | "edited" | "resolved_from">;
interface ConfirmData {
  ops: { op_id: string; before: OpBefore; steps: UndoStep[] }[];
  proposal: { status: Proposal["status"]; case_id: string | null; decided_at: string | null; decided_by: string | null };
}

export type UndoResult = { ok: true; count: number } | { ok: false; error: string };

/** Writes the confirm event. Returns its id when it can be undone later (else null). Never throws: a log failure must not undo a save. */
export async function logConfirm(
  db: Db,
  input: {
    proposalId: string; userId: string | null; at: number;
    applied: { op_id: string; before: OpBefore; steps: UndoStep[] | null }[];
    proposalBefore: ConfirmData["proposal"];
  },
): Promise<string | null> {
  const undoable = input.applied.length > 0 && input.applied.every((a) => a.steps !== null);
  const data: ConfirmData | null = undoable
    ? { ops: input.applied.map((a) => ({ op_id: a.op_id, before: a.before, steps: a.steps! })), proposal: input.proposalBefore }
    : null;
  const { data: row, error } = await db.from("proposal_events").insert({
    proposal_id: input.proposalId, op_ids: input.applied.map((a) => a.op_id), action: "confirm",
    undo_data: data as unknown as Json, created_by: input.userId, created_at: new Date(input.at).toISOString(),
  }).select("id").single();
  if (error || !row) {
    console.error(`[undo] confirm of ${input.proposalId} not logged: ${error?.message ?? "no row"}`);
    return null;
  }
  return undoable ? row.id : null;
}

/** Same value, whatever the key order. */
const same = (a: unknown, b: unknown) => {
  const norm = (v: unknown): unknown => Array.isArray(v) ? v.map(norm)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : 1)).map(([k, x]) => [k, norm(x)])) : v;
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
};

const REFUSE_CHANGED = "فيه حاجة اتغيّرت بعد التأكيد، فمرجّعتش حاجة. عدّلها بإيدك.";

/** Undoes the confirm events of one tap (the page bar can confirm several cards in a row), newest first. Stops at the first refusal. */
export async function undoConfirms(db: Db, eventIds: string[], opts: { now?: number } = {}): Promise<UndoResult> {
  let count = 0;
  for (const id of [...eventIds].reverse()) {
    const r = await undoConfirm(db, id, opts);
    if (!r.ok) return count ? { ok: false, error: `${r.error} (اتراجع عن ${count} بس)` } : r;
    count += r.count;
  }
  return { ok: true, count };
}

export async function undoConfirm(db: Db, eventId: string, opts: { now?: number } = {}): Promise<UndoResult> {
  const now = opts.now ?? Date.now();
  const { data: ev } = await db.from("proposal_events").select("*").eq("id", eventId).maybeSingle();
  if (!ev || ev.action !== "confirm") return { ok: false, error: "مفيش تعديل يتراجع عنه" };
  const data = ev.undo_data as unknown as ConfirmData | null;
  if (!data) return { ok: false, error: "التأكيد ده مايتراجعش عنه" };

  const { data: done } = await db.from("proposal_events").select("id").eq("undoes_event_id", ev.id).limit(1);
  if (done?.length) return { ok: false, error: "اتراجع عن التأكيد ده قبل كده" };
  if (now - Date.parse(ev.created_at) > UNDO_WINDOW_MS + UNDO_SLACK_MS) return { ok: false, error: "فات وقت التراجع (10 ثواني)" };

  const p = await getProposal(db, ev.proposal_id);
  if (!p) return { ok: false, error: "البطاقة غير موجودة" };
  if (!data.ops.every((o) => p.ops.find((x) => x.op_id === o.op_id)?.status === "confirmed")) return { ok: false, error: REFUSE_CHANGED };

  // the last op first; inside one op the steps keep the order they were made for (a hearing stops pointing at the new next one before that one is deleted)
  const order = [...data.ops].reverse();

  // 1) nothing is touched unless every row is as the confirm left it. A row an LATER step of this undo also changes is only
  //    checked once (at the first step that meets it: the newest change), since the older step starts from that.
  const seen = new Set<string>();
  for (const o of order) {
    for (const st of o.steps) {
      const key = `${st.table}:${st.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!st.after) return { ok: false, error: REFUSE_CHANGED };
      const cols = st.op === "delete" ? "*" : Object.keys(st.after).join(",");
      const { data: now_ } = await db.from(st.table).select(cols).eq("id", st.id).maybeSingle();
      if (!now_ || !same(now_, st.after)) return { ok: false, error: REFUSE_CHANGED };
    }
  }

  // 2) claim the undo (the unique index on undoes_event_id: of two taps at once only one gets through), then 3) revert
  const { data: { user } } = await db.auth.getUser();
  const { error: claim } = await db.from("proposal_events").insert({
    proposal_id: p.id, op_ids: ev.op_ids, action: "undo", undoes_event_id: ev.id, created_by: user?.id ?? null, created_at: new Date(now).toISOString(),
  });
  if (claim) return { ok: false, error: "اتراجع عن التأكيد ده قبل كده" };
  try {
    for (const o of order) {
      for (const st of o.steps) {
        if (st.op === "delete") {
          const { data: r, error } = await db.from(st.table).delete().eq("id", st.id).select("id");
          if (error || !r?.length) throw new Error(error?.message ?? "row not deleted");
        } else {
          const { data: r, error } = await db.from(st.table).update(st.cols as never).eq("id", st.id).select("id");
          if (error || !r?.length) throw new Error(error?.message ?? "row not restored");
        }
      }
    }
  } catch (e) {
    // the checks above passed, so this is rare (a row another row points at); the tap is used up, the lawyer is told to look
    console.error(`[undo] undo of ${ev.id} stopped half way: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, error: "التراجع ما اكتملش. راجع الصفحة." };
  }

  // 4) the card is open again: the ops as they were, the card's status and decision as they were
  for (const o of data.ops) {
    const op = p.ops.find((x) => x.op_id === o.op_id)!;
    op.status = o.before.status;
    op.result_id = o.before.result_id ?? null;
    op.error = o.before.error ?? null;
    op.args = o.before.args;
    if (o.before.edited) op.edited = true; else delete op.edited;
    if (o.before.resolved_from) op.resolved_from = o.before.resolved_from; else delete op.resolved_from;
  }
  const { error: pe } = await db.from("proposals").update({
    ops: p.ops as unknown as Json, status: statusOfOps(p.ops), case_id: data.proposal.case_id,
    decided_at: data.proposal.decided_at, decided_by: data.proposal.decided_by,
  }).eq("id", p.id);
  if (pe) console.error(`[undo] rows of ${ev.id} reverted but the card ${p.id} was not reopened: ${pe.message}`);

  return { ok: true, count: data.ops.length };
}
