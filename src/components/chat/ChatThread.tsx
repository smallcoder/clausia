"use client";
/**
 * The body of the chat panel (docs/design/split/*): the messages (solid lawyer bubbles on the left, Clausia's lines on
 * the right in a 720px column), paper chips, confirmation cards, glass quick answers — in the panel's own scroll area —
 * and the app's one composer under them. Sending is optimistic (the lawyer's message shows at once); no streaming.
 * A session that does not exist yet (threadId null) is made by its first message, then the URL points at it (?s=).
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useOptimistic, useRef, useState, useTransition, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { DeadlineCard } from "@/components/proposal/DeadlineCard";
import { ProposalCard } from "@/components/proposal/ProposalCard";
import type { DeadlineCardEntry } from "@/lib/deadlines/cards";
import { useReadProgress } from "@/components/documents/useReadProgress";
import { SourceChip } from "@/components/cite/SourceChip";
import { useDrop } from "@/components/shell/DropZone";
import { Bar } from "@/components/shell/PageSkeleton";
import { routeDrop } from "@/lib/documents/drop";
import { AskChips } from "./AskChips";
import { ChatComposer } from "./ChatComposer";
import { DropPicker } from "./DropPicker";
import { useTurnSteps } from "./useTurnSteps";
import { ChipIcon, MorningBlock } from "./MorningBlock";
import { useDraft } from "./draft";
import { shortDay, withSession } from "./panel-types";
import { sendMessageAction } from "@/lib/assistant/actions";
import { composerSendAction, composerUploadAction } from "@/lib/assistant/composer-actions";
import { modePlaceholder } from "@/lib/assistant/modes";
import { uploadDocumentAction } from "@/lib/documents/actions";
import { UNAVAILABLE_TEXT } from "@/lib/llm/unavailable";
import type { EditRow } from "@/lib/edits";
import type { Chip, MorningData } from "@/lib/morning/types";
import type { Proposal } from "@/lib/proposals";

export interface ChatItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  attachments: { documentId: string; fileName: string }[];
  proposals: Proposal[];
  /** «استخدمت:» — the papers this answer really used (saved with the answer; empty = no footer) */
  used: UsedSource[];
}

/** One chip of the «استخدمت:» footer: where the paper panel opens (page, and the sentence when there is one). */
export interface UsedSource {
  key: string;
  documentId: string;
  page: number;
  quote: string | null;
  start: number | null;
  end: number | null;
  /** «صحيفة دعوى · ص 2» */
  label: string;
}

/** A paper uploaded in this thread (for the attachment chip). */
export interface ThreadDoc {
  name: string;
  pages: number | null;
  status: "pending" | "reading" | "done" | "failed";
  image: boolean;
}

/** The upload posts «أرفقتُ مستندًا: X» for the lawyer; the chip says it already, so no bubble for it. */
const AUTO_ATTACH = /^أرفقتُ مستندًا: /;

