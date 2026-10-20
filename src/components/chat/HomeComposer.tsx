"use client";
import { ArrowUp, Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { startChatAction, startWithFileAction } from "@/lib/assistant/actions";

/** Home: the assistant comes first. Type what happened or attach a paper; it opens a new conversation. */
export function HomeComposer() {
  const [state, action, pending] = useActionState(startChatAction, null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const busy = pending || uploading;

  async function onFile(f?: File) {
    if (!f) return;
    setUploading(true);
    setErr(null);
    const fd = new FormData();
    fd.set("file", f);
    const r = await startWithFileAction(fd);
    if (r.threadId) router.push(`/chat/${r.threadId}`);
    else { setErr(r.error ?? "تعذّر رفع الملف"); setUploading(false); }
  }

  return (
    <form action={action} className="rounded-[var(--radius-lg)] bg-surface p-3 shadow-[var(--shadow-2)]">
      <textarea
        name="text"
        rows={3}
        required
        disabled={busy}
        placeholder="اكتب ما حدث أو ارفع ورقة…"
        className="block w-full resize-none bg-transparent px-2 py-1.5 text-body leading-7 text-ink placeholder:text-ink-3 focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div className="mt-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="application/pdf,image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} aria-label="إرفاق ورقة"
            className="inline-flex size-11 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 disabled:opacity-50">
            <Paperclip size={20} strokeWidth={1.5} />
          </button>
          <span className="text-caption text-ink-3">
            {uploading ? "جارٍ رفع الورقة وقراءتها…" : pending ? "المساعد يكتب…" : err || state?.error ? <span className="text-danger">{err ?? state?.error}</span> : "لن يُحفظ شيء قبل أن تؤكده."}
          </span>
        </div>
        <button disabled={busy} aria-label="إرسال"
          className="inline-flex size-11 items-center justify-center rounded-full bg-accent text-accent-ink transition hover:brightness-110 disabled:opacity-40">
          <ArrowUp size={20} strokeWidth={2} />
        </button>
      </div>
    </form>
  );
}
