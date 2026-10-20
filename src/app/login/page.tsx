"use client";
import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [state, action, pending] = useActionState(mode === "in" ? signIn : signUp, null as AuthState);
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-3xl font-bold tracking-tight text-accent">Clausia</div>
          <p className="mt-2 text-sm text-ink-2">ملف القضية، يُملأ بالمحادثة</p>
        </div>
        <form action={action} className="space-y-3 rounded-[var(--radius)] border border-line bg-surface p-5">
          {mode === "up" ? (
            <label className="block text-sm">
              <span className="text-ink-2">اسم المكتب</span>
              <input name="office_name" required className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-surface px-3" />
            </label>
          ) : null}
          <label className="block text-sm">
            <span className="text-ink-2">البريد الإلكتروني</span>
            <input name="email" type="email" required dir="ltr" autoComplete="email" className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-left" />
          </label>
          <label className="block text-sm">
            <span className="text-ink-2">كلمة المرور</span>
            <input name="password" type="password" required minLength={8} dir="ltr" autoComplete={mode === "in" ? "current-password" : "new-password"} className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-left" />
          </label>
          {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}
          {state?.info ? <p className="text-sm text-ok">{state.info}</p> : null}
          <button disabled={pending} className="h-11 w-full rounded-lg bg-accent font-medium text-accent-ink disabled:opacity-60">
            {mode === "in" ? "دخول" : "إنشاء حساب ومكتب"}
          </button>
        </form>
        <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 w-full text-center text-sm text-accent hover:underline">
          {mode === "in" ? "مكتب جديد؟ أنشئ حسابًا" : "لديك حساب؟ سجّل الدخول"}
        </button>
      </div>
    </main>
  );
}
