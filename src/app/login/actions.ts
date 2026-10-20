"use server";

export type AuthState = { error?: string; info?: string } | null;
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const db = await createClient();
  const { error } = await db.auth.signInWithPassword({ email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") });
  if (error) return { error: "البريد أو كلمة المرور غير صحيحة" };
  redirect("/");
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const db = await createClient();
  const { data, error } = await db.auth.signUp({
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
    options: { data: { office_name: String(form.get("office_name") ?? "") } },
  });
  if (error) return { error: error.message };
  if (!data.session) return { info: "تم إنشاء الحساب. افتح رسالة التأكيد في بريدك ثم سجّل الدخول." };
  redirect("/");
}