export function ChatThread({ threadId, caseId, clientId = null, hearing, items, lookup, rows = {}, deadlines = {}, docs = {}, chips = [], morning = null, starter = "" }: {
  /** null = a new session (the first message makes it) */
  threadId: string | null;
  caseId: string | null;
  /** a client's chat: a new session made from here belongs to this client (never with a case) */
  clientId?: string | null;
  /** a new session made from here is about this hearing */
  hearing: { id: string; date: string } | null;
  items: ChatItem[];
  lookup: Record<string, string>;
  /** «old ← new» lines of the change ops in the cards (see ProposalCard) */
  rows?: Record<string, EditRow[]>;
  /** the deadlines cards' data by proposal id (empty with the flag off) */
  deadlines?: Record<string, DeadlineCardEntry>;
  docs?: Record<string, ThreadDoc>;
  chips?: Chip[];
  /** the general context's top (the morning brief, the «noticed» cards and their chips); it is not a saved message. A promise: it streams in after the thread */
  morning?: Promise<MorningData | null> | null;
  /** a starter sentence already in the box (from a brief chip's link); it is not sent */
  starter?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { text, setText, mode, setMode, chips: askChips, addChip, removeChip, clearChips, focusTick } = useDraft();
  const [error, setError] = useState<string | null>(null);
  const [sending, startSend] = useTransition();
  const [uploading, startUpload] = useTransition();
  const [turn, setTurn] = useState<string | null>(null); // the id of the turn this browser is waiting for (its live steps are polled under it)
  const [pick, setPick] = useState<File | null>(null); // a paper dropped in the general context: waiting for the case to be chosen
  const { dropped, clear: clearDrop } = useDrop();
  const [shown, addOptimistic] = useOptimistic(items, (cur, t: string) => [...cur, { id: `tmp-${cur.length}`, role: "user" as const, content: t, createdAt: new Date().toISOString(), attachments: [], proposals: [], used: [] }]);
  const scroller = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  // a starter sentence from a link fills the box once (it never sends)
  const applied = useRef("");
  useEffect(() => {
    if (starter && applied.current !== starter) { applied.current = starter; setText(starter); }
  }, [starter, setText]);

  // «اسأل Clausia» put a chip in the composer (or «عدّل في المحادثة» asked for the cursor): the cursor goes in the box
  useEffect(() => {
    if (focusTick) boxRef.current?.focus();
  }, [focusTick]);

  // keep the latest message in view: the panel's own scroll area (not the window)
  useEffect(() => {
    const el = scroller.current;
    if (!el || (morning && shown.length === 0)) return; // an empty general chat opens at the top: the brief is read from its start
    const go =() => el.scrollTo({ top: el.scrollHeight });
    go();
    const raf = requestAnimationFrame(go);
    return () => cancelAnimationFrame(raf);
  }, [threadId, shown.length, sending]);

  /** a session was just made: the URL points at it (the hearing link and the starter are done with) */
  const open = (id: string) => router.replace(withSession(pathname, new URLSearchParams(params.toString()), id));

  function send(quick?: string) {
    const t = (quick ?? text).trim();
    if (!t || sending) return;
    setError(null);
    // the chips go with the lawyer's own message (not with a quick answer) and are used up by it
    const asked = quick === undefined ? askChips : [];
    if (quick === undefined) { setText(""); clearChips(); }
    const turnId = crypto.randomUUID();
    setTurn(turnId);
    startSend(async () => {
      try {
        addOptimistic(t);
        let err: string | undefined;
        let saved = false; // the lawyer's message is in the thread
        if (threadId) {
          const r = await sendMessageAction(threadId, t, mode, asked, turnId);
          err = r.error;
          saved = !!r.saved;
        } else {
          const r = await composerSendAction({ caseId, clientId, hearingId: hearing?.id }, t, mode, asked, turnId);
          err = r.error;
          saved = !!r.threadId;
          if (r.threadId) open(r.threadId);
        }
        if (err) {
          setError(err);
          // not in the thread (session expired, thread missing…): give the text back instead of losing it
          if (!saved) { setText((cur) => cur || t); asked.forEach(addChip); }
        }
        router.refresh();
      } finally {
        setTurn(null);
      }
    });
  }

  /** `pickedCase`: the case chosen for a paper dropped in the general context (it goes to that case's chat, and we go there to see its card) */
  function onFile(f: File | undefined, pickedCase?: string) {
    if (!f) return;
    setError(null);
    setPick(null);
    const fd = new FormData();
    fd.set("file", f);
    startUpload(async () => {
      let went = false;
      try {
        if (pickedCase) {
          fd.set("caseId", pickedCase);
          const r = await uploadDocumentAction(fd);
          if (r.threadId && (r.ok || r.warning)) { went = true; router.push(`/cases/${pickedCase}?s=${r.threadId}`); }
          if (!r.ok) setError(`لم يُرفع «${f.name}»: ${r.error ?? "حدث خطأ"}`);
        } else if (threadId) {
          fd.set("threadId", threadId);
          if (caseId) fd.set("caseId", caseId);
          const r = await uploadDocumentAction(fd);
          if (!r.ok) setError(`لم يُرفع «${f.name}»: ${r.error ?? "حدث خطأ"}`);
        } else {
          const r = await composerUploadAction({ caseId, clientId, hearingId: hearing?.id }, fd);
          if (r.threadId) open(r.threadId);
          if (r.error && !r.threadId) setError(`لم يُرفع «${f.name}»: ${r.error ?? "حدث خطأ"}`);
        }
      } catch {
        setError(`لم يُرفع «${f.name}»: تعذّر الاتصال`);
      }
      if (fileRef.current) fileRef.current.value = "";
      if (!went) router.refresh();
    });
  }

  // a paper dropped anywhere on the page or the chat (DropZone): to the open case, or ask which case, or say why not
  useEffect(() => {
    if (!dropped) return;
    clearDrop();
    const route = routeDrop(dropped.files, { caseId, busy: sending || uploading });
    if (route.kind === "error") { setPick(null); setError(route.message); return; }
    setError(null);
    if (route.kind === "upload") onFile(dropped.files[0]);
    else setPick(dropped.files[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to a new drop only
  }, [dropped]);

  const busy = sending || uploading;
  const lastSpoken = [...shown].reverse().find((x) => x.role === "user" || x.content.trim());
  const answers = lastSpoken?.role === "assistant" && !busy ? quickAnswers(lastSpoken.content) : [];
  const reading = useReadProgress(uploading);
  const step = useTurnSteps(sending ? turn : null); // the real step Clausia is on; none yet: the plain waiting line
  const status = sending ? (step ?? "Clausia بيكتب…") : uploading ? reading : null;

  /** the empty chat's first line (also what stands in for the brief when it could not be built) */
  const greeting = shown.length === 0 ? (
    <ClausiaLine>
              <p>{hearing ? `جلسة ${shortDay(hearing.date)}: قول لي حصل إيه فيها، أو ارفع ورقة منها.` : caseId ? "اكتب لي اللي استجد في القضية دي، أو ارفع ورقة." : clientId ? "اسألني عن الموكل ده وقضاياه، أو قول لي على قضية جديدة ليه." : "أهلًا. احكي لي عن الموكل أو القضية، أو ارفع الصحيفة."} هجهّز لك اللي هيتحفظ في بطاقة، ومش هيتحفظ حاجة قبل ما تأكد.</p>
            </ClausiaLine>
  ) : null;
  const chipRow = (list: Chip[]) => list.length && !busy ? (
    <div className="flex flex-wrap gap-1.5">
      {list.map((c) => (
        <button key={c.label} type="button" onClick={() => { setText(c.text); boxRef.current?.focus(); }} className={cx(CHIP, c.icon && "gap-1.75")}><ChipIcon icon={c.icon} />{c.label}</button>
      ))}
    </div>
  ) : null;

  return (
    <>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex w-full max-w-messages flex-col gap-4 px-4 pb-12 pt-4 xl:px-4.5 xl:pt-6">
          {morning ? (
            <Suspense fallback={<MorningSkeleton />}>
              <Await promise={morning}>{(m) => (m ? <MorningBlock data={m} /> : greeting)}</Await>
            </Suspense>
          ) : null}

          {morning ? null : greeting}

          <ol className="flex flex-col gap-4">
            {shown.map((m) => (
              <li key={m.id} className="flex flex-col gap-4">
                {m.role === "user" ? (
                  <>
                    {m.attachments.length && AUTO_ATTACH.test(m.content) ? null : (
                      <div className="max-w-bubble self-end whitespace-pre-wrap break-words rounded-lg rounded-bl-sm border border-border-2 bg-card px-3.5 py-2.5 text-md leading-[1.7] text-text dark:bg-card-2 xl:max-w-bubble-sm">
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
                    {m.used.length ? <UsedFooter items={m.used} /> : null}
                    {m === lastSpoken && answers.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {answers.map((a) => (
                          <button key={a.label} type="button" onClick={() => send(a.text)} className={CHIP}>
                            {a.label}
                          </button>
                        ))}
                        <button type="button" onClick={() => boxRef.current?.focus()} className={CHIP}>هكتب الرد</button>
                      </div>
                    ) : null}
                    {m.proposals.map((p, i) => (
                      <div key={p.id} className={cx((m.content.trim() || i > 0) && "mt-3.5")}>
                        {p.ops.some((o) => o.tool === "add_deadline")
                          ? (deadlines[p.id] ? <DeadlineCard key={`${p.id}:${p.status}`} proposal={p} entry={deadlines[p.id]} /> : null) // flag off: no card; keyed by status so «تراجع» resets the card
                          : <ProposalCard proposal={p} lookup={lookup} rows={rows} />}
                      </div>
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

          {/* the starter chips: the case's own, or (general context) the brief's, which arrive with it */}
          {morning ? (shown.length === 0 ? <Suspense fallback={null}><Await promise={morning}>{(m) => chipRow(m?.chips ?? [])}</Await></Suspense> : null) : chipRow(chips)}
        </div>
      </div>

      {pick ? <DropPicker fileName={pick.name} onPick={(c) => (c ? onFile(pick, c) : onFile(pick))} onCancel={() => setPick(null)} /> : null}

      <ChatComposer id="panel" value={text} onChange={setText} onSend={() => send()} onFile={onFile}
        sending={sending} busy={busy} status={status} error={error} onDismissError={() => setError(null)}
        placeholder={modePlaceholder(mode, !!caseId)} mode={mode} onMode={setMode} boxRef={boxRef} fileRef={fileRef}
        context={<AskChips chips={askChips} onRemove={removeChip} />} />
    </>
  );
}

/** Reads a promise the server started (the brief) once it is done; the Suspense around it shows its skeleton meanwhile. */
function Await<T>({ promise, children }: { promise: Promise<T>; children: (v: T) => ReactNode }) {
  return <>{children(use(promise))}</>;
}

/** The brief's place while it loads: a few lines, so the thread and the composer are already there. */
function MorningSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="جارٍ تجهيز ملخص اليوم" className="skel-shimmer space-y-3">
      <Bar w="55%" h={16} /><Bar w="85%" h={13} /><Bar w="70%" h={13} />
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

/** quick answers and starters: glass-flat chips (no blur: they sit inside the glass panel), 36px tall (44px hit area) */
const CHIP = "tap glass-flat inline-flex min-h-9 shrink-0 items-center rounded-full px-3.75 py-1 text-sm font-medium glass-icon transition hover:text-text";

/** «استخدمت: الصحيفة ص 2، الإنذار ص 1» — the papers this answer really used; each chip opens the paper at that page (the sentence marked when there is one). */
function UsedFooter({ items }: { items: UsedSource[] }) {
  return (
    <div role="group" aria-label="المصادر المستخدمة" className="mt-2.5 flex flex-wrap items-center gap-1.5">
      <span className="text-sm font-semibold text-text-3">استخدمت:</span>
      {items.map((u) => (
        <SourceChip key={u.key} cite={{ id: `used:${u.key}`, documentId: u.documentId, page: u.page, start: u.start, end: u.end, quote: u.quote, label: u.label, about: null }} />
      ))}
    </div>
  );
}

/** The model could not answer (402 / 429 / 5xx / timeout): one calm notice, not a Clausia sentence. */
function UnavailableNotice() {
  return (
    <p role="status" className="inline-flex items-center gap-2 rounded-full border border-border-2 bg-card-2 px-4 py-2 text-base leading-6 text-text-2">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-text-4" />{UNAVAILABLE_TEXT}
    </p>
  );
}

/** Clausia's turn: its text full width (the panel header already carries the «C» mark); cards go under the text. */
function ClausiaLine({ children }: { children: ReactNode }) {
  return <div className="min-w-0 text-md leading-[1.9] text-text">{children}</div>;
}

const pagesLabel = (n: number) => (n === 1 ? "صفحة واحدة" : n === 2 ? "صفحتين" : n <= 10 ? `${n} صفحات` : `${n} صفحة`);
const READ: Record<ThreadDoc["status"], string> = { done: "اتقرت", reading: "بتتقري…", pending: "لسه ما اتقرتش", failed: "ما اتقرتش" };

/** A paper the lawyer sent: a solid chip (thumb · name · pages · read state), tucked under the bubble it came with. */
function AttachmentChip({ name, doc, tuck }: { name: string; doc?: ThreadDoc; tuck?: boolean }) {
  const meta = doc ? [doc.pages ? pagesLabel(doc.pages) : null, READ[doc.status]].filter(Boolean).join(" · ") : null;
  return (
    <div className={cx("flex max-w-bubble items-center gap-2.5 self-end rounded-md border border-border-2 bg-card py-2 pe-2.5 ps-3.5 dark:bg-card-2 xl:max-w-bubble-sm", tuck && "-mt-1.5")}>
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
