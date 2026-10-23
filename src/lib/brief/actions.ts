"use server";
/**
 * Server actions of the bell: what it asks once a minute (is a reminder due) and tells when the lawyer opens one (dismiss).
 * Thin wrappers over ./reminders with the lawyer's RLS client. (The brief page and its «ذكّرني» chip are gone: the morning brief
 * lives in the chat only. Setting a reminder from the chat is a `future` issue; ./reminders keeps setBriefReminder for it.)
 */
import { createClient } from "@/lib/supabase/server";
import { dismissReminder, dueReminders, type DueReminder } from "./reminders";

export async function dismissReminderAction(id: string): Promise<{ ok: boolean }> {
  return dismissReminder(await createClient(), id);
}

/** the bell's minute check; an error (signed out, offline) is just «nothing due» */
export async function dueRemindersAction(): Promise<DueReminder[]> {
  try {
    return await dueReminders(await createClient());
  } catch {
    return [];
  }
}
