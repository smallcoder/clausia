"use client";
import { useActionState } from "react";
import { startChatAction } from "@/lib/assistant/actions";

/** The main entry: type what you know about a new client or case; the assistant answers in a new thread. */
export function StartChat() {
  const [state, action, pending] = useActionState(startChatAction, null);
  return (
    <form action={action} className="mb-8 rounded-[var(--radius)] bg-surface p-4 shadow-2 ring-accent/40 transition-shadow focus-within:ring-2">
      <textarea
        name="text"
        rows={3}
        required
        disabled={pending}
        placeholder="مثال: موكل جديد اسمه …، وعنده دعوى رقم … لسنة … أمام محكمة …"
        className="w-full resize-none bg-transparent px-1 py-1 text-body leading-7 text-ink placeholder:text-ink-3 focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-caption text-ink-3">{pending ? "المساعد يكتب…" : state?.error ? <span className="text-danger">{state.error}</span> : "لن يُحفظ شيء قبل أن تؤكده."}</p>
        <button disabled={pending} className="min-h-11 rounded-full bg-accent px-5 text-callout font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-60">
          {pending ? "…" : "إرسال"}
        </button>
      </div>
    </form>
  );
}
