"use client";
/**
 * The ONE composer of the app (docs/design/split/*): at the bottom of the chat panel, in flow (not fixed). A white box:
 * the mode tabs (اسأل / أحكام / صيغ / حلّل), then the input row. Desktop row: input, [+ attach], [send]. Phone row:
 * [+ attach], input, [send] — the send button sits where the mockup draws a mic (no mic until voice notes ship: owner decision).
 * Presentational: ChatThread owns the text and the sending.
 */
import { ArrowUp, File, ListChecks, Plus, Scale, User, type LucideIcon } from "lucide-react";
import { useEffect, type KeyboardEvent, type RefObject } from "react";
import { cx } from "@/components/ui";
import { CHAT_MODES, MODE_LABEL, type ChatMode } from "@/lib/assistant/modes";

const MODE_ICON: Record<ChatMode, LucideIcon> = { ask: User, rulings: Scale, draft: File, analyze: ListChecks };

export function ChatComposer({ id, value, onChange, onSend, onFile, sending, busy, status, error, onDismissError, placeholder, mode, onMode, boxRef, fileRef }: {
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
  mode: ChatMode;
  onMode: (m: ChatMode) => void;
  boxRef: RefObject<HTMLTextAreaElement | null>;
  fileRef: RefObject<HTMLInputElement | null>;
}) {
  // grow the input with its text where `field-sizing: content` is unsupported (iOS Safari); max-h-32 caps it
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
    <div className="px-2.5 pb-[calc(26px+env(safe-area-inset-bottom))] pt-1 xl:px-4.5 xl:pb-3.5 xl:pt-3" /* ds-allow: safe-area inset needs calc() */>
      <div className="mx-auto w-full max-w-messages">
        {error ? (
          <p role="alert" className="mb-2 flex items-start justify-between gap-2 rounded-md border border-border-2 bg-card px-3.5 py-2 text-base text-bad shadow-soft">
            <span>{error}</span>
            <button type="button" onClick={onDismissError} className="shrink-0 text-sm leading-4 underline">إخفاء</button>
          </p>
        ) : null}
        <div className="glass-below-xl rounded-xl px-2 pb-2 pt-1.75 xl:border xl:border-border-2 xl:bg-card xl:px-2.5 xl:pb-2.5 xl:pt-2 xl:shadow-soft">
          <div role="tablist" aria-label="نوع الطلب" className="flex gap-0.5 border-b border-border-2 pb-1.25 xl:pb-1.5">
            {CHAT_MODES.map((m) => {
              const Icon = MODE_ICON[m];
              const on = m === mode;
              return (
                <button key={m} type="button" role="tab" aria-selected={on} onClick={() => onMode(m)}
                  className={cx("tap inline-flex h-6.5 items-center gap-1 rounded-full px-2.25 text-xs font-semibold transition xl:h-7 xl:gap-1.25 xl:px-2.5 xl:text-sm",
                    on ? "bg-selected text-on-selected shadow-[var(--tab-shadow)]" : "text-glass-icon hover:text-text")}>
                  <Icon aria-hidden size={13} strokeWidth={1.9} />{MODE_LABEL[m]}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 px-1 pt-2 xl:gap-2">
            <input ref={fileRef} type="file" accept="application/pdf,image/*" className="sr-only" id={`file-${id}`} onChange={(e) => onFile(e.target.files?.[0])} />
            <label htmlFor={`file-${id}`} aria-label="إرفاق ورقة (PDF أو صورة)" title="إرفاق ورقة (PDF أو صورة)"
              className={cx("tap inline-flex size-8.5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border-2 text-glass-icon transition hover:text-text max-xl:order-first xl:order-2 xl:size-9", busy && "pointer-events-none opacity-50")}>
              <Plus aria-hidden size={18} strokeWidth={1.8} />
            </label>
            <textarea ref={boxRef} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} rows={1}
              placeholder={placeholder} aria-label="رسالة لـ Clausia"
              className="block max-h-32 min-h-8.5 min-w-0 flex-1 resize-none bg-transparent px-0.5 py-1.5 text-md leading-[1.5] text-text placeholder:text-text-4 focus:outline-none [field-sizing:content] xl:order-1 xl:min-h-9" />
            <button type="button" onClick={onSend} disabled={!value.trim() || sending} aria-label="إرسال"
              className="tap bg-primary-fill inline-flex size-8.5 shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed order-last xl:size-9">
              <ArrowUp aria-hidden size={18} strokeWidth={2.4} />
            </button>
          </div>
        </div>
        <p className="mt-2 hidden min-h-4 text-center text-xs text-text-4 xl:block" aria-live="polite">{status ?? "مفيش حاجة بتتغير من غير موافقتك"}</p>
      </div>
    </div>
  );
}
