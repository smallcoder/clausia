/**
 * The case dossier's tabs (docs/design/ia/IACase*, MCase*): five, the same on desktop and phone, chosen by `?tab=`.
 * Pure code: the keys, the old names that still work, the counts and the link of each tab.
 */
import type { CaseFile } from "@/lib/case-file";

export const TABS = [
  { key: "hearings", label: "الجلسات" },
  { key: "sides", label: "الطلبات والدفوع" },
  { key: "facts", label: "الوقائع" },
  { key: "documents", label: "المستندات" },
  { key: "memos", label: "المذكرات والأحكام" },
] as const;
export type TabKey = (typeof TABS)[number]["key"];
export const DEFAULT_TAB: TabKey = "hearings";

/**
 * Old `?tab=` names → the tab that holds the same thing now. `details` (the old «بيانات الدعوى» page) and `overview` have no tab of
 * their own any more: the case fields are in the header and its «تعديل بيانات الدعوى» line, so they open the first tab.
 */
const ALIAS: Record<string, TabKey> = {
  details: "hearings", overview: "hearings", summary: "hearings",
  requests: "sides", arguments: "sides", lana: "sides", sides: "sides",
  parties: "facts", timeline: "facts",
  judgments: "memos", memos: "memos",
};

/** The tab a `?tab=` value means, and whether the address should be rewritten to the new name (`canonical` false). */
export function resolveTab(tab: string | undefined): { key: TabKey; canonical: boolean } {
  if (!tab) return { key: DEFAULT_TAB, canonical: true };
  if (TABS.some((t) => t.key === tab)) return { key: tab as TabKey, canonical: true };
  return { key: Object.hasOwn(ALIAS, tab) ? ALIAS[tab] : DEFAULT_TAB, canonical: false };
}

/** documents that count as «المذكرات والأحكام» (the data tells it: the document's type) */
export const MEMO_DOC_TYPES = ["our_memo", "opponent_memo", "judgment"];

/** the case's documents that are memos or judgments */
export const memoDocs = (cf: CaseFile) => cf.documents.filter((d) => MEMO_DOC_TYPES.includes(d.doc_type));

/** What each tab's number says. Suggested items count (they are on the tab, waiting for the lawyer). `gold`: something there waits for review. */
export function tabCounts(cf: CaseFile, today: string): Record<TabKey, { text: string; gold: boolean }> {
  const pend = (...tables: string[]) => cf.pending_suggestions.filter((p) => tables.includes(p.table));
  const args = [...cf.arguments, ...pend("case_arguments").map((p) => p.item as CaseFile["arguments"][number])];
  const reqs = cf.requests.length + pend("case_requests").length;
  const ours = args.filter((a) => a.side === "ours").length;
  const theirs = args.filter((a) => a.side === "opponent").length;
  const undecided = cf.hearings.filter((h) => h.date < today && !h.decision_type).length;
  const n = (x: number) => String(x);
  return {
    hearings: { text: n(cf.hearings.length + pend("hearings").length), gold: undecided > 0 || pend("hearings").length > 0 },
    sides: { text: `${reqs + ours} · ${theirs}`, gold: pend("case_requests", "case_arguments").length > 0 },
    facts: { text: n(cf.facts.length + pend("case_facts").length), gold: pend("case_facts", "case_parties").length > 0 },
    documents: { text: n(cf.documents.length), gold: false },
    memos: { text: n(cf.judgments.length + pend("judgments").length + memoDocs(cf).length), gold: pend("judgments").length > 0 },
  };
}

/** A tab's address: this case, `?tab=` and the other parts of the address that must stay (the chat session `s`, `hearing`, `q`, and `sheet`: the phone sheet). */
export function tabHref(caseId: string, tab: TabKey, keep: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams();
  for (const k of ["s", "hearing", "q", "sheet"]) if (keep[k]) q.set(k, keep[k]!);
  q.set("tab", tab); // always spelled out: on a phone a case address with no tab is the chat, with a tab it is the open sheet
  const s = q.toString();
  return `/cases/${caseId}${s ? `?${s}` : ""}`;
}
