/**
 * «لنا · طلباتنا» / «ضدنا · دفوع الخصم» (docs/design/split/Sides*.dc.html): the small rules of the two cards, as pure code.
 * Everything comes from the case file; a missing value gives a shorter line, never an invented one:
 *  - a defense is «اترد عليه» only when its `reply_argument_id` points at one of OUR confirmed arguments (set by a confirmed
 *    reply card); anything else, unknown included, is «محتاج رد». A reply is never read out of text.
 *  - a defense that is only suggested is not counted: the lawyer has not confirmed it yet, so there is nothing to answer yet.
 */
import { docName, shortDmy } from "@/components/cases/case-view";
import type { CaseFile } from "@/lib/case-file";

type Arg = CaseFile["arguments"][number];
type Doc = CaseFile["documents"][number];

export type ReplyStatus = "needs" | "done";

/** linked to one of our arguments (that exists, and is confirmed) → done; otherwise needs a reply */
export function replyStatus(defense: Pick<Arg, "reply_argument_id">, ours: Pick<Arg, "id" | "review_status">[]): ReplyStatus {
  const id = defense.reply_argument_id;
  return id && ours.some((a) => a.id === id && a.review_status === "confirmed") ? "done" : "needs";
}

/** «N / total محتاجين رد» over the confirmed defenses */
export function replyCount(theirs: Pick<Arg, "reply_argument_id" | "review_status" | "id">[], ours: Pick<Arg, "id" | "review_status">[]): { needs: number; total: number } {
  const real = theirs.filter((d) => d.review_status === "confirmed");
  return { needs: real.filter((d) => replyStatus(d, ours) === "needs").length, total: real.length };
}

/** «من مذكرة الخصم 15/10»: the paper the defenses came from; «من 2 مستندات» for several; null when none is a known paper */
export function memoLine(theirs: Pick<Arg, "source" | "review_status">[], docs: Doc[]): string | null {
  const ids = new Set<string>();
  for (const d of theirs) {
    if (d.review_status !== "confirmed" || d.source.kind !== "document" || !d.source.document_id) continue;
    if (docs.some((x) => x.id === d.source.document_id)) ids.add(d.source.document_id);
  }
  if (ids.size === 0) return null;
  if (ids.size > 1) return `من ${ids.size} مستندات`;
  const doc = docs.find((x) => x.id === [...ids][0])!;
  return `من ${docName(doc)}${doc.doc_date ? ` ${shortDmy(doc.doc_date)}` : ""}`;
}

/** «إحنا المدعي»: our side, only when the case says it */
const OUR_SIDE: Partial<Record<string, string>> = {
  plaintiff: "إحنا المدعي", defendant: "إحنا المدعى عليه", appellant: "إحنا المستأنف", appellee: "إحنا المستأنف ضده",
  cassation_appellant: "إحنا الطاعن", cassation_appellee: "إحنا المطعون ضده",
};
export function ourSideLabel(role: string | null): string | null {
  return (role && OUR_SIDE[role]) || null;
}

/** what «اكتب الرد» puts in the box */
export const REPLY_PREFILL = "اكتب الرد على الدفع ده";
