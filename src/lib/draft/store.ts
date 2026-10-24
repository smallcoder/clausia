import "server-only";
/** Reads of a draft's history (PR 7), through the lawyer's RLS-bound client. A failed read THROWS (no silent empty history). */
import { parseBody } from "@/lib/draft/model";
import type { DraftBody } from "@/lib/library/types";
import type { Db } from "@/lib/supabase/server";
import type { VersionKind } from "./save";

export interface VersionRow { id: string; kind: VersionKind; note: string | null; created_at: string; restored_from: string | null }

/** The versions of one draft, newest first (the body is NOT read here: a list of old bodies would be heavy; `getVersionBody` reads one). */
export async function listVersions(db: Db, draftId: string, limit = 60): Promise<VersionRow[]> {
  const { data, error } = await db.from("draft_versions").select("id, kind, note, created_at, restored_from").eq("draft_id", draftId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`draft_versions: ${error.message}`);
  return (data ?? []) as VersionRow[];
}

/** One old version's body, checked (null when it is not this draft's or not visible). */
export async function getVersionBody(db: Db, draftId: string, versionId: string): Promise<DraftBody | null> {
  const { data, error } = await db.from("draft_versions").select("body").eq("draft_id", draftId).eq("id", versionId).maybeSingle();
  if (error) throw new Error(`draft_versions: ${error.message}`);
  return data ? parseBody(data.body) : null;
}
