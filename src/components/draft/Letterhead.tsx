/**
 * The office paper drawn on screen (docs/design/ia/IADraft*): the header of the lawyer's Word file above the text, and its footer below, when the office has
 * given a style («ورق المكتب»). Only what the file really has is drawn: its header lines (the first is the office's name) and a round frame where the file
 * has a picture (the picture itself is not copied to the screen: the Word export keeps the real one).
 */
import { ImageIcon } from "lucide-react";
import type { OfficeStyle } from "@/lib/word/office-style";

export function LetterheadTop({ style }: { style: OfficeStyle }) {
  const [first, ...rest] = style.header.lines;
  if (!first && !style.header.picture) return null;
  return (
    <div className="-mt-3 mb-4 flex items-start justify-between gap-4 border-b-4 border-double border-text pb-3 leading-normal" aria-label="ورق المكتب">
      <div className="min-w-0">
        {first ? <p className="text-lg font-bold text-title">{first}</p> : null}
        {rest.map((l, i) => <p key={i} className={i === 0 ? "text-base text-text" : "text-sm text-text-3"}>{l}</p>)}
      </div>
      {style.header.picture ? (
        <span aria-hidden title="شعار المكتب (بيظهر في ملف Word)" className="inline-flex size-14 shrink-0 items-center justify-center rounded-full border border-text text-text-3"><ImageIcon size={20} strokeWidth={1.6} /></span>
      ) : null}
    </div>
  );
}

export function LetterheadBottom({ style }: { style: OfficeStyle }) {
  if (!style.footer.lines.length) return null;
  return (
    <div className="mt-8 border-t border-border-2 pt-3 text-center text-sm leading-normal text-text-3">
      {style.footer.lines.map((l, i) => <p key={i}>{l}</p>)}
    </div>
  );
}
