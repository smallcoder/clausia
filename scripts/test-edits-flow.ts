// The page's confirm and reject, end to end on the server side (no model, no browser): what «أكّد» on the case page does is
// `decideProposal` for the ops the page shows (src/components/cases/ConfirmBar.tsx → decideProposalAction → decideProposal).
//  - nothing is saved before the tap, the page reads the open edit;
//  - a confirm from the page saves exactly the ops it shows and the highlights go away;
//  - all or nothing: one failing op undoes the other, the highlights stay;
//  - a rejected card saves nothing and its highlights go away.
// Everything it makes is removed again. Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-edits-flow.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";
import { getCaseFile } from "@/lib/case-file";
import { loadPendingEdits } from "@/lib/pending-edits";
import { createProposal, decideProposal } from "@/lib/proposals";

let fails = 0;
const check = (ok: boolean, what: string, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`); if (!ok) fails++; };

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const { error } = await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
if (error) throw error;
const db = sb as unknown as Db;
const { data: c } = await db.from("cases").select("id, court, updated_at").eq("case_number", "772").limit(1).single();
const caseId = c!.id;
const COURT = "محكمة اختبار التأكيد";
const FACT = "واقعة اختبار التأكيد من الصفحة";
const made: string[] = [];
const page = async () => loadPendingEdits(db, caseId, await getCaseFile(db, caseId));
const court = async () => (await db.from("cases").select("court").eq("id", caseId).single()).data?.court;
const mk = async (ops: { tool: string; args: Record<string, unknown> }[]) => {
  const p = await createProposal(db, { caseId, ops: ops.map((o) => ({ ...o, source: { kind: "chat" as const } })), sourceTexts: [COURT, FACT] });
  made.push(p.id);
  return p;
};

try {
  // 1) confirm from the page
  const p1 = await mk([{ tool: "update_case", args: { case: caseId, court: COURT, quote: COURT } }, { tool: "add_fact", args: { case: caseId, text: FACT, quote: FACT } }]);
  check(await court() === c!.court, "nothing saved before the tap");
  const e1 = await page();
  const g1 = e1.groups.find((g) => g.proposalId === p1.id);
  check(!!g1 && g1.opIds.length === 2 && e1.casePatch?.court === COURT && e1.timeline.some((r) => r.text === FACT), "the page shows both edits", JSON.stringify(g1));
  await decideProposal(db, g1!.proposalId, { mode: "confirm", opIds: g1!.opIds });
  check(await court() === COURT, "confirm from the page saved the case edit", (await court()) ?? "");
  const { data: fact } = await db.from("case_facts").select("id, review_status, source_kind").eq("case_id", caseId).eq("text", FACT);
  check(fact?.length === 1 && fact[0].review_status === "confirmed" && fact[0].source_kind === "chat", "…and the new fact, confirmed, source chat");
  const after1 = await page();
  check(!after1.groups.some((g) => g.proposalId === p1.id) && after1.casePatch?.court !== COURT, "after the confirm the highlights are gone");
  if (fact?.length) await db.from("case_facts").delete().eq("id", fact[0].id);
  await db.from("cases").update({ court: c!.court, updated_at: c!.updated_at }).eq("id", caseId);

  // 2) all or nothing: the second op cannot be saved (a case that does not exist), so the first is undone
  const p2 = await mk([{ tool: "update_case", args: { case: caseId, court: COURT, quote: COURT } }, { tool: "add_party", args: { case: "99999999-9999-4999-8999-999999999999", name: "طرف اختبار", role: "defendant", quote: COURT } }]);
  let err = "";
  try { await decideProposal(db, p2.id, { mode: "confirm" }); } catch (e) { err = e instanceof Error ? e.message : String(e); }
  check(err !== "" && await court() === c!.court, "all or nothing: a failing op undoes the other one", err);
  const e2 = await page();
  check(e2.groups.some((g) => g.proposalId === p2.id && g.opIds.length === 1), "…and the page still shows the edit that can be shown");
  await db.from("proposals").delete().eq("id", p2.id);

  // 3) reject → no highlights, nothing saved
  const p3 = await mk([{ tool: "update_case", args: { case: caseId, court: COURT, quote: COURT } }]);
  check((await page()).casePatch?.court === COURT, "an open edit is highlighted");
  await decideProposal(db, p3.id, { mode: "reject" });
  const e3 = await page();
  check(!e3.groups.some((g) => g.proposalId === p3.id) && e3.casePatch?.court !== COURT, "a rejected proposal removes the highlights");
  check(await court() === c!.court, "…and saved nothing");
} finally {
  if (made.length) await db.from("proposals").delete().in("id", made);
  await db.from("case_facts").delete().eq("case_id", caseId).eq("text", FACT);
  await db.from("cases").update({ court: c!.court, updated_at: c!.updated_at }).eq("id", caseId);
}
console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks passed");
process.exit(fails ? 1 : 0);
