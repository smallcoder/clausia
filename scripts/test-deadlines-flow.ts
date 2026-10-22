// Free test of the deadlines card flow against the database (no model call, no LawMill call: the article texts come from the saved fixture).
//  - the flag off proposes nothing; the flag on proposes ONE card after a confirmed final judgment, and nothing is saved before the tap
//  - confirm saves the deadline with the days read from the article, the last day, the reminders and the verbatim text; undo works; a failed save leaves nothing
//  - not حضوري: the period runs from the typed service date; a bad / future date is refused
//  - approved holidays (shared table) move the last day; a draft never does; the model cannot see or call the tool
//  - the Roll shows the last day and the reminder days
// Cleans up every row it makes (a temporary approved holiday is removed again). Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-deadlines-flow.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadDeadlineCards } from "@/lib/deadlines/cards";
import { setArticleFetcher, type ArticleResult } from "@/lib/deadlines/lawmill";
import { proposeDeadlinesForJudgment } from "@/lib/deadlines/propose";
import { deadlinesInRange } from "@/lib/deadlines/roll";
import { buildDeadlines } from "@/lib/deadlines/service";
import type { Database } from "@/lib/db/types";
import { createProposal, decideProposal, getProposal } from "@/lib/proposals";
import type { Db } from "@/lib/supabase/server";
import { applyOp } from "@/lib/tools/apply";
import { isInternalTool, writeToolSpecs } from "@/lib/tools/registry";

