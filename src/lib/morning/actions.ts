"use server";
/**
 * «تجاهل» on a noticed card: saves «this lawyer does not want to see it» (dismissed_notices, the lawyer's own RLS client).
 * It changes nothing in any case. A second tap finds the first row (unique per lawyer, kind and key).
 */
import { createClient, getSession } from "@/lib/supabase/server";

const ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** the key of each kind: a hearing id, or two fact ids joined with ":" */
const KEY: Record<string, RegExp> = { hearing_decision: new RegExp(`^${ID}$`, "i"), date_conflict: new RegExp(`^${ID}:${ID}$`, "i") };

export async function dismissNoticeAction(kind: string, key: string): Promise<{ ok: boolean }> {
  if (!KEY[kind] || typeof key !== "string" || !KEY[kind].test(key)) return { ok: false };
  const db = await createClient();
  const s = await getSession(db);
  if (!s) return { ok: false };
  const { error } = await db.from("dismissed_notices").upsert({ user_id: s.user.id, kind, key }, { onConflict: "user_id,kind,key", ignoreDuplicates: true });
  return { ok: !error };
}
