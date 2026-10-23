"use client";
/**
 * «اسأل Clausia» (split layout, PR 2b): wraps one thing on the case page (a header cell, the summary, a fact, a party, a request
 * or argument, the hearing card, a document). On hover (desktop), on focus (keyboard) or after a tap (touch) a small glass pill
 * shows at its corner. A click attaches the item to the ONE composer as a context chip, puts the cursor in the box and sends
 * nothing: the lawyer types the question. On the phone the page is a sheet over the chat, so the sheet closes first.
 * The pill is a sibling of the item (z-10 above any stretched link or button of the row), never inside it.
 */
import { MessageCircle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useDraft } from "@/components/chat/draft";
import { closeHref } from "@/components/shell/close-href";
import { cx } from "@/components/ui";
import { cleanLabel, type AskItem } from "@/lib/assistant/ask";

/**
 * Attaches an item to the ONE composer (a context chip), puts the cursor in the box and sends nothing. `prefill` is put in the
 * box only when it is empty (a half-written message is never replaced). On the phone the page is a sheet over the chat, so the sheet closes first.
 */
export function useAttach() {
  const { addChip, setText, focusComposer } = useDraft();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return useCallback((item: AskItem, prefill?: string) => {
    addChip({ ...item, label: cleanLabel(item.label) });
    if (prefill) setText((cur) => (cur.trim() ? cur : prefill));
    // below 1280 the page is a bottom sheet over the chat: close it so the chat and its box are in front
    if (!window.matchMedia("(min-width: 80rem)").matches) router.push(closeHref(path, new URLSearchParams(sp.toString())));
    document.querySelector<HTMLTextAreaElement>("aside textarea")?.focus(); // inside the tap, so the phone's keyboard opens
    focusComposer(); // and once the chat is in front (after the sheet closed)
  }, [addChip, setText, focusComposer, router, path, sp]);
}

/** `inside`: the pill sits inside the item's top corner (for an item in a box that clips, like the phone's spec card); default: on its top edge. */
export function AskTarget({ item, className, inside = false, children }: { item: AskItem; className?: string; inside?: boolean; children: ReactNode }) {
  const attach = useAttach();
  const ref = useRef<HTMLDivElement>(null);
  /** touch: a tap on the item shows the pill (hover does not exist there); a tap elsewhere hides it */
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setArmed(false); };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [armed]);

  function ask() {
    attach(item);
    setArmed(false);
  }

  return (
    <div ref={ref} data-armed={armed} onClick={() => setArmed(true)} className={cx("group/ask relative", className)}>
      {children}
      <button type="button" onClick={(e) => { e.stopPropagation(); ask(); }} aria-label={`اسأل Clausia عن ${cleanLabel(item.label, 60)}`}
        className={cx("tap glass-flat glass-icon pointer-events-none absolute end-2 z-10 inline-flex h-7 items-center gap-1.25 rounded-full px-2.5 text-xs font-semibold opacity-0 transition hover:text-text focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover/ask:pointer-events-auto group-hover/ask:opacity-100 group-focus-within/ask:pointer-events-auto group-focus-within/ask:opacity-100 pointer-coarse:group-data-[armed=true]/ask:pointer-events-auto pointer-coarse:group-data-[armed=true]/ask:opacity-100", inside ? "top-1" : "-top-3")}>
        <MessageCircle aria-hidden size={13} strokeWidth={1.9} />اسأل Clausia
      </button>
    </div>
  );
}
