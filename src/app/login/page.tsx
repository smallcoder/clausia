"use client";
import { useActionState, useState } from "react";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { signIn, signUp, type AuthState } from "./actions";

const FIELD = "mt-1.5 h-12 w-full rounded-md border border-border bg-field px-4 text-md text-text shadow-soft placeholder:text-text-4 focus:border-gold/60 focus:outline-none";

export default function LoginPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [state, action, pending] = useActionState(mode === "in" ? signIn : signUp, null as AuthState);
  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4">
      <ThemeToggle className="absolute end-4 top-4" />
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2.5">
            <span className="mark font-num inline-flex size-10 items-center justify-center rounded-md text-lg font-black shadow-mark">C</span>
            <span className="font-num text-xl font-extrabold tracking-[-0.02em] text-text">Clausia</span>
          </div>
          <p className="mt-3 text-md text-text-3">ملف القضية، يُملأ بالمحادثة مع Clausia</p>
        </div>
        <form action={action} className="space-y-4 rounded-xl border border-border-2 bg-card p-6 shadow-card">
          {mode === "up" ? (
            <label className="block text-sm font-semibold text-text-3">
              اسم المكتب
              <input name="office_name" required className={FIELD} />
            </label>
          ) : null}
          <label className="block text-sm font-semibold text-text-3">
            البريد الإلكتروني
            <input name="email" type="email" required dir="ltr" autoComplete="email" className={`${FIELD} text-left`} />
          </label>
          <label className="block text-sm font-semibold text-text-3">
            كلمة المرور
            <input name="password" type="password" required minLength={8} dir="ltr" autoComplete={mode === "in" ? "current-password" : "new-password"} className={`${FIELD} text-left`} />
          </label>
          {state?.error ? <p className="text-base leading-5 text-bad">{state.error}</p> : null}
          {state?.info ? <p className="text-base leading-5 text-good">{state.info}</p> : null}
          <button disabled={pending} className="bg-primary-fill h-12 w-full rounded-full text-md font-bold transition hover:brightness-105 disabled:opacity-60">
            {mode === "in" ? "دخول" : "إنشاء حساب ومكتب"}
          </button>
        </form>
        <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 min-h-11 w-full text-center text-base font-semibold text-gold-text hover:opacity-80">
          {mode === "in" ? "مكتب جديد؟ أنشئ حسابًا" : "لديك حساب؟ سجّل الدخول"}
        </button>
      </div>
    </main>
  );
}
