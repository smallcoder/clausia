/**
 * The paper thumbnail of a document (docs/design/*Case.dc.html «المستندات»): a 3:4 sheet of paper with a darker title
 * rule and two text lines. The paper is light in both themes (--paper-thumb), so anything printed on it uses ink.
 */
import { cx } from "@/components/ui";

export function DocThumb({ note, className }: { note?: string | null; className?: string }) {
  return (
    <span className={cx("flex aspect-[3/4] flex-col gap-1 rounded-[10px] border border-border bg-paper-thumb px-[7px] py-[9px] shadow-soft transition group-hover:-translate-y-0.5 lg:rounded-[9px] dark:border-transparent", className)}>
      <span className="h-[3px] w-[55%] rounded-sm bg-ink-solid/25" />
      <span className="mt-[3px] h-0.5 w-full rounded-sm bg-ink-solid/10" />
      <span className="h-0.5 w-[88%] rounded-sm bg-ink-solid/10" />
      <span className="h-0.5 w-[94%] rounded-sm bg-ink-solid/10" />
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
