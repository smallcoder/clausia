"use client";
/**
 * Tracked changes in the paper (docs/design/ia/IADraft*, PR 7b): what Clausia proposed, drawn where it would go, and decided with ✓ / × on each one.
 *  - old words: struck through on a light red ground (the danger tokens);  new words: gold (the gold tokens);
 *  - a new paragraph taken from a paper: gold, locked, with the paper and page it came from.
 * Nothing here changes the draft: the tap calls `onDecide`, which runs the same decision as the chat card. A block with a change waiting is drawn, not
 * edited, until the change is decided (so the lawyer's typing and the proposal never meet).
 */
import { Check, Lock, X } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/components/ui";
import { sliceBlock } from "@/lib/draft/model";
import type { PendingChange } from "@/lib/draft/pending";
import type { DraftBlock } from "@/lib/library/types";
import { blockHtml } from "./editor-dom";

export type Decide = (c: PendingChange, mode: "confirm" | "reject") => void;

/** ✓ and × of one change */
export function Decision({ c, busy, onDecide }: { c: PendingChange; busy: boolean; onDecide: Decide }) {
  return (
    <span className="ms-2 inline-flex gap-1 align-middle font-sans" contentEditable={false}>
      <button type="button" aria-label={`اقبل التعديل: ${c.label}`} title="اقبل" disabled={busy} onClick={() => onDecide(c, "confirm")}
        className="bg-primary-fill tap inline-flex size-6 items-center justify-center rounded-full transition disabled:opacity-50"><Check aria-hidden size={12} strokeWidth={2.6} /></button>
      <button type="button" aria-label={`ارفض التعديل: ${c.label}`} title="ارفض" disabled={busy} onClick={() => onDecide(c, "reject")}
        className="tap inline-flex size-6 items-center justify-center rounded-full border border-border-2 text-text-3 transition hover:text-text disabled:opacity-50"><X aria-hidden size={12} strokeWidth={2.4} /></button>
    </span>
  );
}

export const OLD_CLASS = "rounded-sm bg-bad-bg text-text-3 line-through decoration-bad";
export const NEW_CLASS = "rounded-sm border-b border-gold-edge bg-gold-bg font-semibold text-gold-text-small";

export interface Fitted { c: PendingChange; from: number; to: number }

/** a block's text with its replace changes drawn in it: plain pieces, then the old words (struck), the new words (gold) and ✓ / ×, in order */
export function TrackedText({ block, items, labels, busy, onDecide, className }: { block: DraftBlock; items: Fitted[]; labels: Map<string, string>; busy: boolean; onDecide: Decide; className?: string }) {
  const sorted = [...items].sort((a, b) => a.from - b.from);
  const parts: ReactNode[] = [];
  let at = 0;
  const plain = (from: number, to: number, key: string) => { if (to > from) parts.push(<span key={key} dangerouslySetInnerHTML={{ __html: blockHtml(sliceBlock(block, from, to), labels) }} />); };
  sorted.forEach((it, i) => {
    plain(at, it.from, `p${i}`);
    parts.push(<span key={`o${i}`} className={OLD_CLASS}>{block.text.slice(it.from, it.to)}</span>);
    if (it.c.args.new_text) parts.push(<span key={`n${i}`}> <span className={NEW_CLASS}>{it.c.args.new_text}</span></span>);
    parts.push(<Decision key={`d${i}`} c={it.c} busy={busy} onDecide={onDecide} />);
    at = it.to;
  });
  plain(at, block.text.length, "tail");
  return <div dir={block.dir === "ltr" ? "ltr" : "rtl"} aria-label="فقرة فيها تعديل مقترح" className={cx("whitespace-pre-wrap break-words", className)}>{parts}</div>;
}

/** a new paragraph proposed after a block (a cited one is locked and says where it comes from) */
export function AddedBlock({ c, busy, onDecide }: { c: PendingChange; busy: boolean; onDecide: Decide }) {
  const text = c.cite ? c.cite.text : (c.args.new_text ?? "").trim();
  const heading = !c.cite && c.args.style === "h";
  return (
    <div className={cx("rounded-sm", c.cite && "border-s-4 border-gold-edge px-4 py-2")}>
      <p className={cx("whitespace-pre-line", heading && "pt-1 text-md font-bold text-title")}>
        <span className={NEW_CLASS}>{text}</span>
        <Decision c={c} busy={busy} onDecide={onDecide} />
      </p>
      {c.cite ? <p className="mt-1 flex items-center gap-1.5 font-sans text-xs text-text-3"><Lock aria-hidden size={12} strokeWidth={2} />نص حرفي من {c.cite.src} · مبيتعدلش</p> : null}
    </div>
  );
}
