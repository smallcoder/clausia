"use client";
/**
 * Thread UI (docs/design/*Chat*.dc.html, v2): solid lawyer bubbles on the left, Clausia lines with the «C» mark on
 * the right, paper chips, confirmation cards, glass quick answers, and the glass composer in the 780px ChatDock.
 * Sending is optimistic (the lawyer's message shows at once); no streaming.
 */
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { ProposalCard } from "@/components/proposal/ProposalCard";
import { useReadProgress } from "@/components/documents/useReadProgress";
import { ChatComposer } from "./ChatComposer";
import { sendMessageAction } from "@/lib/assistant/actions";
import { uploadDocumentAction } from "@/lib/documents/actions";
import { UNAVAILABLE_TEXT } from "@/lib/llm/unavailable";
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
  const reading = useReadProgress(uploading);
  const status = sending ? "Clausia بيكتب…" : uploading ? reading : null;

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

      <ol className="flex flex-col gap-4.5 sm:gap-5.5">
        {shown.map((m) => (
          <li key={m.id} className="flex flex-col gap-4.5 sm:gap-5.5">
            {m.role === "user" ? (
              <>
                {m.attachments.length && AUTO_ATTACH.test(m.content) ? null : (
                  <div className="max-w-bubble self-end whitespace-pre-wrap break-words rounded-lg rounded-bl-sm border border-border-2 bg-card px-4.25 py-3.25 text-md leading-[1.75] text-text dark:bg-card-2 sm:max-w-bubble-sm">
                    {m.content}
                  </div>
                )}
                {m.attachments.map((a, i) => <AttachmentChip key={a.documentId || a.fileName} name={a.fileName} doc={docs[a.documentId]} tuck={i === 0 && !AUTO_ATTACH.test(m.content)} />)}
              </>
            ) : m.content === UNAVAILABLE_TEXT && !m.proposals.length ? (
              <ClausiaLine><UnavailableNotice /></ClausiaLine>
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

      <div className="min-h-7.5 flex-1" />

      {/* the thread's own composer (optimistic send + upload): the v2 two-row glass box of the Chat mockups */}
      <ChatComposer id={threadId} value={text} onChange={setText} onSend={() => send()} onFile={onFile}
        sending={sending} busy={busy} status={status} error={error} onDismissError={() => setError(null)}
        placeholder={shown.length ? "ردّ على Clausia…" : "اكتب لـ Clausia…"} boxRef={boxRef} fileRef={fileRef} />
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

/** quick answers and starters: glass chips (floating controls), 36px tall (44px hit area) */
const CHIP = "tap glass inline-flex min-h-9 shrink-0 items-center rounded-full px-3.75 py-1 text-sm font-medium glass-icon transition hover:text-text";

/**
 * Clausia's turn: the «C» mark and its text (cards go under the text). Desktop: the mark beside the text.
 * Mobile: a «C · Clausia» label row, the text full width under it.
 */
/** The model could not answer (402 / 429 / 5xx / timeout): one calm notice, not a Clausia sentence. */
function UnavailableNotice() {
  return (
    <p role="status" className="inline-flex items-center gap-2 rounded-full border border-border-2 bg-card-2 px-4 py-2 text-base leading-6 text-text-2">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-text-4" />{UNAVAILABLE_TEXT}
    </p>
  );
}

function ClausiaLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
      <div className="flex items-center gap-2 self-start">
        <span aria-hidden className="mark font-num inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-xs font-extrabold sm:size-7 sm:text-sm">C</span>
        <span className="text-sm font-bold leading-[normal] text-title sm:hidden">Clausia</span>
      </div>
      <div className="min-w-0 flex-1 text-md leading-[1.8] text-text sm:pt-0.75">{children}</div>
    </div>
  );
}

const pagesLabel = (n: number) => (n === 1 ? "صفحة واحدة" : n === 2 ? "صفحتين" : n <= 10 ? `${n} صفحات` : `${n} صفحة`);
const READ: Record<ThreadDoc["status"], string> = { done: "اتقرت", reading: "بتتقري…", pending: "لسه ما اتقرتش", failed: "ما اتقرتش" };

/** A paper the lawyer sent: a solid chip (thumb · name · pages · read state), tucked under the bubble it came with. */
function AttachmentChip({ name, doc, tuck }: { name: string; doc?: ThreadDoc; tuck?: boolean }) {
  const meta = doc ? [doc.pages ? pagesLabel(doc.pages) : null, READ[doc.status]].filter(Boolean).join(" · ") : null;
  return (
    <div className={cx("flex max-w-bubble items-center gap-2.5 self-end rounded-md border border-border-2 bg-card py-2 pe-2.5 ps-3.5 dark:bg-card-2 sm:max-w-bubble-sm", tuck && "-mt-1.5")}>
      <span aria-hidden className="flex h-9 w-7.5 shrink-0 items-center justify-center rounded-sm bg-paper-thumb text-xs font-extrabold text-paper-thumb-ink">
        {doc?.image ? "IMG" : "PDF"}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold leading-[normal] text-text" dir="auto">{name}</span>
        {meta ? <span className={cx("block text-xs leading-[normal]", doc?.status === "failed" ? "text-bad" : "text-text-3")}>{meta}</span> : null}
      </span>
    </div>
  );
}

/** Minimal formatting for the model's replies: **bold** only; everything else stays plain text. */
function Prose({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="font-semibold text-title">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>))}</>;
}
