/**
 * The paper thumbnail of a document (docs/design/*Case.dc.html «المستندات»): a 3:4 sheet of paper with a darker title
 * rule and two text lines. The paper is light in both themes (--paper-thumb), so anything printed on it uses ink.
 */
import { cx } from "@/components/ui";

export function DocThumb({ note, className }: { note?: string | null; className?: string }) {
  return (
    <span className={cx("flex aspect-[3/4] flex-col gap-1 rounded-md border border-border bg-paper-thumb px-1.75 py-2.25 shadow-soft transition group-hover:-translate-y-0.5 dark:border-transparent", className)}>
      <span className="h-0.75 w-[55%] rounded-full bg-ink-solid/25" /* ds-allow: mockup: a text line of the paper thumb is a share of the sheet (55%) */ />
      <span className="mt-0.75 h-0.5 w-full rounded-full bg-ink-solid/10" />
      <span className="h-0.5 w-[88%] rounded-full bg-ink-solid/10" /* ds-allow: mockup: a text line of the paper thumb is a share of the sheet (88%) */ />
      <span className="h-0.5 w-[94%] rounded-full bg-ink-solid/10" /* ds-allow: mockup: a text line of the paper thumb is a share of the sheet (94%) */ />
      {note ? <span className="mt-auto text-center text-xs font-semibold text-ink-solid/55">{note}</span> : null}
    </span>
  );
}

/** «صفحة واحدة», «صفحتين», «4 صفحات», «12 صفحة» */
export function pagesLabel(n: number | null | undefined): string | null {
  if (!n) return null;
  if (n === 1) return "صفحة واحدة";
  if (n === 2) return "صفحتين";
  return `${n} ${n <= 10 ? "صفحات" : "صفحة"}`;
}
