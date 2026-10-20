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
          <div className="text-[2.125rem] font-bold tracking-tight text-ink">Clausia</div>
          <p className="mt-2 text-body text-ink-2">ملف القضية، يُملأ بالمحادثة</p>
        </div>
        <form action={action} className="space-y-4 rounded-[var(--radius-lg)] bg-surface p-6 shadow-2">
          {mode === "up" ? (
            <label className="block text-callout">
              <span className="text-ink-2">اسم المكتب</span>
              <input name="office_name" required className="mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3.5 text-body text-ink focus:border-accent focus:bg-surface focus:outline-none" />
            </label>
          ) : null}
          <label className="block text-callout">
            <span className="text-ink-2">البريد الإلكتروني</span>
            <input name="email" type="email" required dir="ltr" autoComplete="email" className="mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3.5 text-body text-ink focus:border-accent focus:bg-surface focus:outline-none text-left" />
          </label>
          <label className="block text-callout">
            <span className="text-ink-2">كلمة المرور</span>
            <input name="password" type="password" required minLength={8} dir="ltr" autoComplete={mode === "in" ? "current-password" : "new-password"} className="mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3.5 text-body text-ink focus:border-accent focus:bg-surface focus:outline-none text-left" />
          </label>
          {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}
          {state?.info ? <p className="text-sm text-ok">{state.info}</p> : null}
          <button disabled={pending} className="h-11 w-full rounded-[var(--radius-sm)] bg-accent text-body font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-60">
            {mode === "in" ? "دخول" : "إنشاء حساب ومكتب"}
          </button>
        </form>
        <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 min-h-11 w-full text-center text-callout text-accent hover:opacity-80">
          {mode === "in" ? "مكتب جديد؟ أنشئ حسابًا" : "لديك حساب؟ سجّل الدخول"}
        </button>
      </div>
    </main>
  );
}
