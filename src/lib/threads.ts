import "server-only";
/**
 * Chat threads = chat SESSIONS. A context has many sessions: the general context (case_id null) or one case.
 * A session can also be linked to one hearing (hearing_id): its label is «جلسة 22/10».
 * A session is created with its first message (never empty), titled from that message (about 40 characters).
 */
import { cairoDateOf } from "@/lib/relative-days";
import type { Db } from "@/lib/supabase/server";

export const TITLE_MAX = 40;
export const DEFAULT_TITLE = "محادثة جديدة";

/** The session's title from the lawyer's first message: one line, cut at about 40 characters. */
export function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX).trimEnd()}…` : t || DEFAULT_TITLE;
}

export interface Session {
  id: string;
  title: string;
  /** Cairo day of the last message, yyyy-mm-dd */
  day: string;
  /** the linked hearing's date, yyyy-mm-dd */
  hearingDate: string | null;
}

/** The sessions of ONE context, newest first. `caseId` null = the general context. */
export async function listSessions(db: Db, caseId: string | null, limit = 40): Promise<Session[]> {
  const q = db.from("chat_threads").select("id, title, updated_at, hearings(hearing_date)").order("updated_at", { ascending: false }).limit(limit);
  const { data } = await (caseId ? q.eq("case_id", caseId) : q.is("case_id", null));
  return (data ?? []).map((t) => ({
    id: t.id, title: t.title || DEFAULT_TITLE, day: cairoDateOf(t.updated_at), hearingDate: t.hearings?.hearing_date ?? null,
  }));
}

/** A case's latest session (by last activity), or null when it has none yet. */
export async function latestCaseThread(db: Db, caseId: string): Promise<string | null> {
  const { data } = await db.from("chat_threads").select("id").eq("case_id", caseId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return data?.id ?? null;
}

/** The latest session linked to this hearing (of this case), or null. */
export async function hearingThread(db: Db, caseId: string, hearingId: string): Promise<string | null> {
  const { data } = await db.from("chat_threads").select("id").eq("case_id", caseId).eq("hearing_id", hearingId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return data?.id ?? null;
}

/** The case's latest session, or a new one (for a paper uploaded to a case that has no session yet). */
export async function getOrCreateCaseThread(db: Db, caseId: string): Promise<string> {
  const found = await latestCaseThread(db, caseId);
  if (found) return found;
  return createThread(db, { caseId, title: null });
}

/** A new session. The database checks that the case / hearing belong to this office (and the hearing to the case). */
export async function createThread(db: Db, o: { caseId?: string | null; hearingId?: string | null; title?: string | null }): Promise<string> {
  const { data, error } = await db.from("chat_threads")
    .insert({ case_id: o.caseId ?? null, hearing_id: o.hearingId ?? null, title: o.title ?? null }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function createGeneralThread(db: Db, title?: string | null): Promise<string> {
  return createThread(db, { title: title ?? DEFAULT_TITLE });
}

/** A new conversation whose first message never got in (a failure) is removed, so no empty thread is left behind.
 *  Returns true when it was removed. Only general threads: a case's own session is never removed here. */
export async function dropIfEmpty(db: Db, threadId: string): Promise<boolean> {
  return dropEmpty(db, threadId, true);
}

/** The same for a session this very request just made (in any context): nothing else could have written to it. */
export async function dropNewIfEmpty(db: Db, threadId: string): Promise<boolean> {
  return dropEmpty(db, threadId, false);
}

async function dropEmpty(db: Db, threadId: string, generalOnly: boolean): Promise<boolean> {
  const { count } = await db.from("chat_messages").select("id", { count: "exact", head: true }).eq("thread_id", threadId);
  if (count) return false;
  const q = db.from("chat_threads").delete().eq("id", threadId);
  const { data } = await (generalOnly ? q.is("case_id", null) : q).select("id");
  return !!data?.length;
}

/** Moves a general session to a case (the lawyer's action). The case must be visible to this lawyer (RLS); a hearing link is dropped. */
export async function moveThreadToCase(db: Db, threadId: string, caseId: string): Promise<void> {
  const { data: c } = await db.from("cases").select("id").eq("id", caseId).maybeSingle();
  if (!c) throw new Error("القضية غير موجودة");
  const { data, error } = await db.from("chat_threads").update({ case_id: caseId, hearing_id: null }).eq("id", threadId).is("case_id", null).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("المحادثة دي مش محادثة عامة");
}
