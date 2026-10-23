// «لنا · طلباتنا» / «ضدنا · دفوع الخصم» (sides PR), no model, no browser. Free.
//  - the pure rules: reply status (linked to OUR confirmed argument → «اترد عليه», anything else → «محتاج رد»), the count,
//    the memo line («من <ورقة> d/m», «من N مستندات», nothing), our side's words
//  - the `answers` link of add_argument end to end: a confirmed reply card links the defense (the case file shows it), «تراجع»
//    puts everything back exactly (the reply row is gone, the link is null); a SUGGESTED reply links but the defense still needs a reply
//    until the reply is confirmed; wrong targets are refused and nothing is saved (the other office / other case: scripts/test-rls.ts)
// Everything it makes is removed again. Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-sides.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";
import { getCaseFile, type CaseFile } from "@/lib/case-file";
import { memoLine, ourSideLabel, replyCount, replyStatus } from "@/components/cases/sides";
import { createProposal, decideProposal } from "@/lib/proposals";
import { MANUAL, applyOp } from "@/lib/tools/apply";
import { undoConfirm } from "@/lib/undo";

let fails = 0;
const check = (ok: boolean, what: string, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`); if (!ok) fails++; };

type Arg = CaseFile["arguments"][number];
type Doc = CaseFile["documents"][number];
const src = (document_id: string | null = null): Arg["source"] => ({ kind: document_id ? "document" : "manual", message_id: null, document_id, page: null, quote: null, char_start: null, char_end: null });
const arg = (id: string, side: Arg["side"], over: Partial<Arg> = {}): Arg => ({ id, side, kind: null, text: id, reply_argument_id: null, review_status: "confirmed", created_by: "lawyer", source: src(), ...over });
const doc = (id: string, title: string | null, doc_date: string | null): Doc => ({ id, file_name: `${id}.pdf`, doc_type: "opponent_memo", title, doc_date, page_count: 3, read_status: "done", review_status: "confirmed", pages: [] });

// ---------- 1) the pure rules ----------
{
  const o1 = arg("o1", "ours");
  const o2 = arg("o2", "ours", { review_status: "suggested" });
  const ours = [o1, o2];
  check(replyStatus(arg("d", "opponent", { reply_argument_id: "o1" }), ours) === "done", "status: linked to our confirmed argument → اترد عليه");
  check(replyStatus(arg("d", "opponent"), ours) === "needs", "status: not linked → محتاج رد");
  check(replyStatus(arg("d", "opponent", { reply_argument_id: "o2" }), ours) === "needs", "status: linked to a reply that is only suggested → محتاج رد");
  check(replyStatus(arg("d", "opponent", { reply_argument_id: "gone" }), ours) === "needs", "status: linked to something we cannot see (rejected, other) → محتاج رد");
  check(replyStatus(arg("d", "opponent", { text: "تم الرد على هذا الدفع بالفعل", reply_argument_id: null }), ours) === "needs", "status: never read from the text");

  const theirs = [arg("d1", "opponent", { reply_argument_id: "o1" }), arg("d2", "opponent"), arg("d3", "opponent"), arg("d4", "opponent", { review_status: "suggested" })];
  const c = replyCount(theirs, ours);
  check(c.needs === 2 && c.total === 3, "count: 2 / 3 محتاجين رد (a suggested defense is not counted)", `${c.needs}/${c.total}`);
  check(replyCount([], ours).total === 0, "count: no defenses → total 0");

  const d1 = doc("p1", "مذكرة الخصم", "2026-10-15");
  const d2 = doc("p2", null, null);
  const from = (id: string | null) => arg("x", "opponent", { source: src(id) });
  check(memoLine([from("p1"), from("p1")], [d1, d2]) === "من مذكرة الخصم 15/10", "memo: one paper → «من مذكرة الخصم 15/10»", String(memoLine([from("p1")], [d1])));
  check(memoLine([from("p2")], [d1, d2]) === "من مذكرة الخصم", "memo: a paper without title or date → its type's word, no date (never guessed)", String(memoLine([from("p2")], [d1, d2])));
  check(memoLine([from("p1"), from("p2")], [d1, d2]) === "من 2 مستندات", "memo: two papers → «من 2 مستندات»");
  check(memoLine([from(null), arg("y", "opponent")], [d1, d2]) === null, "memo: no paper source → nothing");
  check(memoLine([from("missing")], [d1]) === null, "memo: a paper that is not in the case's documents → nothing");
  check(memoLine([arg("z", "opponent", { review_status: "suggested", source: src("p1") })], [d1]) === null, "memo: a suggested defense does not name a paper");

  check(ourSideLabel("plaintiff") === "إحنا المدعي" && ourSideLabel("defendant") === "إحنا المدعى عليه", "our side: plaintiff / defendant");
  check(ourSideLabel(null) === null && ourSideLabel("witness") === null, "our side: unknown → nothing");
}

// ---------- 2) the link, end to end ----------
const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const { error } = await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
if (error) throw error;
const db = sb as unknown as Db;

const { data: tc } = await db.from("cases").insert({ title: "اختبار-ضدنا-الرد", client_role: "plaintiff", source_kind: "manual" }).select("id").single();
const caseId = tc!.id;
let docId = "";
try {
  const { data: d } = await db.from("documents").insert({ case_id: caseId, storage_path: `test/${crypto.randomUUID()}/x.pdf`, file_name: "x.pdf", title: "مذكرة الخصم", mime_type: "application/pdf", size_bytes: 1000, doc_type: "opponent_memo", doc_date: "2026-10-15", read_status: "done", source_kind: "manual", page_count: 3 }).select("id").single();
  docId = d!.id;
  const mk = async (side: "ours" | "opponent", text: string, over: Record<string, unknown> = {}) =>
    (await db.from("case_arguments").insert({ case_id: caseId, side, text, source_kind: docId && side === "opponent" ? "document" : "manual", source_document_id: side === "opponent" ? docId : null, source_page: side === "opponent" ? 2 : null, ...over }).select("id").single()).data!.id;
  const d1 = await mk("opponent", "دفع ١ للاختبار");
  const d2 = await mk("opponent", "دفع ٢ للاختبار");
  const d3 = await mk("opponent", "دفع ٣ للاختبار");
  const o1 = await mk("ours", "دفاع قديم لنا");

  const snap = async () => JSON.stringify((await db.from("case_arguments").select("*").eq("case_id", caseId).order("id")).data, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
  const file = async () => getCaseFile(db, caseId);
  const defense = (cf: CaseFile, id: string) => cf.arguments.find((a) => a.id === id)!;

  let cf = await file();
  let theirs = cf.arguments.filter((a) => a.side === "opponent");
  let ours = cf.arguments.filter((a) => a.side === "ours");
  check(theirs.every((a) => a.reply_argument_id === null && replyStatus(a, ours) === "needs"), "start: three defenses, none linked → all محتاج رد");
  check(replyCount(theirs, ours).needs === 3 && replyCount(theirs, ours).total === 3, "start: 3 / 3 محتاجين رد");
  check(memoLine(theirs, cf.documents) === "من مذكرة الخصم 15/10", "start: the memo line comes from source_document_id and doc_date", String(memoLine(theirs, cf.documents)));
  check(ourSideLabel(cf.case.client_role) === "إحنا المدعي", "start: our side comes from the case's client_role");

  // a confirmed reply card
  const T = "رد اختبار على الدفع الأول";
  const before = await snap();
  const p = await createProposal(db, { caseId, ops: [{ tool: "add_argument", args: { case: caseId, side: "ours", text: T, answers: d1, quote: T }, source: { kind: "chat" } }], sourceTexts: [T] });
  check((await snap()) === before, "the card alone saves nothing (the link needs the tap)");
  const r = await decideProposal(db, p.id, { mode: "confirm" });
  const replyId = r.ops[0].result_id!;
  cf = await file();
  theirs = cf.arguments.filter((a) => a.side === "opponent");
  ours = cf.arguments.filter((a) => a.side === "ours");
  check(r.status === "confirmed" && defense(cf, d1).reply_argument_id === replyId, "confirm: the defense points at the new reply");
  check(replyStatus(defense(cf, d1), ours) === "done" && replyStatus(defense(cf, d2), ours) === "needs", "confirm: that defense is اترد عليه, the others still محتاج رد");
  check(replyCount(theirs, ours).needs === 2 && replyCount(theirs, ours).total === 3, "confirm: 2 / 3 محتاجين رد");
  check(!!r.undo_event_id, "confirm: the card can be undone");

  const u = await undoConfirm(db, r.undo_event_id!);
  check(u.ok, "undo works", JSON.stringify(u));
  check((await snap()) === before, "undo: the arguments are exactly as before (the reply row is gone, the link is null)");
  cf = await file();
  check(defense(cf, d1).reply_argument_id === null && replyCount(cf.arguments.filter((a) => a.side === "opponent"), cf.arguments.filter((a) => a.side === "ours")).needs === 3, "undo: back to 3 / 3 محتاجين رد");

  // a suggested reply links but does not count as answered until it is confirmed
  const S = "رد مقترح على الدفع الثاني";
  const ps = await createProposal(db, { caseId, ops: [{ tool: "add_argument", args: { case: caseId, side: "ours", text: S, answers: d2, quote: S }, source: { kind: "chat" } }], sourceTexts: [S] });
  const rs = await decideProposal(db, ps.id, { mode: "suggest" });
  const sugId = rs.ops[0].result_id!;
  cf = await file();
  ours = cf.arguments.filter((a) => a.side === "ours");
  check(defense(cf, d2).reply_argument_id === sugId && replyStatus(defense(cf, d2), ours) === "needs", "suggested reply: linked, but the defense is still محتاج رد (the reply is in pending_suggestions)");
  await db.from("case_arguments").update({ review_status: "confirmed" }).eq("id", sugId);
  cf = await file();
  ours = cf.arguments.filter((a) => a.side === "ours");
  check(replyStatus(defense(cf, d2), ours) === "done", "…and اترد عليه once the reply is confirmed");
  await db.from("case_arguments").update({ review_status: "rejected" }).eq("id", sugId);
  cf = await file();
  check(replyStatus(defense(cf, d2), cf.arguments.filter((a) => a.side === "ours")) === "needs", "…and محتاج رد again if the reply is rejected");
  await db.from("case_arguments").delete().eq("id", sugId);
  check((await db.from("case_arguments").select("reply_argument_id").eq("id", d2).single()).data?.reply_argument_id === null, "deleting the reply clears the link (on delete set null)");

  // refusals: nothing is saved
  const count = async () => (await db.from("case_arguments").select("id", { count: "exact", head: true }).eq("case_id", caseId)).count;
  const n0 = await count();
  const snap0 = await snap();
  const attempts: [string, Record<string, unknown>][] = [
    ["answers with side = opponent", { case: caseId, side: "opponent", text: "نص ما", quote: "نص ما", answers: d3 }],
    ["answers pointing at OUR argument", { case: caseId, side: "ours", text: "نص ما", quote: "نص ما", answers: o1 }],
    ["answers pointing at nothing", { case: caseId, side: "ours", text: "نص ما", quote: "نص ما", answers: crypto.randomUUID() }],
    ["answers that is not an id", { case: caseId, side: "ours", text: "نص ما", quote: "نص ما", answers: "ليس id" }],
  ];
  for (const [what, args] of attempts) {
    let err = "";
    try { await applyOp(db, "add_argument", args, MANUAL); } catch (e) { err = e instanceof Error ? e.message : String(e); }
    check(err !== "" && (await count()) === n0, `refused, nothing saved: ${what}`, err);
  }
  // a defense that already has a reply
  const { id: firstReply } = await applyOp(db, "add_argument", { case: caseId, side: "ours", text: "رد أول على الدفع الثالث", quote: "رد أول", answers: d3 }, MANUAL);
  let again = "";
  try { await applyOp(db, "add_argument", { case: caseId, side: "ours", text: "رد تاني", quote: "رد تاني", answers: d3 }, MANUAL); } catch (e) { again = e instanceof Error ? e.message : String(e); }
  check(again !== "" && (await db.from("case_arguments").select("reply_argument_id").eq("id", d3).single()).data?.reply_argument_id === firstReply, "refused: a defense that already has a reply keeps the first one", again);
  await db.from("case_arguments").delete().eq("id", firstReply);
  check((await snap()) === snap0, "the refusals changed nothing");
} finally {
  await db.from("cases").delete().eq("id", caseId);
  if (docId) await db.from("documents").delete().eq("id", docId);
}

console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks passed");
process.exit(fails ? 1 : 0);