let fails = 0;
const check = (ok: boolean, what: string, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`); if (!ok) fails++; };

const FX = JSON.parse(readFileSync(join(import.meta.dirname, "../tests/fixtures/lawmill-articles.json"), "utf8")) as Record<string, { article_number: string; source_label: string; title_ar: string; version_id: string; text_sha256: string; text_ar: string }>;
// article 18 is not in LawMill (empty answer): the fixture has no 18 either
setArticleFetcher(async (n): Promise<ArticleResult> => (FX[n] ? { ok: true, article: FX[n] } : { ok: false, reason: "missing" }));

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const { error: signErr } = await db.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
if (signErr) throw new Error(`sign-in failed: ${signErr.message}`);
const D = db as unknown as Db;
const { data: isAdmin } = await db.rpc("is_admin");

const made = { cases: [] as string[], holidays: [] as string[] };
const flag = (on: boolean) => { process.env.NEXT_PUBLIC_FEATURE_DEADLINES = on ? "1" : "0"; };
const ex = (r: PromiseLike<{ error: { message: string } | null }>) => r.then((x) => { if (x.error) throw new Error(x.error.message); });

async function newCase(stage: "first_instance" | "appeal" = "first_instance") {
  const { data: c } = await db.from("cases").insert({ title: "اختبار-مواعيد-الطعن", case_number: "9001", case_year: 2026, stage, source_kind: "manual" }).select("id").single();
  made.cases.push(c!.id);
  const { data: t } = await db.from("chat_threads").insert({ case_id: c!.id, title: "اختبار" }).select("id").single();
  return { caseId: c!.id, threadId: t!.id };
}
/** a judgment saved through a confirmation card (the real path: createProposal + decideProposal) */
async function judgmentCard(caseId: string, threadId: string, date: string, kind: "final" | "preliminary" = "final") {
  const p = await createProposal(D, { threadId, caseId, sourceTexts: ["حكمت المحكمة برفض الدعوى"], ops: [{ tool: "add_judgment", args: { case: caseId, date, kind, operative_text: "حكمت المحكمة برفض الدعوى", quote: "حكمت المحكمة برفض الدعوى" }, source: { kind: "chat", quote: "حكمت المحكمة برفض الدعوى" } }] });
  return p;
}
const cardsOf = async (threadId: string) => ((await db.from("proposals").select("*").eq("thread_id", threadId).order("created_at")).data ?? []).filter((p) => (p.ops as unknown as { tool: string }[]).some((o) => o.tool === "add_deadline"));
const deadlinesOf = async (caseId: string) => (await db.from("case_deadlines").select("*").eq("case_id", caseId)).data ?? [];

try {
  // ---------- the model can neither see nor call it ----------
  check(isInternalTool("add_deadline") && !writeToolSpecs().some((s) => s.name === "add_deadline"), "add_deadline is internal: not in the model's tool list, refused if it names it (turn.ts)");

  // ---------- flag off ----------
  flag(false);
  const a = await newCase();
  const j1 = await judgmentCard(a.caseId, a.threadId, "20/10/2026");
  await decideProposal(D, j1.id, { mode: "confirm" });
  check((await cardsOf(a.threadId)).length === 0, "flag off: a confirmed judgment proposes no deadlines card");
  check(Object.keys(await loadDeadlineCards(D, [])).length === 0 && (await deadlinesInRange(D, "2026-01-01", "2027-12-31")).length === 0, "flag off: no card data and nothing on the Roll");

  // ---------- flag on: one card, nothing saved before the tap ----------
  flag(true);
  const b = await newCase();
  const jp = await judgmentCard(b.caseId, b.threadId, "20/10/2026");
  await decideProposal(D, jp.id, { mode: "suggest" });
  check((await cardsOf(b.threadId)).length === 0, "a judgment saved «as a suggestion» proposes no card");
  const b2 = await newCase();
  const jp2 = await judgmentCard(b2.caseId, b2.threadId, "20/10/2026");
  await decideProposal(D, jp2.id, { mode: "confirm" });
  const cards = await cardsOf(b2.threadId);
  check(cards.length === 1 && cards[0].status === "pending" && !!cards[0].message_id, "a confirmed final judgment proposes ONE pending card, with the assistant line above it");
  check((await deadlinesOf(b2.caseId)).length === 0, "nothing is saved before the tap");
  const judgmentId = (await db.from("judgments").select("id").eq("case_id", b2.caseId).single()).data!.id;
  const again = await proposeDeadlinesForJudgment(D, { judgmentId, threadId: b2.threadId });
  check(!again.proposed && again.why === "a card is waiting", "a second proposal for the same judgment is not made while one waits", again.proposed ? "" : again.why);
  const entry = (await loadDeadlineCards(D, [cards[0] as never]))[cards[0].id];
  const card = "card" in entry ? entry.card : null;
  const ap = card?.rows[0];
  check(!!card && ap?.kind === "appeal" && ap.state === "ready" && ap.days === 40 && ap.last_day === "2026-11-29" && ap.review_holidays, "the card: 40 days from art. 227, last day 29/11/2026, «راجع الإجازات» (no approved holidays yet)", JSON.stringify(ap));
  check(card?.rows[1]?.kind === "cassation" && card.rows[1].state === "after_appeal" && card.rows[1].days === 60 && card.rows[1].last_day === null, "the cassation row: 60 days from art. 252, no date («بعد الاستئناف»)");
  check(card?.art18.ok === false && card.art213.ok === true, "art. 18 is not in LawMill: the card says so; art. 213 is there");

  // a failed save leaves the card as it was and saves nothing: not حضوري with no service date
  let failMsg = "";
  try { await decideProposal(D, cards[0].id, { mode: "confirm", edits: { op1: { start_basis: "service_date" } } }); } catch (e) { failMsg = e instanceof Error ? e.message : String(e); }
  check(failMsg.includes("ماتحفظش") && (await deadlinesOf(b2.caseId)).length === 0 && (await getProposal(D, cards[0].id))?.status === "pending", "not حضوري without a service date: nothing saved, the card stays pending", failMsg);
  // a bad / future service date is refused (never guessed)
  const bad = await buildDeadlines(D, { caseId: b2.caseId, judgmentId, kind: "appeal", startBasis: "service_date", serviceDate: "٣١/٢", urgent: false, reminders: [] });
  const future = await buildDeadlines(D, { caseId: b2.caseId, judgmentId, kind: "appeal", startBasis: "service_date", serviceDate: "1/1/2099", urgent: false, reminders: [] });
  const before = await buildDeadlines(D, { caseId: b2.caseId, judgmentId, kind: "appeal", startBasis: "service_date", serviceDate: "1/10/2026", urgent: false, reminders: [] });
  check(!!bad.card.startError && !!future.card.startError && !!before.card.startError && !bad.save && !future.save && !before.save, "an unclear, a future or a before-the-judgment service date is refused with a reason");
  // not حضوري with a real date: the period runs from it (art. 213): 21/10/2026 + 40 = 30/11/2026
  const svc = await buildDeadlines(D, { caseId: b2.caseId, judgmentId, kind: "appeal", startBasis: "service_date", serviceDate: "21/10/2026", urgent: false, reminders: [7] });
  check(svc.save?.start_basis === "service_date" && svc.save.start_date === "2026-10-21" && svc.save.last_day === "2026-11-30" && !svc.card.startError, "not حضوري: start = the typed service date, last day 30/11/2026", JSON.stringify(svc.save?.last_day));
  // urgent
  const urg = await buildDeadlines(D, { caseId: b2.caseId, judgmentId, kind: "appeal", startBasis: "judgment_date", urgent: true, reminders: [] });
  check(urg.save?.days === 15 && !!urg.save.urgent && urg.save.last_day === "2026-11-04", "urgent: 15 days from the urgent sentence of art. 227, last day 4/11/2026");

  // the tap: confirm with the lawyer's inputs (urgent, reminders 3 and 1); the numbers are recomputed, not taken from the card
  const done = await decideProposal(D, cards[0].id, { mode: "confirm", opIds: ["op1"], edits: { op1: { urgent: true, reminders: [3, 1, 3] } } });
  const saved = await deadlinesOf(b2.caseId);
  check(done.status === "confirmed" && saved.length === 1, "confirm saves one deadline");
  const s = saved[0];
  check(s?.kind === "appeal" && s.days === 15 && s.urgent && s.start_date === "2026-10-20" && s.raw_last_day === "2026-11-04" && s.last_day === "2026-11-04" && JSON.stringify(s.reminders) === "[3,1]", "…days 15, last day 4/11/2026, reminders 3 and 1 (no duplicates)", JSON.stringify(s));
  check(s?.article_number === "227" && s.article_text === FX["227"].text_ar && s.version_id === FX["227"].version_id && s.article_sha256 === FX["227"].text_sha256 && !s.holidays_reviewed, "…with the article's version, hash and verbatim text, and «holidays not reviewed»");
  check(s?.created_by_kind === "lawyer" && s.review_status === "confirmed", "…as the lawyer's confirmed row");
  const dup = await proposeDeadlinesForJudgment(D, { judgmentId, threadId: b2.threadId });
  check(!dup.proposed && dup.why === "already saved", "a saved judgment gets no second card", dup.proposed ? "" : dup.why);
  const entry2 = (await loadDeadlineCards(D, [done as never]))[done.id];
  check("card" in entry2 && entry2.card.rows[0].last_day === "2026-11-04" && entry2.card.urgent, "a confirmed card shows what was saved");

  // the Roll
  const roll = await deadlinesInRange(D, "2026-10-30", "2026-11-05");
  const mine = roll.filter((r) => r.case_id === b2.caseId);
  check(mine.map((r) => `${r.date}:${r.type}`).join(",") === "2026-11-01:reminder,2026-11-03:reminder,2026-11-04:last_day", "the Roll: reminder lines on 1/11 and 3/11 and the last day on 4/11", mine.map((r) => `${r.date}:${r.type}`).join(","));
  check((await deadlinesInRange(D, "2026-11-05", "2026-11-30")).every((r) => r.case_id !== b2.caseId), "…and nothing outside the range");

  // undo (applyOp's own): a fresh judgment, add the deadline, undo it
  const c = await newCase();
  const jr = await applyOp(D, "add_judgment", { case: c.caseId, date: "20/10/2026", kind: "final", operative_text: "حكمت المحكمة بقبول الاستئناف", quote: "حكمت" }, { review_status: "confirmed", created_by_kind: "lawyer", source_kind: "manual" });
  const dl = await applyOp(D, "add_deadline", { case: c.caseId, judgment: jr.id, kind: "appeal", start_basis: "judgment_date", urgent: false, reminders: [7, 1] }, { review_status: "confirmed", created_by_kind: "lawyer", source_kind: "manual" });
  check((await deadlinesOf(c.caseId)).length === 1, "applyOp add_deadline saves the row");
  await dl.undo();
  check((await deadlinesOf(c.caseId)).length === 0, "undo removes it");
  // a stage that has no deadline kind, and a preliminary judgment
  let wrongKind = "";
  try { await applyOp(D, "add_deadline", { case: c.caseId, judgment: jr.id, kind: "cassation", start_basis: "judgment_date", urgent: false, reminders: [] }, { review_status: "confirmed", created_by_kind: "lawyer", source_kind: "manual" }); } catch (e) { wrongKind = e instanceof Error ? e.message : String(e); }
  check(wrongKind.includes("مش مناسب"), "a cassation deadline for a first-instance case is refused", wrongKind);
  const pre = await newCase();
  const jpre = await judgmentCard(pre.caseId, pre.threadId, "20/10/2026", "preliminary");
  await decideProposal(D, jpre.id, { mode: "confirm" });
  check((await cardsOf(pre.threadId)).length === 0, "a preliminary judgment proposes no card (art. 212)");
  // no judgment date: never guessed
  const nd = await newCase();
  const jnd = await createProposal(D, { threadId: nd.threadId, caseId: nd.caseId, sourceTexts: ["حكم"], ops: [{ tool: "add_judgment", args: { case: nd.caseId, operative_text: "حكمت المحكمة برفض الدعوى", quote: "حكم" }, source: { kind: "chat", quote: "حكم" } }] });
  await decideProposal(D, jnd.id, { mode: "confirm" });
  check((await cardsOf(nd.threadId)).length === 0, "a judgment with no date proposes no card (the date is never guessed)");

  // an appeal-stage case: the cassation row is computed from the appeal judgment (60 days, art. 252)
  const ap2 = await newCase("appeal");
  const jap = await judgmentCard(ap2.caseId, ap2.threadId, "20/10/2026");
  await decideProposal(D, jap.id, { mode: "confirm" });
  const apCards = await cardsOf(ap2.threadId);
  const apEntry = apCards.length ? (await loadDeadlineCards(D, [apCards[0] as never]))[apCards[0].id] : null;
  const crow = apEntry && "card" in apEntry ? apEntry.card.rows : [];
  check(crow.length === 1 && crow[0].kind === "cassation" && crow[0].days === 60 && crow[0].last_day === "2026-12-19", "an appeal-stage judgment: the cassation row is computed (60 days, 19/12/2026)", JSON.stringify(crow[0]));
  const cs = await newCase();
  await db.from("cases").update({ stage: "cassation" }).eq("id", cs.caseId);
  const jcs = await judgmentCard(cs.caseId, cs.threadId, "20/10/2026");
  await decideProposal(D, jcs.id, { mode: "confirm" });
  check((await cardsOf(cs.threadId)).length === 0, "a cassation-stage judgment proposes no card");

  // ---------- holidays: only APPROVED rows move a date (the demo owner is an admin: a temporary row far in the future) ----------
  if (isAdmin) {
    const h = await db.from("holidays").insert({ holiday_date: "2031-03-03", name: "اختبار", status: "draft" }).select("id").single();
    made.holidays.push(h.data!.id);
    const h2 = await db.from("holidays").insert({ holiday_date: "2031-03-04", name: "اختبار 2", status: "approved" }).select("id").single();
    made.holidays.push(h2.data!.id);
    const f = await newCase();
    const jf = await applyOp(D, "add_judgment", { case: f.caseId, date: "22/1/2031", kind: "final", operative_text: "حكمت المحكمة برفض الدعوى", quote: "حكمت" }, { review_status: "confirmed", created_by_kind: "lawyer", source_kind: "manual" });
    // 22/1/2031 + 40 = 3/3/2031 (a Monday): a draft holiday there does not move it, and 2031 has an approved holiday so no «راجع الإجازات»
    const r1 = await buildDeadlines(D, { caseId: f.caseId, judgmentId: jf.id, kind: "appeal", startBasis: "judgment_date", urgent: false, reminders: [] });
    check(r1.save?.raw_last_day === "2031-03-03" && r1.save.last_day === "2031-03-03" && !!r1.save.holidays_reviewed, "a DRAFT holiday on the last day does not move it; a year with an approved holiday is not flagged", JSON.stringify(r1.save?.last_day));
    await db.from("holidays").update({ status: "approved" }).eq("id", h.data!.id);
    const r2 = await buildDeadlines(D, { caseId: f.caseId, judgmentId: jf.id, kind: "appeal", startBasis: "judgment_date", urgent: false, reminders: [] });
    check(r2.save?.last_day === "2031-03-05", "after approval: 3/3 and 4/3 are holidays, the last day moves to Wednesday 5/3/2031", JSON.stringify(r2.save?.last_day));
  } else {
    console.log("SKIP  holiday moves (the DEMO user is not an admin)");
  }
} finally {
  if (made.holidays.length) await db.from("holidays").delete().in("id", made.holidays);
  if (made.cases.length) {
    await db.from("proposals").delete().in("case_id", made.cases);
    await ex(db.from("cases").delete().in("id", made.cases));
  }
  const { count } = await db.from("cases").select("id", { count: "exact", head: true }).eq("title", "اختبار-مواعيد-الطعن");
  console.log(`cleanup: ${made.cases.length} cases, ${made.holidays.length} holidays removed (test cases left: ${count ?? "?"})`);
}
console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks passed");
process.exit(fails ? 1 : 0);
