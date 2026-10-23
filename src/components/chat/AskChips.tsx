"use client";
/** The context chips of the composer («اسأل Clausia»): «الواقعة · 15/3/2026 · إنذار على يد محضر…» with an ×. They go with the next message as data. */
import { X } from "lucide-react";
import { ASK_CHIP_WORD, askKey, type AskItem } from "@/lib/assistant/ask";

export function AskChips({ chips, onRemove }: { chips: AskItem[]; onRemove: (key: string) => void }) {
  if (!chips.length) return null;
  return (
    <ul aria-label="عن إيه السؤال" className="flex flex-wrap gap-1.5 border-b border-border-2 px-0.5 pb-2 pt-0.5">
      {chips.map((c) => {
        const key = askKey(c);
        return (
          <li key={key} className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-border-2 bg-card-2 ps-2.5 text-xs text-text-2 dark:bg-card">
            <span className="shrink-0 font-semibold text-gold-text-small">{ASK_CHIP_WORD[c.kind]}</span>
            <span className="min-w-0 truncate">{c.label}</span>
            <button type="button" onClick={() => onRemove(key)} aria-label={`شيل ${ASK_CHIP_WORD[c.kind]} من السياق`}
              className="tap inline-flex size-7 shrink-0 items-center justify-center rounded-full text-text-3 transition hover:text-text">
              <X aria-hidden size={13} strokeWidth={2} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
