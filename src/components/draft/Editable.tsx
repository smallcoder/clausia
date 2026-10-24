"use client";
/**
 * One editable box of the draft (PR 7): a paragraph, a heading, the title, or the text of a lawyer section. It keeps the model block and the DOM in step
 * (src/components/draft/editor-dom.ts): what the lawyer types is read back into the block; a change that comes from OUTSIDE (a restored version, an accepted
 * change) re-draws the box. Enter splits the block, Backspace at the start joins it to the one before, Ctrl/Cmd+B is bold, a paste is plain text.
 * The browser never makes a <div> or a style of its own here: the box is read through `readBlock`, which knows only text, <br>, <strong> and the islands.
 */
import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { cx } from "@/components/ui";
import { normalizeBlock, setLock, toggleBold, touchesLock } from "@/lib/draft/model";
import type { DraftBlock } from "@/lib/library/types";
import { blockHtml, readBlock, selectionOffsets, setSelection } from "./editor-dom";

/** what the toolbar can ask of the box that has the caret */
export interface EditableHandle {
  bold(): void;
  /** quote (lock) the selection, or lift the quotation the selection covers */
  quote(on: boolean): void;
  offsets(): { from: number; to: number } | null;
  focus(at: number): void;
}

export function Editable({ block, labels, className, hint, label, onChange, onSplit, onMergePrev, register, onFocus }: {
  block: DraftBlock;
  /** the name of each blank the case file could not fill, by key */
  labels: Map<string, string>;
  className?: string;
  hint?: string;
  label: string;
  onChange: (next: DraftBlock) => void;
  /** Enter: the block as it is now, and the position to cut at */
  onSplit?: (cur: DraftBlock, at: number) => void;
  /** Backspace at the very start: the block as it is now */
  onMergePrev?: (cur: DraftBlock) => void;
  register: (id: string, h: EditableHandle | null) => void;
  onFocus: (id: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const last = useRef<DraftBlock | null>(null);
  const id = block.id ?? "";

  // re-draw only when the block changed from outside (what the box itself emitted is already on screen)
  useLayoutEffect(() => {
    const n = el.current;
    if (!n || block === last.current) return;
    n.innerHTML = blockHtml(block, labels);
    last.current = block;
  }, [block, labels]);

  const read = (): DraftBlock => {
    const { text, marks } = readBlock(el.current!);
    return normalizeBlock({ ...block, text, marks });
  };
  /** puts `next` on screen and in the block list, the selection where it was */
  const apply = (next: DraftBlock, from: number, to: number) => {
    const n = el.current!;
    n.innerHTML = blockHtml(next, labels);
    last.current = next;
    setSelection(n, from, to);
    onChange(next);
  };

  // the handle the toolbar uses (re-made each render so it sees the latest block)
  useLayoutEffect(() => {
    register(id, {
      bold: () => { const o = selectionOffsets(el.current!); if (o && o.to > o.from) apply(toggleBold(read(), o.from, o.to), o.from, o.to); },
      quote: (on) => { const o = selectionOffsets(el.current!); if (o && o.to > o.from) apply(setLock(read(), o.from, o.to, on ? { src: "نص مقتبس" } : null), o.from, o.to); },
      offsets: () => (el.current ? selectionOffsets(el.current) : null),
      focus: (at) => { el.current?.focus(); if (el.current) setSelection(el.current, at); },
    });
    return () => register(id, null);
  });

  // A quotation is never typed into, cut or deleted from here: the browser would happily delete a selected (or adjacent) locked box. Checked with the
  // model's own rule (touchesLock) on the range the edit is about to change, so the box and the model can not disagree.
  useLayoutEffect(() => {
    const n = el.current;
    if (!n) return;
    const guard = (e: InputEvent) => {
      if (!/^(insert|delete)/.test(e.inputType)) return;
      const o = selectionOffsets(n);
      if (!o) return;
      const cur = normalizeBlock({ ...block, ...readBlock(n) });
      let [from, to] = [o.from, o.to];
      if (from === to && e.inputType.startsWith("delete")) {
        if (/Backward$/.test(e.inputType)) from = Math.max(0, from - 1);
        else if (/Forward$/.test(e.inputType)) to = Math.min(cur.text.length, to + 1);
      }
      if (from !== to && touchesLock(cur, from, to)) e.preventDefault();
    };
    n.addEventListener("beforeinput", guard);
    return () => n.removeEventListener("beforeinput", guard);
  });

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.nativeEvent.isComposing) return;
    const n = el.current!;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") { e.preventDefault(); const o = selectionOffsets(n); if (o && o.to > o.from) apply(toggleBold(read(), o.from, o.to), o.from, o.to); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey || !onSplit) { document.execCommand("insertLineBreak"); return; } // a line break inside the block (and always inside a lawyer section)
      let o = selectionOffsets(n);
      if (o && o.to > o.from) { document.execCommand("delete"); o = selectionOffsets(n); } // a selection is replaced by the new line
      if (o) onSplit(read(), o.from);
      return;
    }
    if (e.key === "Backspace" && onMergePrev) {
      const o = selectionOffsets(n);
      if (o && o.from === 0 && o.to === 0) { e.preventDefault(); onMergePrev(read()); }
    }
  }

  return (
    <div
      ref={el} role="textbox" aria-multiline="true" aria-label={label} data-block-id={id} data-hint={hint} contentEditable suppressContentEditableWarning spellCheck={false}
      dir={block.dir === "ltr" ? "ltr" : "rtl"} lang={block.dir === "ltr" ? "en" : "ar"}
      onInput={() => { const next = read(); last.current = next; onChange(next); }}
      onKeyDown={onKey}
      onFocus={() => onFocus(id)}
      onDrop={(e) => e.preventDefault()} // a drop would put the browser's own markup (a picture, a link, styled text, a moved locked box) into the box: not allowed
      onPaste={(e) => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); }}
      onClick={(e) => {
        // a click on a quotation selects all of it (so the toolbar can lift it); the text of a quotation is never typed into
        const lock = (e.target as HTMLElement).closest("[data-lock]");
        if (lock && el.current?.contains(lock)) { const r = document.createRange(); r.selectNode(lock); const s = document.getSelection(); s?.removeAllRanges(); s?.addRange(r); }
      }}
      className={cx("min-h-8 whitespace-pre-wrap break-words outline-none empty:before:text-text-4 empty:before:content-[attr(data-hint)] focus-visible:rounded-sm focus-visible:bg-card-2/50", className)}
    />
  );
}
