"use server";
/**
 * Holidays (shared list, owner decision): everyone reads it; an office can REPORT a missing holiday; only an admin (app_admins)
 * adds, approves or deletes holidays and decides reports. The database enforces it with RLS (is_admin()); the checks here only give
 * a friendly message. RLS client only.
 */
import { revalidatePath } from "next/cache";
import { parseDmy } from "@/lib/dates";
import { deadlinesEnabled } from "@/lib/flags";
import { createClient, getSession } from "@/lib/supabase/server";

export type HolidayState = { ok?: boolean; error?: string } | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (f: FormData, k: string) => (typeof f.get(k) === "string" ? (f.get(k) as string).trim() : "");

async function ctx() {
  if (!deadlinesEnabled()) return { error: "الميزة دي لسه مش متاحة" } as const;
  const db = await createClient();
  const s = await getSession(db);
  if (!s) return { error: "انتهت الجلسة، سجّل الدخول من جديد" } as const;
  const { data: admin } = await db.rpc("is_admin");
  return { db, userId: s.user.id, admin: admin === true } as const;
}

/** date (d/m/yyyy, a full day), name, note: «never guess»: an unclear date is refused */
function fields(f: FormData): { date: string; name: string; note: string | null } | { error: string } {
  const d = parseDmy(str(f, "date"));
  if (!d || d.precision !== "day") return { error: "اكتب التاريخ كامل بصيغة يوم/شهر/سنة، مثل 6/10/2026" };
  const name = str(f, "name");
  if (name.length < 2 || name.length > 80) return { error: "اكتب اسم الإجازة (من حرفين لـ 80 حرف)" };
  const note = str(f, "note");
  if (note.length > 200) return { error: "الملاحظة طويلة (الحد 200 حرف)" };
  return { date: d.iso, name, note: note || null };
}

/** an office reports a missing holiday: a pending report, nothing changes in the list until the admin approves */
export async function reportHolidayAction(_prev: HolidayState, f: FormData): Promise<HolidayState> {
  const c = await ctx();
  if ("error" in c) return { error: c.error };
  const x = fields(f);
  if ("error" in x) return { error: x.error };
  const { error } = await c.db.from("holiday_reports").insert({ holiday_date: x.date, name: x.name, note: x.note });
  if (error) return { error: "ماقدرتش أبعت البلاغ، جرّب تاني" };
  revalidatePath("/settings/holidays");
  return { ok: true };
}

/** admin: add a holiday (approved at once: the admin is the one who approves) */
export async function addHolidayAction(_prev: HolidayState, f: FormData): Promise<HolidayState> {
  const c = await ctx();
  if ("error" in c) return { error: c.error };
  if (!c.admin) return { error: "الصفحة دي للمسؤول بس" };
  const x = fields(f);
  if ("error" in x) return { error: x.error };
  const { error } = await c.db.from("holidays").insert({ holiday_date: x.date, name: x.name, note: x.note, status: "approved", approved_at: new Date().toISOString(), approved_by: c.userId });
  if (error) return { error: /duplicate|unique/i.test(error.message) ? "التاريخ ده موجود في القايمة" : "ماقدرتش أضيف الإجازة" };
  revalidatePath("/settings/holidays");
  return { ok: true };
}

/** admin: approve a draft */
export async function approveHolidayAction(f: FormData): Promise<void> {
  const id = str(f, "id");
  const c = await ctx();
  if ("error" in c || !c.admin || !UUID.test(id)) return;
  await c.db.from("holidays").update({ status: "approved", approved_at: new Date().toISOString(), approved_by: c.userId }).eq("id", id);
  revalidatePath("/settings/holidays");
}

/** admin: delete a holiday */
export async function deleteHolidayAction(f: FormData): Promise<void> {
  const id = str(f, "id");
  const c = await ctx();
  if ("error" in c || !c.admin || !UUID.test(id)) return;
  await c.db.from("holidays").delete().eq("id", id);
  revalidatePath("/settings/holidays");
}

/** admin: approve a report → the holiday is in the list, approved; the report is closed */
export async function approveReportAction(f: FormData): Promise<void> {
  const id = str(f, "id");
  const c = await ctx();
  if ("error" in c || !c.admin || !UUID.test(id)) return;
  const { data: r } = await c.db.from("holiday_reports").select("holiday_date, name, status").eq("id", id).maybeSingle();
  if (!r || r.status !== "pending") return;
  const now = new Date().toISOString();
  const { error } = await c.db.from("holidays").upsert({ holiday_date: r.holiday_date, name: r.name, status: "approved", approved_at: now, approved_by: c.userId }, { onConflict: "holiday_date" });
  if (error) return;
  await c.db.from("holiday_reports").update({ status: "approved", decided_at: now, decided_by: c.userId }).eq("id", id);
  revalidatePath("/settings/holidays");
}

/** admin: reject a report */
export async function rejectReportAction(f: FormData): Promise<void> {
  const id = str(f, "id");
  const c = await ctx();
  if ("error" in c || !c.admin || !UUID.test(id)) return;
  await c.db.from("holiday_reports").update({ status: "rejected", decided_at: new Date().toISOString(), decided_by: c.userId }).eq("id", id).eq("status", "pending");
  revalidatePath("/settings/holidays");
}
