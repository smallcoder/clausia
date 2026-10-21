"use client";
/**
 * The Clausia composer (on every screen). `size="hero"` is the big Home composer; `size="dock"` sits at the
 * bottom of inner pages. Chips fill the box with a starter sentence. Mic is shown disabled (voice notes = future).
 */
import { ArrowUp, Camera, Mic, Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { composerSendAction, composerUploadAction, type ComposerTarget } from "@/lib/assistant/composer-actions";

/** A starter chip: fills the box (text), opens the file picker (attach), or is a link (href). `disabled` = shown, not usable. */
export interface ComposerChip { label: string; short?: string; text?: string; ghost?: boolean; accent?: boolean; disabled?: boolean; attach?: boolean; href?: string }

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
    <div className={sticky ? "sticky bottom-0 z-20 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3" : ""}>
      {chips.length ? (
        <div className="no-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 sm:flex-wrap">
          {chips.map((c) => {
            const cls = `inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-[13px] transition disabled:cursor-not-allowed ${c.accent ? "bg-tile-hi font-bold shadow-soft" : c.ghost ? "border border-dashed border-gold/60 text-gold-text" : "border border-border bg-chip text-text-2 shadow-soft hover:text-text"} ${c.disabled ? "opacity-60" : ""}`;
            const label = c.short ? <><span className="sm:hidden">{c.short}</span><span className="hidden sm:inline">{c.label}</span></> : c.label;
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
        <div className="rounded-[28px] border border-border bg-field p-4 shadow-pop">
          <textarea
            ref={area}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            disabled={pending}
            placeholder={short && placeholderShort ? placeholderShort : placeholder}
            aria-label="رسالة إلى Clausia"
            onKeyDown={onKey}
            className="block min-h-[72px] w-full resize-none bg-transparent px-2 py-1 text-[16px] leading-7 text-text placeholder:text-text-4 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <RoundBtn label="إرفاق ورقة" onClick={() => fileRef.current?.click()} disabled={pending}><Paperclip size={19} strokeWidth={1.9} /></RoundBtn>
            <RoundBtn label="تصوير ورقة" onClick={() => camRef.current?.click()} disabled={pending} className="sm:hidden"><Camera size={19} strokeWidth={1.9} /></RoundBtn>
            <RoundBtn label="ملاحظة صوتية (قريبًا)" disabled><Mic size={19} strokeWidth={1.9} /></RoundBtn>
            <div className="min-w-0 flex-1 truncate text-xs text-text-4" aria-live="polite">
              {error ? <span className="text-bad">{error}</span> : status ?? "لن يُحفظ شيء قبل تأكيدك"}
            </div>
            <SendBtn onClick={send} disabled={pending || !text.trim()} />
          </div>
        </div>
      ) : (
        <>
          {error || status ? <div className="mb-2 px-3 text-xs text-text-4" aria-live="polite">{error ? <span className="text-bad">{error}</span> : status}</div> : null}
          {/* one-row pill (Roll / Case / Cases mockups): attach + mic at the start, input, send at the end */}
          <div className="flex items-center gap-2 rounded-[26px] border border-border bg-field p-2 shadow-pop">
            <RoundBtn label="إرفاق ورقة" onClick={() => fileRef.current?.click()} disabled={pending}><Paperclip size={18} strokeWidth={1.9} /></RoundBtn>
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
              className="block h-11 min-w-0 flex-1 resize-none bg-transparent px-1 py-[10px] text-[16px] leading-6 text-text placeholder:text-text-4 focus:outline-none"
            />
            <SendBtn onClick={send} disabled={pending || !text.trim()} />
          </div>
        </>
      )}
    </div>
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
      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card-2 text-text-3 transition hover:text-text disabled:opacity-40 ${className}`}>
      {children}
    </button>
  );
}
