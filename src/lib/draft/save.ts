import "server-only";
/**
 * The writes of the draft editor (PR 7). applyOp (src/lib/tools/apply.ts) calls these for the lawyer's own saves, a restored version and a Word file opened
 * as a draft; the RLS-bound client only, never the admin one. Every write is ALL OR NOTHING:
 *  - a new version row is inserted FIRST, then the draft's body is replaced (only if nobody changed the draft since it was read: the update names the
 *    `updated_at` it read), and if that second step fails the version row is removed again;
 *  - the first edit of a draft also keeps what it was before as an «original» version, so history never starts in the middle;
 *  - a restore is a NEW version (restored_from = the one it copied): no version is ever deleted to «go back».
 * The returned `undo` puts the database back in memory for a card that fails half way; it is never the lawyer's «تراجع» (that is a restore).
 */
import type { Json } from "@/lib/db/types";
import { BodyError, parseBody, sameBody, syncFill, syncLawyerStates } from "@/lib/draft/model";
import type { DraftBody, DraftFill, DraftImport } from "@/lib/library/types";
import type { Db } from "@/lib/supabase/server";
import type { Applied } from "@/lib/tools/apply";

export const STALE = "المسودة اتغيّرت من مكان تاني. افتحها تاني وكمّل من آخر نسخة.";
export type VersionKind = "original" | "save" | "accept" | "restore" | "import";

export interface DraftRow { id: string; case_id: string; title: string; body: DraftBody; fill: DraftFill; updated_at: string; created_at: string; template_id: string | null }

function must<R extends { data: unknown; error: { message: string } | null }>(r: R): NonNullable<R["data"]> {
  if (r.error) throw new Error(r.error.message);
  if (r.data === null || r.data === undefined) throw new Error("no row returned");
  return r.data as NonNullable<R["data"]>;
}

/** One draft this lawyer can read (RLS), its body checked. */
export async function loadDraftRow(db: Db, id: string): Promise<DraftRow> {
  const { data, error } = await db.from("drafts").select("id, case_id, title, body, fill, updated_at, created_at, template_id").eq("id", id).neq("review_status", "rejected").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("المسودة غير موجودة");
  return { ...data, body: parseBody(data.body), fill: data.fill as unknown as DraftFill };
}

export interface Commit { body: DraftBody; kind: VersionKind; note?: string | null; restoredFrom?: string | null }

/** Writes `next` as the draft's body and as a new version, all or nothing. `row` = the draft as it was read. */
export async function commitBody(db: Db, row: DraftRow, next: Commit): Promise<Applied> {
  const made: string[] = [];
  const dropVersions = async () => { if (made.length) await db.from("draft_versions").delete().in("id", made); };
  const { data: any_ } = await db.from("draft_versions").select("id").eq("draft_id", row.id).limit(1);
  if (!any_?.length) {
    const orig = must(await db.from("draft_versions").insert({ draft_id: row.id, body: row.body as unknown as Json, kind: "original", created_at: row.created_at }).select("id").single());
    made.push(orig.id);
  }
  let versionId: string;
  try {
    versionId = must(await db.from("draft_versions").insert({
      draft_id: row.id, body: next.body as unknown as Json, kind: next.kind, note: next.note?.slice(0, 300) ?? null, restored_from: next.restoredFrom ?? null,
    }).select("id").single()).id;
    made.push(versionId);
  } catch (e) { await dropVersions(); throw e; }
  const fill = syncFill(row.fill, next.body);
  const { data: upd, error } = await db.from("drafts")
    .update({ body: next.body as unknown as Json, fill: fill as unknown as Json, updated_at: new Date().toISOString() })
    .eq("id", row.id).eq("updated_at", row.updated_at).select("updated_at");
  if (error || !upd?.length) { await dropVersions(); throw new Error(error ? error.message : STALE); }
  return {
    id: row.id,
    extra: { version_id: versionId, updated_at: upd[0].updated_at },
    steps: null, // «تراجع» for a draft is a restore of the version before (history), not the 10-second toast
    undo: async () => {
      must(await db.from("drafts").update({ body: row.body as unknown as Json, fill: row.fill as unknown as Json, updated_at: row.updated_at }).eq("id", row.id).select("id"));
      await dropVersions();
    },
  };
}

/** The lawyer's own save (the editor's autosave or its save button). `expected` = the `updated_at` of the draft the editor opened. */
export async function saveDraft(db: Db, x: { draft: string; body: unknown; expected?: string | null }): Promise<Applied> {
  const row = await loadDraftRow(db, x.draft);
  if (x.expected && x.expected !== row.updated_at) throw new Error(STALE);
  const next = syncLawyerStates(parseBody(x.body), row.body);
  if (sameBody(next, row.body)) return { id: row.id, extra: { unchanged: true, updated_at: row.updated_at }, steps: null, undo: async () => {} };
  return commitBody(db, row, { body: next, kind: "save" });
}

/** An old version made current again, as a NEW version («استرجاع»). */
export async function restoreVersion(db: Db, x: { draft: string; version: string }): Promise<Applied> {
  const row = await loadDraftRow(db, x.draft);
  const { data: v, error } = await db.from("draft_versions").select("id, body").eq("id", x.version).eq("draft_id", x.draft).maybeSingle();
  if (error) throw new Error(error.message);
  if (!v) throw new Error("النسخة دي مش موجودة");
  const body = parseBody(v.body);
  return commitBody(db, row, { body, kind: "restore", restoredFrom: v.id });
}

/** A Word file read into blocks, saved as a new draft of the case (its first version is the «import»). */
export async function importDraft(db: Db, x: { case: string; title: string; body: unknown; imported: DraftImport }): Promise<Applied> {
  const { data: c } = await db.from("cases").select("id").eq("id", x.case).maybeSingle();
  if (!c) throw new Error("الدعوى غير موجودة");
  let body: DraftBody;
  try { body = parseBody(x.body); } catch (e) { throw e instanceof BodyError ? e : new Error("شكل المسودة غير مفهوم"); }
  const fill: DraftFill = { filled: [], missing: [], lawyer: [], imported: x.imported };
  const row = must(await db.from("drafts").insert({
    case_id: c.id, template_id: null, template_name: "ملف Word", title: x.title, body: body as unknown as Json, fill: fill as unknown as Json,
    needs_lawyer_review: false, review_status: "confirmed", created_by_kind: "lawyer", source_kind: "manual",
  }).select("id").single());
  try {
    must(await db.from("draft_versions").insert({ draft_id: row.id, body: body as unknown as Json, kind: "import", note: x.imported.file_name.slice(0, 200) }).select("id").single());
  } catch (e) {
    await db.from("drafts").delete().eq("id", row.id);
    throw e;
  }
  return { id: row.id, steps: null, undo: async () => { await db.from("drafts").delete().eq("id", row.id); } };
}
