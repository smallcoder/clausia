"use client";
/**
 * The Clausia composer (on every screen). `size="hero"` is the big Home composer; `size="dock"` sits at the
 * bottom of inner pages. Chips fill the box with a starter sentence. Mic is shown disabled (voice notes = future).
 */
import { ArrowUp, Camera, Mic, Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { composerSendAction, composerUploadAction, type ComposerTarget } from "@/lib/assistant/composer-actions";

export function Composer({ target, placeholder = "اكتب لـ Clausia… ما حدث في الجلسة، موكل جديد، أو أي سؤال عن قضاياك", chips = [], size = "dock", sticky = true }: {
  target: ComposerTarget;
  placeholder?: string;
  chips?: { label: string; short?: string; text: string; ghost?: boolean }[];
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
  return (
    <div className={sticky ? "sticky bottom-0 z-20 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3" : ""}>
      {chips.length ? (
        <div className="no-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 sm:flex-wrap">
          {chips.map((c) => (
            <button key={c.label} type="button" disabled={pending}
              onClick={() => { setText(c.text); area.current?.focus(); }}
              className={`h-9 shrink-0 rounded-full px-3.5 text-[13px] transition ${c.ghost ? "border border-dashed border-gold/60 text-gold-text" : "border border-border bg-chip text-text-2 shadow-soft hover:text-text"}`}>
              {c.short ? <><span className="sm:hidden">{c.short}</span><span className="hidden sm:inline">{c.label}</span></> : c.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className={`border border-border bg-field ${hero ? "rounded-[28px] p-4 shadow-pop" : "rounded-[24px] p-3 shadow-card"}`}>
        <textarea
          ref={area}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={hero ? 3 : 1}
          disabled={pending}
          placeholder={placeholder}
          aria-label="رسالة إلى Clausia"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
          className={`block w-full resize-none bg-transparent px-2 text-text placeholder:text-text-4 focus:outline-none ${hero ? "min-h-[72px] py-1 text-[16px] leading-7" : "py-2 text-[15px] leading-6"}`}
        />
        <div className="mt-2 flex items-center gap-2">
          <input ref={fileRef} type="file" accept="application/pdf,image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0] ?? undefined)} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => upload(e.target.files?.[0] ?? undefined)} />
          <RoundBtn label="إرفاق ورقة" onClick={() => fileRef.current?.click()} disabled={pending}><Paperclip size={19} strokeWidth={1.9} /></RoundBtn>
          <RoundBtn label="تصوير ورقة" onClick={() => camRef.current?.click()} disabled={pending} className="sm:hidden"><Camera size={19} strokeWidth={1.9} /></RoundBtn>
          <RoundBtn label="ملاحظة صوتية (قريبًا)" disabled><Mic size={19} strokeWidth={1.9} /></RoundBtn>
          <div className="min-w-0 flex-1 truncate text-xs text-text-4" aria-live="polite">
            {error ? <span className="text-bad">{error}</span> : status ?? "لن يُحفظ شيء قبل تأكيدك"}
          </div>
          <button type="button" onClick={send} disabled={pending || !text.trim()} aria-label="إرسال"
            className="bg-primary-fill inline-flex size-11 shrink-0 items-center justify-center rounded-full transition disabled:opacity-50">
            <ArrowUp size={20} strokeWidth={2.6} />
          </button>
        </div>
      </div>
    </div>
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
