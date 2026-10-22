"use server";
/**
 * Server actions of the brief: the reminder chip (set / undo), and what the bell asks once a minute (is a reminder due)
 * and tells when the lawyer opens one (dismiss). Thin wrappers over ./reminders with the lawyer's RLS client.
 */
import { createClient } from "@/lib/supabase/server";
import { dismissDueFor, dismissReminder, dueReminders, setBriefReminder, undoReminder, type DueReminder } from "./reminders";

export async function setReminderAction(forDate: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const r = await setBriefReminder(await createClient(), forDate);
  return r.ok ? { ok: true, id: r.id } : r;
}

export async function undoReminderAction(id: string): Promise<{ ok: boolean }> {
  return undoReminder(await createClient(), id);
}

export async function dismissReminderAction(id: string): Promise<{ ok: boolean }> {
  return dismissReminder(await createClient(), id);
}

/** the brief page of that day was opened: a due reminder for it stops showing in the bell */
export async function briefSeenAction(forDate: string): Promise<void> {
  if (/^\d{4}-\d{2}-\d{2}$/.test(forDate)) await dismissDueFor(await createClient(), forDate).catch(() => {});
}

/** the bell's minute check; an error (signed out, offline) is just «nothing due» */
export async function dueRemindersAction(): Promise<DueReminder[]> {
  try {
    return await dueReminders(await createClient());
  } catch {
    return [];
  }
}
