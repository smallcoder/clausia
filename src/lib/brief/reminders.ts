/**
 * The lawyer's own reminders («ذكّرني الصبح 7»). A direct action of the lawyer, not a model proposal: the model never calls
 * these, so there is no confirmation card; the screen shows a visible undo instead. Each takes `db`, the lawyer's RLS-bound
 * client (the table's policies: own rows of the own office only), so another lawyer's reminder is simply not found, and a
 * script can call them. The server actions in ./actions.ts are thin wrappers.
 */
import type { Db } from "@/lib/supabase/server";
import { reminderDue, remindInstant } from "./time";

export type ReminderResult = { ok: true; id: string; remindAt: string } | { ok: false; error: string };
const fail = (error: string): ReminderResult => ({ ok: false, error });

/** the kind of the brief's reminder */
export const BRIEF_KIND = "brief";

/**
 * Save «remind me at 07:00 on `forDate`». One per lawyer and day: a second tap finds the first (the table is unique on it).
 * Refused when that 07:00 has already passed.
 */
export async function setBriefReminder(db: Db, forDate: string, now = new Date()): Promise<ReminderResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(forDate)) return fail("التاريخ مش واضح");
  const at = remindInstant(forDate);
  if (at.getTime() <= now.getTime()) return fail("الساعة 7 الصبح فاتت");
  const found = await db.from("reminders").select("id, remind_at").eq("kind", BRIEF_KIND).eq("for_date", forDate).maybeSingle();
  if (found.data) return { ok: true, id: found.data.id, remindAt: found.data.remind_at };
  const { data, error } = await db.from("reminders").insert({ kind: BRIEF_KIND, for_date: forDate, remind_at: at.toISOString() }).select("id, remind_at").single();
  if (error || !data) return fail("تعذر حفظ التذكير");
  return { ok: true, id: data.id, remindAt: data.remind_at };
}

/** Undo: delete the reminder. Not found (already gone, or not the lawyer's) is a failure. */
export async function undoReminder(db: Db, id: string): Promise<{ ok: boolean }> {
  const { data } = await db.from("reminders").delete().eq("id", id).select("id");
  return { ok: !!data?.length };
}

/** The lawyer opened it from the bell: it stops showing. */
export async function dismissReminder(db: Db, id: string, now = new Date()): Promise<{ ok: boolean }> {
  const { data } = await db.from("reminders").update({ dismissed_at: now.toISOString() }).eq("id", id).is("dismissed_at", null).select("id");
  return { ok: !!data?.length };
}

export interface DueReminder { id: string; forDate: string; remindAt: string }

/** Reminders whose time has come (and is under a day old) that the lawyer has not opened, oldest first. */
export async function dueReminders(db: Db, now = new Date()): Promise<DueReminder[]> {
  const since = new Date(now.getTime() - 86_400_000).toISOString();
  const { data } = await db.from("reminders").select("id, for_date, remind_at").eq("kind", BRIEF_KIND).is("dismissed_at", null)
    .lte("remind_at", now.toISOString()).gt("remind_at", since).order("remind_at");
  return (data ?? []).filter((r) => reminderDue(r.remind_at, now)).map((r) => ({ id: r.id, forDate: r.for_date, remindAt: r.remind_at }));
}
