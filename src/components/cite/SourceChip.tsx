"use client";
/**
 * The source chip (docs/design/next/Cite*.dc.html): a quiet gold-outlined pill «الصحيفة · ص 2» under an item. On an item
 * that came from a paper it is a button that opens the paper panel at that page with the exact sentence marked; the
 * open one is filled (ink) and carries aria-current. «من رسالتك» is the same pill but only a label: the lawyer's own
 * message has no panel.
 */
import { File } from "lucide-react";
import { useContext } from "react";
import { SheetCloseCtx, useCite, type CiteSource } from "./context";

/** (not the shared cx: ui.tsx imports this file) */
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

const CHIP = "inline-flex h-6 items-center gap-1.25 whitespace-nowrap rounded-full border px-2.25 text-xs font-semibold leading-[normal]";

/** A label with no panel behind it: «من رسالتك», or a paper source that has no paper id. */
export function SourceLabel({ children, className }: { children: string; className?: string }) {
  return (
    <span className={cx(CHIP, "border-gold-edge text-gold", className)}>
      <File aria-hidden className="size-3 shrink-0" strokeWidth={1.8} />{children}
    </span>
  );
}

/** A paper source: opens the panel. `className` adds layout only (e.g. `relative z-10` above a stretched row button). */
export function SourceChip({ cite, className }: { cite: CiteSource; className?: string }) {
  const { active, open } = useCite();
  const closeSheet = useContext(SheetCloseCtx); // inside an item's sheet (a modal): close it first, the panel sits on the page
  const on = active?.id === cite.id;
  return (
    <button type="button" data-cite-id={cite.id} aria-current={on ? "true" : undefined}
      aria-label={`افتح ${cite.label} في الورقة`}
      onClick={() => { closeSheet(); open(cite); }}
      className={cx("tap", CHIP, "transition-colors", on ? "border-transparent bg-selected text-on-selected" : "border-gold-edge text-gold hover:bg-gold-bg", className)}>
      <File aria-hidden className="size-3 shrink-0" strokeWidth={1.8} />{cite.label}
    </button>
  );
}

/**
 * The quiet «ص 4» under a value of the documents table (docs/design/next/Review*.dc.html): faint text with a paper icon,
 * and for a suggested value a gold dot and «ص 1 · مقترحة، راجعها». Opens the paper panel exactly as the pill does
 * (same context, same focus return); the open one is filled like the pill.
 */
export function CellCite({ cite, suggested = false, className }: { cite: CiteSource; suggested?: boolean; className?: string }) {
  const { active, open } = useCite();
  const on = active?.id === cite.id;
  return (
    <button type="button" data-cite-id={cite.id} aria-current={on ? "true" : undefined}
      aria-label={`افتح ${cite.label} في الورقة${suggested ? " (مقترحة، راجعها)" : ""}`}
      onClick={() => open(cite)}
      className={cx("tap inline-flex items-center gap-1.5 whitespace-nowrap rounded-full text-xs leading-[normal] transition-colors",
        on ? "bg-selected px-2 py-0.5 text-on-selected" : suggested ? "text-gold hover:underline" : "text-text-4 hover:text-text-2", className)}>
      {suggested ? <span aria-hidden className="size-dot shrink-0 rounded-full bg-gold" /> : <File aria-hidden className="size-3 shrink-0" strokeWidth={1.8} />}
      ص <span className="font-num">{cite.page}</span>{suggested ? " · مقترحة، راجعها" : ""}
    </button>
  );
}
