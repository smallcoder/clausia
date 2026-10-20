"use client";
import { useActionState } from "react";
import { startChatAction } from "@/lib/assistant/actions";

/** The main entry: type what you know about a new client or case; the assistant answers in a new thread. */
export function StartChat() {
  const [state, action, pending] = useActionState(startChatAction, null);
  return (
    <form action={action} className="mb-6 rounded-[var(--radius)] border border-line bg-surface p-3 focus-within:border-accent/50">
      <textarea
        name="text"
        rows={3}
        required
        disabled={pending}
        placeholder="مثال: موكل جديد اسمه …، وعنده دعوى رقم … لسنة … أمام محكمة …"
        className="w-full resize-none bg-transparent px-1 py-1 text-[15px] leading-7 text-ink placeholder:text-ink-3 focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-ink-3">{pending ? "المساعد يكتب…" : state?.error ? <span className="text-danger">{state.error}</span> : "لن يُحفظ شيء قبل أن تؤكده."}</p>
        <button disabled={pending} className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink disabled:opacity-60">
          {pending ? "…" : "إرسال"}
        </button>
      </div>
    </form>
  );
}
