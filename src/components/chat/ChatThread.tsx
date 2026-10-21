"use client";
/**
 * Thread UI (docs/design/*Chat*.dc.html): lawyer bubbles on the left, Clausia lines with the «C» avatar on the
 * right, paper chips, confirmation cards, and the composer docked at the bottom of the 820px column.
 * Sending is optimistic (the lawyer's message shows at once); no streaming.
 */
import { FixedDock } from "@/components/shell/Composer";
import { ArrowUp, Mic, Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
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

/** A paper uploaded in this thread (for the attachment chip). */
export interface ThreadDoc {
  name: string;
  pages: number | null;
  status: "pending" | "reading" | "done" | "failed";
  image: boolean;
}

const EXAMPLES_GENERAL = [
  "موكل جديد اسمه … وتليفونه …",
  "رفعنا دعوى رقم … لسنة … أمام محكمة …",
  "الجلسة اتأجلت لـ 15/12/2026 لتقديم مستندات",
];
const EXAMPLES_CASE = [
  "الجلسة اتأجلت لـ 15/12/2026 لتقديم مستندات",
  "الخصم دفع بعدم قبول الدعوى لرفعها من غير ذي صفة",
  "طلباتنا: إلزام المدعى عليه بأداء …",
];

/** The upload posts «أرفقتُ مستندًا: X» for the lawyer; the chip says it already, so no bubble for it. */
const AUTO_ATTACH = /^أرفقتُ مستندًا: /;

export function ChatThread({ threadId, caseId, items, lookup, docs = {} }: {
  threadId: string; caseId: string | null; items: ChatItem[]; lookup: Record<string, string>; docs?: Record<string, ThreadDoc>;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, startSend] = useTransition();
  const [uploading, startUpload] = useTransition();
  const [shown, addOptimistic] = useOptimistic(items, (cur, t: string) => [...cur, { id: `tmp-${cur.length}`, role: "user" as const, content: t, createdAt: new Date().toISOString(), attachments: [], proposals: [] }]);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  // keep the latest message in view above the docked composer (the composer is the last thing in the page)
  useEffect(() => {
    if (!endRef.current) return;
    window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [shown.length, sending]);

  // grow the composer with its text where `field-sizing: content` is unsupported (iOS Safari); max-h-40 caps it
  useEffect(() => {
    const el = boxRef.current;
    if (!el || CSS.supports?.("field-sizing", "content")) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [text]);

  function send(quick?: string) {
    const t = (quick ?? text).trim();
    if (!t || sending) return;
    setError(null);
    if (quick === undefined) setText("");
    startSend(async () => {
      addOptimistic(t);
      const r = await sendMessageAction(threadId, t);
      if (!r.ok) {
        setError(r.error ?? "تعذّر الإرسال");
        // not in the thread (session expired, thread missing…): give the text back instead of losing it
        if (!r.saved) setText((cur) => cur || t);
      }
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
  const lastSpoken = [...shown].reverse().find((x) => x.role === "user" || x.content.trim());
  const answers = lastSpoken?.role === "assistant" && !busy ? quickAnswers(lastSpoken.content) : [];
  const status = sending ? "Clausia بيكتب…" : uploading ? "بقرا الورقة صفحة صفحة…" : null;

  return (
    <div className="flex flex-1 flex-col">
      {shown.length === 0 ? (
        <ClausiaLine>
          <p>{caseId ? "اكتب لي اللي استجد في القضية دي، أو ارفع ورقة." : "احكي لي عن الموكل أو القضية، أو ارفع الصحيفة."} هجهّز لك اللي هيتحفظ في بطاقة، ومش هيتحفظ حاجة قبل ما تأكد.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {(caseId ? EXAMPLES_CASE : EXAMPLES_GENERAL).map((x) => (
              <button key={x} type="button" onClick={() => { setText(x); boxRef.current?.focus(); }}
                className="h-9 rounded-full border border-border bg-chip px-4 text-[13px] text-text-2 shadow-soft transition hover:text-text sm:text-[13.5px]">{x}</button>
            ))}
          </div>
        </ClausiaLine>
      ) : null}

      <ol className="flex flex-col gap-3.5 sm:gap-[18px]">
        {shown.map((m) => (
          <li key={m.id} className="flex flex-col gap-2">
            {m.role === "user" ? (
              <>
                {m.attachments.length && AUTO_ATTACH.test(m.content) ? null : (
                  <div className="border border-transparent bg-ink-solid text-bg shadow-[var(--tile-hi-shadow)] dark:border-border dark:bg-card-3 dark:text-text dark:shadow-soft max-w-[84%] self-end whitespace-pre-wrap break-words rounded-[20px] rounded-bl-[6px] px-3.5 py-[11px] text-[15px] leading-[1.7] sm:max-w-[72%] sm:rounded-[22px] sm:rounded-bl-[6px] sm:px-[18px] sm:py-[13px] sm:text-base sm:leading-[1.75]">
                    {m.content}
                  </div>
                )}
                {m.attachments.map((a) => <AttachmentChip key={a.documentId || a.fileName} name={a.fileName} doc={docs[a.documentId]} />)}
              </>
            ) : (
              <ClausiaLine>
                {m.content.trim() ? <p className="whitespace-pre-wrap break-words"><Prose text={m.content} /></p> : null}
                {m === lastSpoken && answers.length ? (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {answers.map((a, i) => (
                      <button key={a.label} type="button" onClick={() => send(a.text)}
                        className={cx("h-[34px] rounded-full border px-3.5 text-[13px] transition sm:h-9 sm:px-4 sm:text-[13.5px]", i === 0
                          ? "bg-accent-grad border-[var(--accent-edge)] font-bold text-ink-solid shadow-[var(--shadow-soft)] dark:bg-none dark:bg-warn-bg dark:font-semibold dark:text-gold-text"
                          : "border-border bg-chip text-text-2 hover:text-text")}>
                        {a.label}
                      </button>
                    ))}
                    <button type="button" onClick={() => boxRef.current?.focus()}
                      className="h-[34px] rounded-full border border-border bg-chip px-3.5 text-[13px] text-text-2 transition hover:text-text sm:h-9 sm:px-4 sm:text-[13.5px]">هكتب الرد</button>
                  </div>
                ) : null}
                {m.proposals.map((p) => (
                  <div key={p.id} className={cx(m.content.trim() && "mt-2.5 sm:mt-3")}><ProposalCard proposal={p} lookup={lookup} /></div>
                ))}
              </ClausiaLine>
            )}
          </li>
        ))}
        {status ? (
          <li aria-live="polite">
            <ClausiaLine><p className="animate-pulse text-text-3">{status}</p></ClausiaLine>
          </li>
        ) : null}
      </ol>
      <div ref={endRef} />

      <div className="min-h-[30px] flex-1" />

      <FixedDock width={960}>
        {error ? (
          <p role="alert" className="mb-2 flex items-start justify-between gap-2 rounded-2xl bg-bad-bg px-3.5 py-2 text-[13.5px] text-bad">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="shrink-0 text-xs underline">إخفاء</button>
          </p>
        ) : null}
        <div className="shadow-pop dark:shadow-card flex flex-wrap items-center gap-2 rounded-[26px] border border-border bg-field p-2 sm:px-4 sm:pb-2.5 sm:pt-3.5">
          <input ref={fileRef} type="file" accept="application/pdf,image/*" className="sr-only" id={`file-${threadId}`} onChange={(e) => onFile(e.target.files?.[0])} />
          <label htmlFor={`file-${threadId}`} aria-label="إرفاق ورقة (PDF أو صورة)" title="إرفاق ورقة (PDF أو صورة)"
            className={cx(ROUND, "cursor-pointer", busy && "pointer-events-none opacity-50")}>
            <Paperclip aria-hidden size={18} strokeWidth={1.9} />
          </label>
          <textarea ref={boxRef} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} rows={1}
            placeholder={shown.length ? "ردّ على Clausia…" : "اكتب لـ Clausia…"} aria-label="رسالة لـ Clausia"
            className="max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent py-2 text-[15px] leading-6 text-text placeholder:text-text-4 focus:outline-none [field-sizing:content] sm:order-first sm:min-h-11 sm:basis-full sm:py-0 sm:text-base sm:leading-[1.6]" />
          <button type="button" disabled aria-label="رسالة صوتية (قريبًا)" title="رسالة صوتية (قريبًا)" className={cx(ROUND, "disabled:opacity-60")}>
            <Mic aria-hidden size={18} strokeWidth={1.9} />
          </button>
          <div className="hidden min-w-0 flex-1 truncate text-xs text-text-4 sm:block" aria-live="polite">{status ?? "لن يُحفظ شيء قبل تأكيدك"}</div>
          <button type="button" onClick={() => send()} disabled={!text.trim() || sending} aria-label="إرسال"
            className="bg-primary-fill inline-flex size-[42px] shrink-0 items-center justify-center rounded-full transition disabled:opacity-50 sm:size-11">
            <ArrowUp aria-hidden size={20} strokeWidth={2.6} />
          </button>
        </div>
      </FixedDock>
    </div>
  );
}

/**
 * Quick answers under Clausia's open question, only when the question itself names the choices in «…»
 * (e.g. «مين موكلك؟ «أ» ولا «ب»؟»). Each chip sends that choice; about the client, as «موكلي <name>».
 */
function quickAnswers(text: string): { label: string; text: string }[] {
  const t = text.trim().replace(/\*\*/g, "");
  const end = t.lastIndexOf("؟");
  if (end < 0 || t.slice(end + 1).trim()) return [];
  const start = Math.max(t.lastIndexOf("\n", end), t.lastIndexOf(".", end)) + 1;
  const q = t.slice(start, end + 1);
  const opts = [...new Set([...q.matchAll(/«([^«»\n]{2,60})»/g)].map((x) => x[1].trim()))];
  if (opts.length < 2 || opts.length > 4) return [];
  const client = /موكلك/.test(q);
  return opts.map((o) => ({ label: o, text: client ? `موكلي ${o}` : o }));
}

const ROUND = "inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card-2 text-text-2 transition hover:text-text";

/** Clausia's turn: the «C» avatar and its text (cards go under the text). */
function ClausiaLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2.5 sm:gap-3.5">
      <span aria-hidden className="mark font-num mt-0.5 inline-flex size-[26px] shrink-0 items-center justify-center rounded-full text-xs font-black shadow-[var(--shadow-soft)] sm:mt-0 sm:size-8 sm:text-sm">C</span>
      <div className="min-w-0 flex-1 text-[15px] leading-[1.75] text-text-2 sm:pt-1 sm:text-base sm:leading-[1.8]">{children}</div>
    </div>
  );
}

const pagesLabel = (n: number) => (n === 1 ? "صفحة واحدة" : n === 2 ? "صفحتين" : n <= 10 ? `${n} صفحات` : `${n} صفحة`);
const READ: Record<ThreadDoc["status"], string> = { done: "اتقرت", reading: "بتتقري…", pending: "لسه ما اتقرتش", failed: "ما اتقرتش" };

function AttachmentChip({ name, doc }: { name: string; doc?: ThreadDoc }) {
  const meta = doc ? [doc.pages ? pagesLabel(doc.pages) : null, READ[doc.status]].filter(Boolean).join(" · ") : null;
  return (
    <div className="flex max-w-[84%] items-center gap-2.5 self-end rounded-[14px] border border-border bg-card py-2 pe-4 ps-3 shadow-soft">
      <span aria-hidden className="flex h-9 w-[30px] shrink-0 items-end justify-center rounded-md border border-border bg-card pb-1 text-[8px] font-extrabold text-bad">
        {doc?.image ? "IMG" : "PDF"}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-text sm:text-[13.5px]" dir="auto">{name}</span>
        {meta ? <span className={cx("block text-[11px] sm:text-[11.5px]", doc?.status === "failed" ? "text-bad" : "text-text-3")}>{meta}</span> : null}
      </span>
    </div>
  );
}

/** Minimal formatting for the model's replies: **bold** only; everything else stays plain text. */
function Prose({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="font-semibold text-text">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>))}</>;
}
