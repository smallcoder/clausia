/**
 * The words of a live step («بقرا الصحيفة ص 2…»). Pure (no database): the turn, the tests and the screenshots share it.
 * A step is only ever made for something the turn REALLY does: a read tool call, or a card being prepared.
 */

/** A proposal (the confirmation card) is being created. */
export const CARD_STEP = "بجهّز البطاقة…";

/** «ص 2» / «ص 2، 3» / «ص 1–20» for the valid page numbers in a tool's `pages` argument ("" when none). */
export function pagesPart(pages: unknown): string {
  const list = Array.isArray(pages) ? [...new Set((pages as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 1))].sort((a, b) => a - b) : [];
  if (!list.length) return "";
  return list.length > 3 ? ` ص ${list[0]}–${list[list.length - 1]}` : ` ص ${list.join("، ")}`;
}

/** The step for one read-tool call. `docName`: the paper's name («صحيفة دعوى», or its file name) when the tool reads a paper. */
export function readStepLabel(tool: string, args: Record<string, unknown>, docName?: string | null): string | null {
  switch (tool) {
    case "search_clients": return "بدوّر في الموكلين…";
    case "search_cases": return "بدوّر في القضايا…";
    case "get_case": return "بقرا ملف القضية…";
    case "list_hearings": return "بقرا جلسات القضية…";
    case "list_balances": return "بحسب الباقي على الموكلين…";
    case "get_document_text": return `بقرا ${docName?.trim() || "الورقة"}${pagesPart(args.pages)}…`;
    default: return null;
  }
}
