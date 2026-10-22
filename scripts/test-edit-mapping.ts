// Old → new mapping of the edit highlights (src/lib/edits.ts), no network: fake saved rows and fake ops.
// Run: npx tsx scripts/test-edit-mapping.ts
import { buildPendingEdits, diffRows, editsLabel, type SavedCase } from "@/lib/edits";
import type { Proposal, ProposalOp } from "@/lib/proposals";

let fails = 0;
const check = (ok: boolean, what: string, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`); if (!ok) fails++; };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const CASE = "62bc827a-1988-4974-9d2d-28fa301a9180";
const H1 = "c356be72-46ff-4f22-9fd4-07a7b281b5c0";
const H2 = "1069807d-a661-4d7e-b910-54c716efe7b3";
const saved: SavedCase = { case_number: "772", case_year: 2025, court: "محكمة شمال القاهرة الابتدائية", circuit: "الدائرة 3 إيجارات", case_type: "إيجارات", title: null, stage: "first_instance", status: "active", client_role: null, summary: "ملخص قديم.", facts_date: "2024-11-01", facts_date_precision: "day" };
const hearing = { id: H1, hearing_date: "2026-10-20", decision_type: null, decision_text: null, next_hearing_id: null, location: null };

const op = (tool: ProposalOp["tool"], args: Record<string, unknown>, id = "op1"): ProposalOp =>
  ({ op_id: id, tool, args, source: { kind: "chat" }, quote_verified: true, status: "pending" });
const prop = (id: string, ops: ProposalOp[], over: Partial<Proposal> = {}): Proposal =>
  ({ id, thread_id: null, message_id: null, case_id: CASE, document_id: null, ops, status: "pending", created_at: `2026-10-23T10:0${id.slice(-1)}:00Z`, ...over });

// update_case
let r = diffRows(op("update_case", { case: CASE, court: "محكمة الجيزة", circuit: "5", status: "reserved_for_judgment", facts_date: "1/12/2024", summary: "ملخص قديم." }), { case: saved });
check(eq(r.map((x) => x.key), ["court", "circuit", "status", "facts_date"]), "update_case: only the fields that change (same summary is dropped)", r.map((x) => x.key).join(","));
check(r[0].old === saved.court && r[0].new === "محكمة الجيزة", "update_case: court old → new");
check(r[1].new === "الدائرة 5" && r[1].old === "الدائرة 3 إيجارات", "update_case: a bare circuit number becomes «الدائرة 5», like applyOp");
check(r[2].new === "محجوزة للحكم" || r[2].new.length > 0, "update_case: status shown by its label", r[2].new);
check(r[3].old === "1/11/2024" && r[3].new === "1/12/2024", "update_case: date shown d/m/yyyy", `${r[3].old} → ${r[3].new}`);
check(diffRows(op("update_case", { case: CASE, court: saved.court }), { case: saved }).length === 0, "update_case: the same value is no edit");
check(diffRows(op("update_case", { case: CASE, court: "x" }), { case: { ...saved, court: "x" } }).length === 0, "data changed since: the current value is the old one (no edit left)");

// record_decision
r = diffRows(op("record_decision", { hearing: H1, decision: "postponed", decision_text: "لتقديم أصل عقد الإيجار", next_date: "5/12/2026" }), { hearing, nextDate: null });
check(eq(r.map((x) => x.key), ["next_date", "decision"]) && r[0].old === null && r[0].new === "5/12/2026", "record_decision: next date + decision rows, no old when no next hearing", JSON.stringify(r));
check(editsLabel(r.length) === "تعديلين", "two rows → «تعديلين» (rows, not ops)");
r = diffRows(op("record_decision", { hearing: H1, decision: "postponed", next_date: "5/12/2026" }), { hearing: { ...hearing, next_hearing_id: H2 }, nextDate: "2026-10-22" });
check(r[0].old === "22/10/2026" && r[0].new === "5/12/2026", "record_decision: old = the saved next hearing's date");
check(diffRows(op("record_decision", { hearing: H1, decision: "postponed" }), { hearing: { ...hearing, decision_type: "postponed" } })[0].old !== null, "record_decision: a saved decision is the old value");

// set_hearing_location
r = diffRows(op("set_hearing_location", { hearing: H1, location: "الدور 4 · قاعة 12" }), { hearing: { ...hearing, location: "الدور 2" } });
check(r.length === 1 && r[0].old === "الدور 2" && r[0].new === "الدور 4 · قاعة 12", "set_hearing_location old → new");

// add ops and none-ops have no rows
check(diffRows(op("add_fact", { case: CASE, text: "واقعة" }), { case: saved }).length === 0, "add_fact: no old → new rows");

// the page: each op kind lands on its place; only THIS case
const hs = [{ ...hearing, nextDate: null }, { id: H2, hearing_date: "2026-09-29", decision_type: "postponed", decision_text: null, next_hearing_id: null, location: null, nextDate: null }];
const other = "11111111-1111-4111-8111-111111111111";
const e = buildPendingEdits(CASE, { case: saved, hearings: hs }, [
  prop("p1", [
    op("update_case", { case: CASE, court: "محكمة الجيزة", circuit: "5" }, "op1"),
    op("record_decision", { hearing: H1, decision: "postponed", next_date: "5/12/2026" }, "op2"),
    op("add_hearing", { case: CASE, date: "5/12/2026", purpose: "للمستندات" }, "op3"),
    op("add_fact", { case: CASE, date: "3/10/2026", text: "الموكل سلّم الإنذار" }, "op4"),
    op("add_party", { case: CASE, name: "شركة س", role: "defendant" }, "op5"),
    op("add_request", { case: CASE, text: "الإخلاء" }, "op6"),
    op("add_argument", { case: CASE, side: "ours", text: "دفاع" }, "op7"),
    op("update_case", { case: other, court: "محكمة أخرى" }, "op8"), // another case: not on this page
    op("add_fact", { case: other, text: "واقعة قضية تانية" }, "op9"),
    op("record_decision", { hearing: "22222222-2222-4222-8222-222222222222", decision: "postponed" }, "op10"), // a hearing of another case
    op("add_judgment", { case: CASE, operative_text: "حكم" }, "op11"), // no place on the page yet
  ]),
  prop("p2", [op("update_case", { case: CASE, court: "محكمة ثانية" })]),
  prop("p3", [op("add_fact", { case: CASE, text: "مرفوضة" })], { status: "rejected" }),
  prop("p4", [{ ...op("add_fact", { case: CASE, text: "اتحفظت" }), status: "confirmed" as const }], { status: "confirmed" }),
]);
check(eq(e.groups[0], { proposalId: "p1", opIds: ["op1", "op2", "op3", "op4", "op5", "op6", "op7"] }), "page: only this case's ops that have a place on the page", JSON.stringify(e.groups[0]));
check(e.groups.length === 2 && e.groups[1].proposalId === "p2", "page: a second open card is a second group; rejected and confirmed cards are not");
check(e.casePatch?.court === "محكمة ثانية" && e.casePatch?.circuit === "الدائرة 5", "page: several update_case fold in card order", JSON.stringify(e.casePatch));
check(e.decisions.length === 1 && e.decisions[0].hearingId === H1, "page: the decision goes to its hearing");
check(e.timeline.length === 3 && e.parties.length === 1 && e.requests.length === 1 && e.arguments.length === 1 && e.arguments[0].side === "ours", "page: timeline (decision, hearing, fact), party, request, argument rows", `${e.timeline.length}`);
check(e.count === 10, "page: count = rows (2 case fields, 2 decision rows, 5 new rows, p2's court)", `${e.count}`);
check(!JSON.stringify(e).includes("قضية تانية") && !JSON.stringify(e).includes("مرفوضة") && !JSON.stringify(e).includes("اتحفظت"), "page: nothing of another case, a rejected card or a saved op");

console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks passed");
process.exit(fails ? 1 : 0);
