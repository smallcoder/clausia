"use client";
/**
 * The Home composer, drawn as docs/design/*Home.dc.html (a Home-only variant of shell/Composer's hero size):
 * starter chips, then the glass box — C mark + 2-line field, attach and mic at the start, send at the end.
 * Desktop: the «Clausia بتجهّز…» line under the box, no fade. Mobile: the short reminder sits inside the
 * button row, the dock fades the page under it. Same send / upload actions as the shared composer.
 */
import { ArrowUp, File, Gavel, List, Plus, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useReadProgress } from "@/components/documents/useReadProgress";
import { composerSendAction, composerUploadAction } from "@/lib/assistant/composer-actions";

const CHIPS = [
  { label: "موكل وقضية جديدة", text: "موكل جديد: ", Icon: User },
  { label: "سجّل قرار جلسة", text: "قرار جلسة النهارده في قضية ", Icon: Gavel },
  { label: "المطلوب مني الأسبوع ده", short: "المطلوب مني", text: "إيه المطلوب مني الأسبوع ده؟", Icon: List },
  { label: "ارفع ورقة", attach: true, Icon: File },
] as const;

const PLACEHOLDER = "اكتب لـ Clausia… حصل إيه في الجلسة، موكل جديد، أو أي سؤال عن قضاياك";
const PLACEHOLDER_SHORT = "اكتب لـ Clausia… حصل إيه في الجلسة، أو أي سؤال";
const MAX_H = 160;

export function HomeComposer() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const progress = useReadProgress(reading);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [short, setShort] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  useEffect(() => {
    const m = window.matchMedia("(max-width: 639px)");
    const on = () => setShort(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);

  /** the field is drawn 2 lines tall; it grows with longer text up to MAX_H */
  function fit(t: string) {
    const el = area.current;
    if (!el) return;
    el.style.height = "";
    if (t) el.style.height = `${Math.min(el.scrollHeight, MAX_H)}px`;
  }

  function fill(t: string) {
    setText(t);
    requestAnimationFrame(() => { fit(t); area.current?.focus(); });
  }

  function send() {
    const t = text.trim();
    if (!t || pending) return;
    setError(null);
    setStatus("Clausia بيكتب…");
    start(async () => {
      const r = await composerSendAction({ kind: "new" }, t);
      setStatus(null);
      if (r.error) { setError(r.error); return; }
      setText("");
      fit("");
      if (r.threadId) router.push(`/chat/${r.threadId}`);
    });
  }

  function upload(f?: File) {
    if (!f || pending) return;
    setError(null);
    setReading(true);
    const fd = new FormData();
    fd.set("file", f);
    start(async () => {
      const r = await composerUploadAction({ kind: "new" }, fd);
      setReading(false);
      if (r.error) setError(r.error);
      if (r.threadId) router.push(`/chat/${r.threadId}`);
    });
  }

  const note = error ? <span className="text-bad">{error}</span> : reading ? progress : status;
  return (
    <Dock>
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-1 pb-3 sm:justify-center sm:overflow-visible sm:px-0 sm:pb-3.5">
        {CHIPS.map((c) => (
          <button key={c.label} type="button" disabled={pending}
            onClick={() => ("attach" in c ? fileRef.current?.click() : fill(c.text))}
            className="tap glass glass-icon inline-flex h-9 shrink-0 items-center gap-1.75 rounded-full px-3.5 text-sm font-medium transition hover:text-text sm:h-control sm:gap-2 sm:px-4">
            <c.Icon strokeWidth={1.8} aria-hidden className="size-3.5 sm:size-glyph-sm" />
            {"short" in c ? <><span className="sm:hidden">{c.short}</span><span className="hidden sm:inline">{c.label}</span></> : c.label}
          </button>
        ))}
      </div>
      <input ref={fileRef} type="file" accept="application/pdf,image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0] ?? undefined)} />
      <div className="glass rounded-xl px-3 pb-2.5 pt-3.5 sm:px-3.5 sm:pb-3 sm:pt-4">
        <div className="flex items-start gap-2.5 px-1 sm:gap-3 sm:px-1.5 sm:pt-0.5">
          <span aria-hidden className="mark font-num mt-0.5 inline-flex size-mark-sm shrink-0 items-center justify-center rounded-sm text-xs font-extrabold sm:size-mark sm:text-sm dark:size-6 dark:border dark:border-border sm:dark:size-7">C</span>
          <textarea
            ref={area}
            value={text}
            rows={1}
            disabled={pending}
            onChange={(e) => { setText(e.target.value); fit(e.target.value); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            placeholder={short ? PLACEHOLDER_SHORT : PLACEHOLDER}
            aria-label="اكتب لـ Clausia"
            className="block min-h-control-xl min-w-0 flex-1 resize-none bg-transparent p-0 text-md leading-[1.6] text-text placeholder:text-text-4 focus:outline-none sm:min-h-14 sm:text-lg sm:leading-[1.65]"
          />
        </div>
        <div className="mt-1.5 flex items-center gap-2 sm:mt-2">
          <Round label="إضافة ورقة" onClick={() => fileRef.current?.click()} disabled={pending}><Plus strokeWidth={1.8} className="size-4.25 sm:size-glyph" /></Round>
          <div className="min-w-0 flex-1 truncate text-center text-xs leading-[15px] text-text-4 sm:text-start sm:text-sm" aria-live="polite">
            {note ?? <span className="sm:hidden">مفيش حاجة بتتحفظ من غير موافقتك</span>}
          </div>
          <button type="button" onClick={send} disabled={pending || !text.trim()} aria-label="إرسال"
            className="tap bg-primary-fill inline-flex size-control shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed sm:size-10">
            <ArrowUp strokeWidth={2.4} className="size-glyph sm:size-4.75" />
          </button>
        </div>
      </div>
      <p className="mt-2.5 hidden text-center text-xs leading-4 text-text-4 sm:block">Clausia بتجهّز، وإنت اللي بتأكد. مفيش حاجة بتتحفظ من غير موافقتك.</p>
    </Dock>
  );
}

function Round({ label, onClick, disabled, children }: { label: string; onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className="tap glass-icon inline-flex size-control shrink-0 items-center justify-center rounded-full border border-border-2 bg-transparent transition hover:text-text disabled:opacity-40 sm:size-10">
      {children}
    </button>
  );
}

/**
 * Fixed to the viewport bottom like the mockup (780px column), with a spacer of the same measured height in the
 * page flow so the last card never sits under it. Mobile: 40/12/18 padding over the page fade; desktop: 0/24/24, no fade.
 */
function Dock({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setH(Math.ceil(e.borderBoxSize?.[0]?.blockSize ?? e.target.getBoundingClientRect().height)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  return (
    <>
      <div aria-hidden style={{ height: h }} className="shrink-0" />
      <div ref={box} className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(18px+env(safe-area-inset-bottom))] pt-10 bg-fade sm:px-6 sm:pb-6 sm:pt-15" /* ds-allow: safe-area inset needs calc() */>
        <div className="mx-auto w-full max-w-composer">{children}</div>
      </div>
    </>
  );
}
