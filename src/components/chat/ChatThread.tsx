"use client";
/**
 * Thread UI (docs/design/*Chat*.dc.html, v2): solid lawyer bubbles on the left, Clausia lines with the «C» mark on
 * the right, paper chips, confirmation cards, glass quick answers, and the glass composer in the 780px ChatDock.
 * Sending is optimistic (the lawyer's message shows at once); no streaming.
 */
import { ArrowUp, Mic, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { ProposalCard } from "@/components/proposal/ProposalCard";
import { ChatDock } from "./ChatDock";
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
  // (again after the dock has measured its spacer, which lands a frame or two later)
  useEffect(() => {
    if (!endRef.current) return;
    const go = () => window.scrollTo({ top: document.documentElement.scrollHeight });
    go();
    const raf = requestAnimationFrame(() => requestAnimationFrame(go));
    const late = setTimeout(go, 250);
    return () => { cancelAnimationFrame(raf); clearTimeout(late); };
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
          <div className="mt-3 flex flex-wrap gap-2">
            {(caseId ? EXAMPLES_CASE : EXAMPLES_GENERAL).map((x) => (
              <button key={x} type="button" onClick={() => { setText(x); boxRef.current?.focus(); }} className={CHIP}>{x}</button>
            ))}
          </div>
        </ClausiaLine>
      ) : null}

      <ol className="flex flex-col gap-[18px] sm:gap-[22px]">
        {shown.map((m) => (
          <li key={m.id} className="flex flex-col gap-[18px] sm:gap-[22px]">
            {m.role === "user" ? (
              <>
                {m.attachments.length && AUTO_ATTACH.test(m.content) ? null : (
                  <div className="max-w-[88%] self-end whitespace-pre-wrap break-words rounded-[22px] rounded-bl-[6px] border border-border-2 bg-card px-[17px] py-[13px] text-[15px] leading-[1.75] text-text dark:bg-card-2 sm:max-w-[72%] sm:text-base">
                    {m.content}
                  </div>
                )}
                {m.attachments.map((a, i) => <AttachmentChip key={a.documentId || a.fileName} name={a.fileName} doc={docs[a.documentId]} tuck={i === 0 && !AUTO_ATTACH.test(m.content)} />)}
              </>
            ) : (
              <ClausiaLine>
                {m.content.trim() ? <p className="whitespace-pre-wrap break-words"><Prose text={m.content} /></p> : null}
                {m === lastSpoken && answers.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {answers.map((a, i) => (
                      <button key={a.label} type="button" onClick={() => send(a.text)} className={CHIP}>
                        {a.label}
                      </button>
                    ))}
                    <button type="button" onClick={() => boxRef.current?.focus()} className={CHIP}>هكتب الرد</button>
                  </div>
                ) : null}
                {m.proposals.map((p, i) => (
                  <div key={p.id} className={cx((m.content.trim() || i > 0) && "mt-3.5")}><ProposalCard proposal={p} lookup={lookup} /></div>
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

      {/* the thread's own composer (optimistic send + upload): the v2 two-row glass box of the Chat mockups */}
      <ChatDock>
        {error ? (
          <p role="alert" className="mb-2 flex items-start justify-between gap-2 rounded-2xl border border-border-2 bg-card px-3.5 py-2 text-[13.5px] text-bad shadow-soft">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="shrink-0 text-xs underline">إخفاء</button>
          </p>
        ) : null}
        <div className="glass rounded-[24px] px-3 pb-2.5 pt-3.5 sm:rounded-[26px] sm:px-3.5 sm:pb-3 sm:pt-4">
          <div className="flex items-start gap-2.5 px-1 sm:gap-3 sm:px-1.5 sm:pt-0.5">
            <span aria-hidden className="mark font-num mt-0.5 inline-flex size-[22px] shrink-0 items-center justify-center rounded-[7px] text-[11px] font-extrabold sm:size-[26px] sm:rounded-[9px] sm:text-[13px]">C</span>
            <textarea ref={boxRef} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} rows={1}
              placeholder={shown.length ? "ردّ على Clausia…" : "اكتب لـ Clausia…"} aria-label="رسالة لـ Clausia"
              className="block max-h-40 min-h-[46px] min-w-0 flex-1 resize-none bg-transparent p-0 text-base leading-[1.6] text-text placeholder:text-text-4 focus:outline-none [field-sizing:content] sm:min-h-14 sm:text-[17px] sm:leading-[1.65]" />
          </div>
          <div className="mt-1.5 flex items-center gap-2 sm:mt-2">
            <input ref={fileRef} type="file" accept="application/pdf,image/*" className="sr-only" id={`file-${threadId}`} onChange={(e) => onFile(e.target.files?.[0])} />
            <label htmlFor={`file-${threadId}`} aria-label="إرفاق ورقة (PDF أو صورة)" title="إرفاق ورقة (PDF أو صورة)"
              className={cx(ROUND, "cursor-pointer", busy && "pointer-events-none opacity-50")}>
              <Plus aria-hidden size={18} strokeWidth={1.8} />
            </label>
            <button type="button" disabled aria-label="رسالة صوتية (قريبًا)" title="رسالة صوتية (قريبًا)" className={cx(ROUND, "disabled:opacity-60")}>
              <Mic aria-hidden size={18} strokeWidth={1.8} />
            </button>
            <div className="min-w-0 flex-1 truncate text-center text-[10.5px] text-text-4 sm:text-start sm:text-xs" aria-live="polite">
              {status ?? <span className="sm:hidden">مفيش حاجة بتتحفظ من غير موافقتك</span>}
            </div>
            <button type="button" onClick={() => send()} disabled={!text.trim() || sending} aria-label="إرسال"
              className={cx(HIT, "bg-primary-fill inline-flex size-[38px] shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed sm:size-10")}>
              <ArrowUp aria-hidden size={19} strokeWidth={2.4} />
            </button>
          </div>
        </div>
        <p className="mt-2.5 hidden text-center text-[11.5px] leading-[normal] text-text-4 sm:block">Clausia بتجهّز، وإنت اللي بتأكد. مفيش حاجة بتتحفظ من غير موافقتك.</p>
      </ChatDock>
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

/** drawn at the mockup's size, tapped at 44px: an invisible ring around the control widens the hit area */
const HIT = "relative before:absolute before:-inset-[3px] before:rounded-full before:content-[''] sm:before:-inset-0.5";
/** round composer control (Chat mockup: hairline ring, no fill): 38px mobile, 40px desktop */
const ROUND = cx(HIT, "inline-flex size-[38px] shrink-0 items-center justify-center rounded-full border border-border-2 glass-icon transition hover:text-text sm:size-10");
/** quick answers and starters: glass chips (floating controls), 36px tall (44px hit area) */
const CHIP = "glass relative inline-flex min-h-9 shrink-0 items-center rounded-full px-[15px] py-1 text-[13px] font-medium glass-icon transition hover:text-text before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']";

/**
 * Clausia's turn: the «C» mark and its text (cards go under the text). Desktop: the mark beside the text.
 * Mobile: a «C · Clausia» label row, the text full width under it.
 */
function ClausiaLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
      <div className="flex items-center gap-2 self-start">
        <span aria-hidden className="mark font-num inline-flex size-6 shrink-0 items-center justify-center rounded-[8px] text-[11px] font-extrabold sm:size-7 sm:rounded-[9px] sm:text-[13px]">C</span>
        <span className="text-[13px] font-bold leading-[normal] text-title sm:hidden">Clausia</span>
      </div>
      <div className="min-w-0 flex-1 text-[15px] leading-[1.8] text-text sm:pt-[3px] sm:text-base">{children}</div>
    </div>
  );
}

const pagesLabel = (n: number) => (n === 1 ? "صفحة واحدة" : n === 2 ? "صفحتين" : n <= 10 ? `${n} صفحات` : `${n} صفحة`);
const READ: Record<ThreadDoc["status"], string> = { done: "اتقرت", reading: "بتتقري…", pending: "لسه ما اتقرتش", failed: "ما اتقرتش" };

/** A paper the lawyer sent: a solid chip (thumb · name · pages · read state), tucked under the bubble it came with. */
function AttachmentChip({ name, doc, tuck }: { name: string; doc?: ThreadDoc; tuck?: boolean }) {
  const meta = doc ? [doc.pages ? pagesLabel(doc.pages) : null, READ[doc.status]].filter(Boolean).join(" · ") : null;
  return (
    <div className={cx("flex max-w-[88%] items-center gap-2.5 self-end rounded-[16px] border border-border-2 bg-card py-2 pe-2.5 ps-3.5 dark:bg-card-2 sm:max-w-[72%]", tuck && "-mt-1.5")}>
      <span aria-hidden className="flex h-9 w-[30px] shrink-0 items-center justify-center rounded-md bg-paper-thumb text-[8px] font-extrabold text-[var(--paper-thumb-ink)]">
        {doc?.image ? "IMG" : "PDF"}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold leading-[normal] text-text" dir="auto">{name}</span>
        {meta ? <span className={cx("block text-[11px] leading-[normal]", doc?.status === "failed" ? "text-bad" : "text-text-3")}>{meta}</span> : null}
      </span>
    </div>
  );
}

/** Minimal formatting for the model's replies: **bold** only; everything else stays plain text. */
function Prose({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="font-semibold text-title">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>))}</>;
}
