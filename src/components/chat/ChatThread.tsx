"use client";
/** Thread UI: messages, cards, composer (fixed above the mobile tab bar), upload. No streaming. */
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { cx } from "@/components/ui";
import { ProposalCard } from "@/components/proposal/ProposalCard";
import { sendMessageAction } from "@/lib/assistant/actions";
import { uploadDocumentAction } from "@/lib/documents/actions";
import type { Proposal } from "@/lib/proposals";

export interface ChatItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  attachments: { documentId: string; fileName: string }[];
  proposals: Proposal[];
}

const EXAMPLES = [
  "موكل جديد اسمه … وتليفونه …",
  "رفعنا دعوى رقم … لسنة … أمام محكمة …",
  "الجلسة اتأجلت لـ 15/12/2026 لتقديم مستندات",
];

export function ChatThread({ threadId, caseId, items, lookup }: { threadId: string; caseId: string | null; items: ChatItem[]; lookup: Record<string, string> }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, startSend] = useTransition();
  const [uploading, startUpload] = useTransition();
  const [shown, addOptimistic] = useOptimistic(items, (cur, t: string) => [...cur, { id: `tmp-${cur.length}`, role: "user" as const, content: t, createdAt: new Date().toISOString(), attachments: [], proposals: [] }]);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [shown.length, sending]);

  function send() {
    const t = text.trim();
    if (!t || sending) return;
    setError(null);
    setText("");
    startSend(async () => {
      addOptimistic(t);
      const r = await sendMessageAction(threadId, t);
      if (!r.ok) { setError(r.error ?? "تعذّر الإرسال"); if (r.error === "الرسالة فارغة") setText(t); }
      router.refresh();
    });
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  function onFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    const fd = new FormData();
    fd.set("file", f);
    fd.set("threadId", threadId);
    if (caseId) fd.set("caseId", caseId);
    startUpload(async () => {
      try {
        const r = await uploadDocumentAction(fd);
        if (!r.ok) setError(`لم يُرفع «${f.name}»: ${r.error ?? "حدث خطأ"}`);
      } catch {
        setError(`لم يُرفع «${f.name}»: تعذّر الاتصال`);
      }
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  const busy = sending || uploading;

  return (
    <div className="pb-44 lg:pb-36">
      {shown.length === 0 ? (
        <div className="mx-auto max-w-xl py-8 text-center">
          <p className="text-[15px] font-medium text-ink">اكتب ما تعرفه عن الموكل أو الدعوى</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-3">أقترح عليك ما يُحفظ في بطاقة تأكيد، ولا يُحفظ شيء إلا بعد موافقتك. يمكنك أيضًا إرفاق صحيفة دعوى أو حكم أو صورة مستند.</p>
          <div className="mt-5 flex flex-col items-center gap-2">
            {EXAMPLES.map((x) => (
              <button key={x} type="button" onClick={() => { setText(x); boxRef.current?.focus(); }}
                className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-ink-2 hover:border-line-strong hover:text-ink">{x}</button>
            ))}
          </div>
        </div>
      ) : null}

      <ol className="mx-auto flex max-w-3xl flex-col gap-4">
        {shown.map((m) => (
          <li key={m.id} className={cx("flex flex-col gap-2", m.role === "user" ? "items-start" : "items-stretch")}>
            {m.role === "user" ? (
              <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-accent-soft px-4 py-2.5 text-[15px] leading-relaxed text-ink">
                {m.content}
                {m.attachments.length ? <span className="mt-1 block text-xs text-ink-3">مرفق: {m.attachments.map((a) => a.fileName).join("، ")}</span> : null}
              </div>
            ) : (
              <>
                {m.content.trim() ? (
                  <div className="max-w-[92%] whitespace-pre-wrap break-words border-r-2 border-accent/40 pr-3 text-[15px] leading-relaxed text-ink">
                    <Prose text={m.content} />
                  </div>
                ) : null}
                {m.proposals.map((p) => <ProposalCard key={p.id} proposal={p} lookup={lookup} />)}
              </>
            )}
          </li>
        ))}
        {sending ? <li className="text-sm text-ink-3" aria-live="polite"><span className="inline-block animate-pulse">المساعد يكتب…</span></li> : null}
        {uploading ? <li className="text-sm text-ink-3" aria-live="polite"><span className="inline-block animate-pulse">جارٍ رفع المستند وقراءته…</span></li> : null}
      </ol>
      <div ref={endRef} />

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-paper/95 backdrop-blur lg:bottom-0 lg:right-60">
        <div className="mx-auto max-w-3xl px-4 py-3 lg:px-8">
          {error ? (
            <p role="alert" className="mb-2 flex items-start justify-between gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} className="shrink-0 text-xs underline">إخفاء</button>
            </p>
          ) : null}
          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" accept="application/pdf,image/*" className="sr-only" id={`file-${threadId}`} onChange={(e) => onFile(e.target.files?.[0])} />
            <label htmlFor={`file-${threadId}`} aria-label="إرفاق مستند (PDF أو صورة)" title="إرفاق مستند (PDF أو صورة)"
              className={cx("flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line-strong bg-surface text-ink-2 hover:bg-surface-2", busy && "pointer-events-none opacity-50")}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 11.5 12.6 19.9a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />
              </svg>
            </label>
            <textarea ref={boxRef} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} rows={1} placeholder="اكتب للمساعد…" aria-label="رسالة للمساعد"
              className="max-h-40 min-h-11 flex-1 resize-none rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-[15px] leading-6 text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none [field-sizing:content]" />
            <button type="button" onClick={send} disabled={!text.trim() || sending}
              className="h-11 shrink-0 rounded-lg bg-accent px-4 text-[15px] font-medium text-accent-ink transition hover:brightness-110 disabled:opacity-40">
              إرسال
            </button>
          </div>
          <p className="mt-1.5 hidden text-xs text-ink-3 lg:block">Enter للإرسال · Shift+Enter لسطر جديد</p>
        </div>
      </div>
    </div>
  );
}

/** Minimal formatting for the model's replies: **bold** only; everything else stays plain text. */
function Prose({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>))}</>;
}
