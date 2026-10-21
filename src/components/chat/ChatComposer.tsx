"use client";
/**
 * The Chat screen's composer (docs/design/*Chat*.dc.html): the two-row glass box in the 780px ChatDock — the «C» mark
 * and the text, then [+ attach] [hint / status] [send]. No mic until voice notes ship (owner decision).
 * Presentational: the thread (ChatThread) and the new-chat list (/chat, NewChatComposer) own the text and the sending.
 */
import { ArrowUp, Plus } from "lucide-react";
import { useEffect, type KeyboardEvent, type RefObject } from "react";
import { cx } from "@/components/ui";
import { ChatDock } from "./ChatDock";

export function ChatComposer({ id, value, onChange, onSend, onFile, sending, busy, status, error, onDismissError, placeholder, boxRef, fileRef }: {
  /** unique per page (the file input's id) */
  id: string;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onFile: (f: File | undefined) => void;
  /** a message is being sent (send disabled) */
  sending: boolean;
  /** sending or uploading (attach disabled) */
  busy: boolean;
  status: string | null;
  error: string | null;
  onDismissError: () => void;
  placeholder: string;
  boxRef: RefObject<HTMLTextAreaElement | null>;
  fileRef: RefObject<HTMLInputElement | null>;
}) {
  // grow the composer with its text where `field-sizing: content` is unsupported (iOS Safari); max-h-40 caps it
  useEffect(() => {
    const el = boxRef.current;
    if (!el || CSS.supports?.("field-sizing", "content")) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [value, boxRef]);

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSend();
    }
  }

  return (
    <ChatDock>
      {error ? (
        <p role="alert" className="mb-2 flex items-start justify-between gap-2 rounded-md border border-border-2 bg-card px-3.5 py-2 text-base text-bad shadow-soft">
          <span>{error}</span>
          <button type="button" onClick={onDismissError} className="shrink-0 text-sm leading-4 underline">إخفاء</button>
        </p>
      ) : null}
      <div className="glass rounded-xl px-3 pb-2.5 pt-3.5 sm:px-3.5 sm:pb-3 sm:pt-4">
        <div className="flex items-start gap-2.5 px-1 sm:gap-3 sm:px-1.5 sm:pt-0.5">
          <span aria-hidden className="mark font-num mt-0.5 inline-flex size-[22px] shrink-0 items-center justify-center rounded-sm text-xs font-extrabold sm:size-[26px] sm:text-sm">C</span>
          <textarea ref={boxRef} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} rows={1}
            placeholder={placeholder} aria-label="رسالة لـ Clausia"
            className="block max-h-40 min-h-[46px] min-w-0 flex-1 resize-none bg-transparent p-0 text-md leading-[1.6] text-text placeholder:text-text-4 focus:outline-none [field-sizing:content] sm:min-h-14 sm:text-lg sm:leading-[1.65]" />
        </div>
        <div className="mt-1.5 flex items-center gap-2 sm:mt-2">
          <input ref={fileRef} type="file" accept="application/pdf,image/*" className="sr-only" id={`file-${id}`} onChange={(e) => onFile(e.target.files?.[0])} />
          <label htmlFor={`file-${id}`} aria-label="إرفاق ورقة (PDF أو صورة)" title="إرفاق ورقة (PDF أو صورة)"
            className={cx(ROUND, "cursor-pointer", busy && "pointer-events-none opacity-50")}>
            <Plus aria-hidden size={18} strokeWidth={1.8} />
          </label>
          <div className="min-w-0 flex-1 truncate text-center text-xs text-text-4 sm:text-start sm:text-sm sm:leading-4" aria-live="polite">
            {status ?? <span className="sm:hidden">مفيش حاجة بتتحفظ من غير موافقتك</span>}
          </div>
          <button type="button" onClick={onSend} disabled={!value.trim() || sending} aria-label="إرسال"
            className="tap bg-primary-fill inline-flex size-[38px] shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed sm:size-10">
            <ArrowUp aria-hidden size={19} strokeWidth={2.4} />
          </button>
        </div>
      </div>
      <p className="mt-2.5 hidden text-center text-xs leading-[normal] text-text-4 sm:block">Clausia بتجهّز، وإنت اللي بتأكد. مفيش حاجة بتتحفظ من غير موافقتك.</p>
    </ChatDock>
  );
}

/** round composer control (Chat mockup: hairline ring, no fill): 38px mobile, 40px desktop, 44px tap area */
const ROUND = "tap inline-flex size-[38px] shrink-0 items-center justify-center rounded-full border border-border-2 glass-icon transition hover:text-text sm:size-10";
