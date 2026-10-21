"use client";
/**
 * The Clausia composer (on every screen). `size="hero"` is the big Home composer; `size="dock"` sits at the
 * bottom of inner pages. Chips fill the box with a starter sentence. Mic is shown disabled (voice notes = future).
 */
import { ArrowUp, CalendarDays, Camera, Check, Clock, File, Gavel, List, Mic, Plus, Search, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { composerSendAction, composerUploadAction, type ComposerTarget } from "@/lib/assistant/composer-actions";

/** A starter chip: fills the box (text), opens the file picker (attach), or is a link (href). `disabled` = shown, not usable. */
/** Chip icons by name (server pages can't pass components to this client component). */
const CHIP_ICONS = { user: User, gavel: Gavel, list: List, file: File, calendar: CalendarDays, search: Search, plus: Plus, camera: Camera, clock: Clock, check: Check } as const;
export type ChipIcon = keyof typeof CHIP_ICONS;
export interface ComposerChip { label: string; short?: string; text?: string; ghost?: boolean; accent?: boolean; disabled?: boolean; attach?: boolean; href?: string; icon?: ChipIcon }

export function Composer({ target, placeholder = "اكتب لـ Clausia… ما حدث في الجلسة، موكل جديد، أو أي سؤال عن قضاياك", placeholderShort, chips = [], size = "dock", sticky = true }: {
  target: ComposerTarget;
  placeholder?: string;
  chips?: ComposerChip[];
  /** shorter placeholder below 640px */
  placeholderShort?: string;
  size?: "hero" | "dock";
  sticky?: boolean;
}) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  function go(threadId?: string) {
    if (!threadId) return;
    if (target.kind === "thread") router.refresh();
    else router.push(`/chat/${threadId}`);
  }

  function send() {
    const t = text.trim();
    if (!t || pending) return;
    setError(null);
    setStatus("Clausia بيكتب…");
    start(async () => {
      const r = await composerSendAction(target, t);
      setStatus(null);
      if (r.error) { setError(r.error); return; }
      setText("");
      go(r.threadId);
    });
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
  }

  function upload(f?: File) {
    if (!f || pending) return;
    setError(null);
    setStatus("بقرا الورقة صفحة صفحة…");
    const fd = new FormData();
    fd.set("file", f);
    start(async () => {
      const r = await composerUploadAction(target, fd);
      setStatus(null);
      if (r.error) setError(r.error);
      go(r.threadId);
    });
  }

  const hero = size === "hero";
  const [short, setShort] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 639px)");
    const on = () => setShort(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return (
    <MaybeDock on={sticky}>
      {chips.length ? (
        <div className="no-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 sm:flex-wrap sm:justify-center">
          {chips.map((c) => {
            const cls = `glass inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13.5px] transition disabled:cursor-not-allowed sm:h-10 ${c.accent ? "font-bold text-gold" : c.ghost ? "text-text-3" : "text-text-2 hover:text-text"} ${c.disabled ? "opacity-60" : ""}`;
            const Icon = c.icon ? CHIP_ICONS[c.icon] : null;
            const text = c.short ? <><span className="sm:hidden">{c.short}</span><span className="hidden sm:inline">{c.label}</span></> : c.label;
            const label = <>{Icon ? <Icon size={15} strokeWidth={1.9} aria-hidden /> : null}{text}</>;
            if (c.href && !c.disabled) return <a key={c.label} href={c.href} className={cls}>{label}</a>;
            return (
              <button key={c.label} type="button" disabled={pending || c.disabled} aria-disabled={c.disabled}
                onClick={() => { if (c.attach) fileRef.current?.click(); else if (c.text) { setText(c.text); area.current?.focus(); } }}
                className={cls}>
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
      <input ref={fileRef} type="file" accept="application/pdf,image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0] ?? undefined)} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => upload(e.target.files?.[0] ?? undefined)} />
      {hero ? (
        <div className="glass rounded-[30px] p-4">
          <div className="flex items-start gap-3">
          <span aria-hidden className="mark font-num mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-[9px] text-[13px] font-black">C</span>
          <textarea
            ref={area}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={short ? 2 : 3}
            disabled={pending}
            placeholder={short && placeholderShort ? placeholderShort : placeholder}
            aria-label="رسالة إلى Clausia"
            onKeyDown={onKey}
            className="block min-h-[64px] w-full resize-none bg-transparent px-2 py-1 text-[16px] leading-7 text-text placeholder:text-text-4 focus:outline-none sm:text-[17px]"
          />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <RoundBtn label="إرفاق ورقة" onClick={() => fileRef.current?.click()} disabled={pending}><Plus size={19} strokeWidth={1.9} /></RoundBtn>
            <RoundBtn label="تصوير ورقة" onClick={() => camRef.current?.click()} disabled={pending} className="sm:hidden"><Camera size={19} strokeWidth={1.9} /></RoundBtn>
            <RoundBtn label="ملاحظة صوتية (قريبًا)" disabled><Mic size={19} strokeWidth={1.9} /></RoundBtn>
            <div className="min-w-0 flex-1 truncate text-xs text-text-4" aria-live="polite">
              {error ? <span className="text-bad">{error}</span> : status ?? ""}
            </div>
            <SendBtn onClick={send} disabled={pending || !text.trim()} />
          </div>
        </div>
      ) : null}
      {hero ? <p className="mt-2.5 text-center text-[11.5px] text-text-4">Clausia بتجهّز، وإنت اللي بتأكد. مفيش حاجة بتتحفظ من غير موافقتك.</p> : null}
      {hero ? null : (
        <>
          {error || status ? <div className="mb-2 px-3 text-xs text-text-4" aria-live="polite">{error ? <span className="text-bad">{error}</span> : status}</div> : null}
          {/* one-row pill (Roll / Case / Cases mockups): attach + mic at the start, input, send at the end */}
          <div className="glass flex items-center gap-2 rounded-[28px] p-2">
            <RoundBtn label="إرفاق ورقة" onClick={() => fileRef.current?.click()} disabled={pending}><Plus size={18} strokeWidth={1.9} /></RoundBtn>
            <RoundBtn label="ملاحظة صوتية (قريبًا)" disabled className="hidden sm:inline-flex"><Mic size={18} strokeWidth={1.9} /></RoundBtn>
            <textarea
              ref={area}
              value={text}
              onChange={(e) => { setText(e.target.value); e.currentTarget.style.height = "auto"; e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 140)}px`; }}
              rows={1}
              disabled={pending}
              placeholder={short && placeholderShort ? placeholderShort : placeholder}
              aria-label="رسالة إلى Clausia"
              onKeyDown={onKey}
              className="block h-11 min-w-0 flex-1 resize-none bg-transparent px-1 py-[10px] [&:placeholder-shown]:overflow-hidden [&:placeholder-shown]:text-ellipsis [&:placeholder-shown]:whitespace-nowrap text-[16px] leading-6 text-text placeholder:text-text-4 focus:outline-none"
            />
            <SendBtn onClick={send} disabled={pending || !text.trim()} />
          </div>
        </>
      )}
    </MaybeDock>
  );
}

function MaybeDock({ on, children }: { on: boolean; children: React.ReactNode }) {
  return on ? <FixedDock>{children}</FixedDock> : <div>{children}</div>;
}

/**
 * Bottom dock: fixed to the viewport bottom (780px column, faded background), plus a spacer of the same
 * measured height in the page flow, so the last row of a page never sits under the composer.
 */
export function FixedDock({ children, width = 780 }: { children: React.ReactNode; width?: number }) {
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
      <div ref={box} className="bg-fade fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-6 sm:px-8 sm:pb-6">
        <div className="mx-auto w-full" style={{ maxWidth: width }}>{children}</div>
      </div>
    </>
  );
}

function SendBtn({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label="إرسال"
      className="bg-primary-fill inline-flex size-11 shrink-0 items-center justify-center rounded-full transition disabled:opacity-50">
      <ArrowUp size={20} strokeWidth={2.6} />
    </button>
  );
}

function RoundBtn({ label, onClick, disabled, className = "", children }: { label: string; onClick?: () => void; disabled?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={`glass glass-icon ${className.includes("hidden") ? "" : "inline-flex"} size-10 shrink-0 items-center justify-center rounded-full transition hover:text-text disabled:opacity-40 ${className}`}>
      {children}
    </button>
  );
}
