// PR 5 (الحسابات): unit tests with a FAKE Db (nothing is sent anywhere, nothing is written), plus a live READ-ONLY look at the two new tables through RLS.
//  (a) the piaster math: parsing (Western and Arabic numerals, grouping, 1–2 decimals), exact formatting, exact sums, no float anywhere
//  (b) the case-suggestion rule (one open case / the one with a balance / ask when it cannot be told)
//  (c) an unclear amount is refused: by the tool schema, by the never-guess check, by applyOp (and nothing is written)
//  (d) record_movement / set_case_fee through applyOp: the piasters written, the ids checked (client and case visible, the case is the client's), the undo
//  (e) prepareMovement (what the chat does before a card is made): the case is named / suggested / asked, the date becomes today
//  (f) live, read-only: the demo user and the other office's user can read the new tables (both empty now) and see no row of each other
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-accounts.ts
import { createClient } from "@supabase/supabase-js";
import { caseMoney, suggestCase, summarize, type Move } from "@/lib/accounts-calc";
import { moneyNotInSource, resolveMovementCase, type CaseChoice } from "@/lib/accounts-guard";
import { prepareMovement } from "@/lib/accounts";
import { formatDmy, todayIso } from "@/lib/dates";
import { amountsIn, amountStated, amountText, formatAmount, formatEgp, fromDb, parseAmount, sumPiasters } from "@/lib/money";
import type { Db } from "@/lib/supabase/server";
import { applyOp, MANUAL } from "@/lib/tools/apply";
import { WRITE_TOOL_ARGS } from "@/lib/tools/registry";

let fails = 0;
const check = (ok: boolean, what: string, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`); if (!ok) fails++; };
const eq = (got: unknown, want: unknown, what: string) => check(JSON.stringify(got) === JSON.stringify(want), what, `got ${JSON.stringify(got)}${JSON.stringify(got) === JSON.stringify(want) ? "" : `, want ${JSON.stringify(want)}`}`);
const rejects = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e instanceof Error ? e.message : String(e); } };

// ---------------------------------------------------------------- (a) the piaster math
console.log("\n-- (a) money math --");
eq(parseAmount("3000"), 300000, "«3000» = 300000 piasters");
eq(parseAmount("3,000"), 300000, "«3,000» (grouping)");
eq(parseAmount("٣٠٠٠"), 300000, "Arabic-Indic numerals «٣٠٠٠»");
eq(parseAmount("٣٬٠٠٠"), 300000, "Arabic thousands separator «٣٬٠٠٠»");
eq(parseAmount("3000 جنيه"), 300000, "«3000 جنيه»");
eq(parseAmount("450.50"), 45050, "«450.50» = 45050");
eq(parseAmount("450.5"), 45050, "«450.5» = 45050");
eq(parseAmount("٤٥٠٫٥٠"), 45050, "Arabic decimal mark «٤٥٠٫٥٠»");
eq(parseAmount(3000), 300000, "the number 3000");
eq(parseAmount(450.5), 45050, "the number 450.5 (read through its text)");
eq(parseAmount("0.10"), 10, "«0.10» = 10");
eq(parseAmount("0.10")! + parseAmount("0.20")!, 30, "0.10 + 0.20 = 0.30 exactly (a float gives 0.30000000000000004)");
eq(parseAmount("1,000,000"), 100000000, "«1,000,000»");
eq(parseAmount("9999999999.99"), 999999999999, "the largest amount with piasters");
for (const bad of ["", "   ", "abc", "3 آلاف", "ثلاثة آلاف", "حوالي 3000", "3000 أو 4000", "3000 4000", "-5", "+5", "0", "0.00", "3.000", "3,00", "1,5", "3000.", ".5", "3000.555", "٣٠٠٠٠٠٠٠٠٠٠٠٠", "1e3", "10000000000.01", "NaN"]) eq(parseAmount(bad), null, `refused: «${bad}»`);
eq(parseAmount(NaN), null, "refused: NaN");
eq(parseAmount(Infinity), null, "refused: Infinity");
eq(parseAmount(null), null, "refused: null");
eq(formatAmount(3350000), "33,500", "33,500");
eq(formatAmount(45050), "450.50", "450.50");
eq(formatAmount(5), "0.05", "0.05");
eq(formatAmount(100), "1", "1");
eq(formatAmount(123456789), "1,234,567.89", "1,234,567.89");
eq(formatEgp(300000), "3,000 ج.م", "3,000 ج.م");
eq(amountText(45050), "450.50", "text form 450.50");
eq(parseAmount(amountText(123456789)), 123456789, "text form reads back exactly");
eq(sumPiasters([10, 20, 300000]), 300030, "an exact integer sum");
check((await rejects(Promise.resolve().then(() => sumPiasters([Number.MAX_SAFE_INTEGER, 5])))) !== null, "a sum past 2^53 is refused, not rounded");
eq(fromDb(300000), 300000, "fromDb: a safe integer");
eq(fromDb("45050"), 45050, "fromDb: digits as text");
check((await rejects(Promise.resolve().then(() => fromDb(1.5)))) !== null, "fromDb refuses a fraction");
check((await rejects(Promise.resolve().then(() => fromDb(null)))) !== null, "fromDb refuses null");
eq(amountsIn("استلمت من عادل 3000 فودافون كاش"), [300000], "amounts in «استلمت من عادل 3000 فودافون كاش»");
eq(amountsIn("دفع ٣٬٥٠٠ جنيه"), [350000], "amounts in Arabic numerals with grouping");
eq(amountsIn("دفع 3.5 ألف"), [350000], "«3.5 ألف» = 3,500 (integer maths on the text)");
eq(amountsIn("دفع 2 مليون"), [200000000], "«2 مليون»");
eq(amountsIn("القضية 772 لسنة 2025 ودفع 3000"), [77200, 202500, 300000], "case number and year are numbers too (the check only asks «is this amount stated»)");
eq(amountsIn("دفع ثلاثة آلاف"), [], "an amount in words is NOT found");
check(amountStated("3000", ["استلمت من عادل 3000 فودافون كاش"]), "amountStated: 3000 is in the lawyer's words");
check(amountStated("3000.00", ["استلمت 3,000 جنيه"]), "amountStated: 3000.00 ≡ 3,000");
check(!amountStated("3000", ["استلمت من عادل 30000 فودافون كاش"]), "amountStated: 3000 is not inside 30000");
check(!amountStated("4000", ["استلمت من عادل 3000"]), "amountStated: 4000 is not stated");
check(!amountStated("3000", ["استلمت من عادل ثلاثة آلاف"]), "amountStated: an amount in words is not stated (the assistant must ask)");

// ---------------------------------------------------------------- (b) the case-suggestion rule
console.log("\n-- (b) which case a receipt goes on --");
const mv = (o: Partial<Move> & { amount: number }): Move => ({ id: "m", case_id: null, kind: "receipt", method: "cash", moved_on: "2026-10-01", charged_to: null, note: null, review_status: "confirmed", created_at: "2026-10-01T10:00:00Z", ...o });
const money = (fee: { kind: "fixed" | "open"; amount: number | null } | null, paid = 0) => caseMoney(fee, paid ? [mv({ amount: paid, case_id: "c" })] : []);
const sc = (id: string, open: boolean, m: ReturnType<typeof money>) => ({ id, open, money: m });
eq(suggestCase([]), { id: null, why: "none" }, "no cases → the general account");
eq(suggestCase([sc("a", false, money({ kind: "fixed", amount: 1000000 }, 0))]), { id: null, why: "none" }, "only a finished case → the general account");
eq(suggestCase([sc("a", true, money(null))]), { id: "a", why: "only" }, "one open case → it, even with no fee set");
eq(suggestCase([sc("a", true, money({ kind: "fixed", amount: 1500000 }, 900000)), sc("b", true, money({ kind: "open", amount: null }, 450000)), sc("c", true, money({ kind: "fixed", amount: 2000000 }, 2000000))]), { id: "a", why: "balance" }, "3 open cases, ONE with a balance → that one");
eq(suggestCase([sc("a", true, money({ kind: "fixed", amount: 1500000 }, 900000)), sc("b", true, money({ kind: "fixed", amount: 2000000 }, 100000))]), { id: null, why: "ambiguous" }, "two cases with a balance → not guessed");
eq(suggestCase([sc("a", true, money(null)), sc("b", true, money({ kind: "open", amount: null }))]), { id: null, why: "ambiguous" }, "two open cases, none with a balance → not guessed");
eq(suggestCase([sc("a", true, money({ kind: "fixed", amount: 1500000 }, 900000)), sc("old", false, money({ kind: "fixed", amount: 500000 }, 0))]), { id: "a", why: "only" }, "a finished case with an unpaid fee does not count as an open case");
// the calc behind it
eq(money({ kind: "fixed", amount: 1500000 }, 900000), { fee: { kind: "fixed", amount: 1500000 }, paid: 900000, remaining: 600000, over: 0 }, "fixed 15,000 paid 9,000 → remaining 6,000");
eq(money({ kind: "fixed", amount: 1500000 }, 1600000).remaining, 0, "overpaid: remaining 0 …");
eq(money({ kind: "fixed", amount: 1500000 }, 1600000).over, 100000, "… and the 1,000 over is shown apart");
eq(money({ kind: "open", amount: null }, 450000).remaining, null, "an OPEN fee has no balance (null, not 0)");
eq(money(null, 450000).remaining, null, "no fee set: no balance (null)");
{
  const moves: Move[] = [
    mv({ id: "1", amount: 300000, case_id: "a", moved_on: "2026-10-23", created_at: "2026-10-23T09:00:00Z", method: "vodafone_cash" }),
    mv({ id: "2", amount: 450000, case_id: "b", moved_on: "2026-09-14" }),
    mv({ id: "3", amount: 45050, kind: "expense", charged_to: "client", case_id: "a", moved_on: "2026-10-02" }),
    mv({ id: "4", amount: 10000, kind: "expense", charged_to: "office", moved_on: "2026-10-02" }),
    mv({ id: "5", amount: 999999, review_status: "suggested", case_id: "a", moved_on: "2026-10-25" }),
    mv({ id: "6", amount: 777777, review_status: "rejected", case_id: "a" }),
    mv({ id: "7", amount: 50000, case_id: null, moved_on: "2026-08-01" }),
  ];
  const cases = [{ id: "a", money: caseMoney({ kind: "fixed", amount: 1500000 }, moves.filter((m) => m.case_id === "a")) }, { id: "b", money: caseMoney({ kind: "open", amount: null }, moves.filter((m) => m.case_id === "b")) }];
  const s = summarize(cases, moves);
  eq([s.paid, s.paidCases, s.paidGeneral], [800000, 2, true], "summary: paid = confirmed receipts only (3,000 + 4,500 + 500 general), 2 cases + the general account");
  eq(s.remaining, 1200000, "summary: remaining = 15,000 − 3,000 = 12,000 (a suggested row is not counted)");
  eq([s.expenses, s.officeExpenses], [45050, 10000], "summary: 450.50 charged to the client, 100 to the office");
  eq(s.last?.id, "1", "summary: the last payment is the newest by date");
  eq([s.agreed, s.openFees], [1500000, 1], "summary: agreed 15,000, one open fee");
}

// ---------------------------------------------------------------- a fake Db for (c)(d)(e)
type Rows = Record<string, Record<string, unknown>[]>;
/** Every query chain resolves from `rows[table]` (single/maybeSingle: the first row; awaiting the chain: the list). Inserts and updates are recorded (payload + table). */
function fakeDb(rows: Rows) {
  const writes: { op: string; table: string; payload?: Record<string, unknown> }[] = [];
  const db = {
    from(table: string) {
      const list = rows[table] ?? [];
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "in", "is", "order", "limit", "not", "or", "gte", "lte"]) q[m] = () => q;
      for (const m of ["insert", "update", "delete", "upsert"]) q[m] = (payload?: Record<string, unknown>) => { writes.push({ op: m, table, payload }); return q; };
      const first = () => (writes.some((w) => w.table === table && w.op === "insert") ? { id: "new-row-id" } : list[0] ?? null);
      q.single = async () => ({ data: first(), error: null });
      q.maybeSingle = async () => ({ data: first(), error: null });
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: writes.some((w) => w.table === table && w.op !== "select") ? [{ id: "x" }] : list, error: null }).then(res);
      return q;
    },
  };
  return { db: db as unknown as Db, writes };
}
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CLIENT = U(1), CASE_A = U(2), CASE_B = U(3), OTHER_CLIENT_CASE = U(4);
const base = { client: CLIENT, kind: "receipt", amount: "3000", method: "vodafone_cash", quote: "استلمت من عادل 3000 فودافون كاش" };

// ---------------------------------------------------------------- (c) an unclear amount is refused
console.log("\n-- (c) an unclear amount is refused --");
{
  const schema = WRITE_TOOL_ARGS.record_movement;
  check(schema.safeParse(base).success, "the tool schema accepts a clear amount");
  for (const bad of ["", "ثلاثة آلاف", "3 آلاف", "حوالي 3000", "3000 أو 4000", "0", "-5", "3.000", "كام ألف"]) {
    check(!schema.safeParse({ ...base, amount: bad }).success, `the tool schema refuses amount «${bad}»`);
  }
  check(!schema.safeParse({ ...base, amount: undefined }).success, "the tool schema refuses a missing amount");
  check(!schema.safeParse({ ...base, method: undefined }).success, "the tool schema refuses a missing method");
  check(!schema.safeParse({ ...base, kind: "expense" }).success, "an expense without «على مين» (charged_to) is refused");
  check(schema.safeParse({ ...base, kind: "expense", charged_to: "office" }).success, "an expense with charged_to is accepted");
  check(!schema.safeParse({ ...base, charged_to: "client" }).success, "a receipt with charged_to is refused");
  check(!schema.safeParse({ ...base, case: CASE_A, general_account: true }).success, "a case AND the general account is refused");
  check(!WRITE_TOOL_ARGS.set_case_fee.safeParse({ case: CASE_A, kind: "fixed", quote: "x" }).success, "a fixed fee with no amount is refused");
  check(!WRITE_TOOL_ARGS.set_case_fee.safeParse({ case: CASE_A, kind: "open", amount: "100", quote: "x" }).success, "an open fee with an amount is refused");
  check(WRITE_TOOL_ARGS.set_case_fee.safeParse({ case: CASE_A, kind: "open", quote: "x" }).success, "an open fee with no amount is accepted");

  // the never-guess check: the amount and the method must be in the lawyer's words
  const said = ["استلمت من عادل 3000 فودافون كاش"];
  eq(moneyNotInSource("record_movement", base, said), [], "the amount and the method are in the words → nothing missing");
  check(moneyNotInSource("record_movement", { ...base, amount: "4000" }, said).length === 1, "an amount the lawyer did not say (4000) is refused");
  check(moneyNotInSource("record_movement", base, ["استلمت من عادل ثلاثة آلاف فودافون كاش"]).length === 1, "an amount in words («ثلاثة آلاف») is refused: the assistant asks");
  check(moneyNotInSource("record_movement", base, ["استلمت من عادل 3000"]).length === 1, "a method the lawyer did not say is refused");
  check(moneyNotInSource("record_movement", { ...base, method: "cash" }, said).length === 1, "«فودافون كاش» is not read as plain cash");
  eq(moneyNotInSource("record_movement", { ...base, method: "cash" }, ["استلمت من عادل 3000 كاش"]), [], "«كاش» is cash");
  eq(moneyNotInSource("record_movement", { ...base, method: "instapay" }, ["دفع 3000 إنستا باي"]), [], "«إنستا باي» is InstaPay");
  eq(moneyNotInSource("record_movement", { ...base, method: "bank_transfer" }, ["حوّل 3000 تحويل بنكي"]), [], "«تحويل بنكي»");
  eq(moneyNotInSource("record_movement", { ...base, method: "cheque" }, ["جاب شيك بـ 3000"]), [], "«شيك»");
  eq(moneyNotInSource("record_movement", { ...base, amount: "3000" }, ["القضية 3000 لسنة 2025 فودافون"]).length, 0, "(known limit) a number that is a case number also counts as stated; the card shows the amount for the lawyer to see");
  eq(moneyNotInSource("set_case_fee", { case: CASE_A, kind: "fixed", amount: "15000" }, ["اتفقنا على 15,000 جنيه أتعاب"]), [], "set_case_fee: 15,000 is stated");
  check(moneyNotInSource("set_case_fee", { case: CASE_A, kind: "fixed", amount: "15000" }, ["اتفقنا على أتعاب"]).length === 1, "set_case_fee: an amount not stated is refused");
  eq(moneyNotInSource("add_fact", { amount: "9" }, ["x"]), [], "other tools are untouched");

  // applyOp itself refuses (defence in depth) and writes nothing
  const { db, writes } = fakeDb({ clients: [{ id: CLIENT }], cases: [] });
  for (const bad of ["ثلاثة آلاف", "حوالي 3000", "0"]) {
    const m = await rejects(applyOp(db, "record_movement", { ...base, amount: bad }, MANUAL));
    check(m !== null, `applyOp refuses amount «${bad}»`, String(m).slice(0, 60));
  }
  check(writes.length === 0, "the refused ops wrote nothing (fake db)", writes.map((w) => `${w.op} ${w.table}`).join(","));
}

// ---------------------------------------------------------------- (d) record_movement / set_case_fee through applyOp
console.log("\n-- (d) record_movement and set_case_fee through applyOp --");
{
  const rows: Rows = { clients: [{ id: CLIENT }], cases: [{ id: CASE_A, client_id: CLIENT }], account_movements: [{ id: "new" }] };
  const { db, writes } = fakeDb(rows);
  const r = await applyOp(db, "record_movement", { ...base, case: CASE_A, date: "23/10/2026", note: " دفعة تانية " }, MANUAL);
  const ins = writes.find((w) => w.op === "insert" && w.table === "account_movements")?.payload;
  eq(ins?.amount_piasters, 300000, "3000 written as 300000 piasters (an integer)");
  check(Number.isInteger(ins?.amount_piasters), "the amount written is an integer");
  eq([ins?.client_id, ins?.case_id, ins?.kind, ins?.method, ins?.moved_on, ins?.charged_to, ins?.note], [CLIENT, CASE_A, "receipt", "vodafone_cash", "2026-10-23", null, "دفعة تانية"], "the row: client, case, receipt, method, date as ISO, no charged_to, trimmed note");
  eq([ins?.review_status, ins?.created_by_kind, ins?.source_kind], ["confirmed", "lawyer", "manual"], "MANUAL provenance");
  eq(r.steps, [{ op: "delete", table: "account_movements", id: "new-row-id", after: undefined }].map((x) => ({ op: x.op, table: x.table, id: x.id })).map((x) => ({ ...x, after: r.steps![0].after })), "the undo is «delete this row»");
  writes.length = 0;
  await r.undo();
  eq(writes.map((w) => `${w.op} ${w.table}`), ["delete account_movements"], "undo() deletes the movement");
}
{
  const { db, writes } = fakeDb({ clients: [{ id: CLIENT }], cases: [{ id: CASE_A, client_id: CLIENT }], account_movements: [{ id: "new" }] });
  await applyOp(db, "record_movement", { ...base, kind: "expense", charged_to: "office", amount: "450.50", method: "cash", note: "رسوم" }, MANUAL);
  const ins = writes.find((w) => w.op === "insert")?.payload;
  eq([ins?.amount_piasters, ins?.charged_to, ins?.case_id, ins?.moved_on], [45050, "office", null, todayIso()], "an expense: 450.50 = 45050, charged to the office, no case (general account), today by default");
  const bad = await rejects(applyOp(db, "record_movement", { ...base, date: "3/2026" }, MANUAL));
  check(bad !== null, "a date that is not a full day is refused", String(bad).slice(0, 50));
  const bad2 = await rejects(applyOp(db, "record_movement", { ...base, date: "31/2/2026" }, MANUAL));
  check(bad2 !== null, "an impossible date is refused");
}
{
  // ids must be visible through RLS: the fake returns no row = the id is not visible
  const { db: noClient, writes: w1 } = fakeDb({ clients: [], cases: [] });
  eq(await rejects(applyOp(noClient, "record_movement", base, MANUAL)), "الموكل غير موجود", "a client the lawyer cannot read is refused");
  const { db: noCase, writes: w2 } = fakeDb({ clients: [{ id: CLIENT }], cases: [] });
  eq(await rejects(applyOp(noCase, "record_movement", { ...base, case: CASE_A }, MANUAL)), "الدعوى غير موجودة", "a case the lawyer cannot read is refused");
  const { db: otherCase, writes: w3 } = fakeDb({ clients: [{ id: CLIENT }], cases: [{ id: OTHER_CLIENT_CASE, client_id: U(99) }] });
  eq(await rejects(applyOp(otherCase, "record_movement", { ...base, case: OTHER_CLIENT_CASE }, MANUAL)), "الدعوى دي مش دعوى الموكل ده", "a case of ANOTHER client is refused");
  const { db: caseNoClient, writes: w4 } = fakeDb({ clients: [{ id: CLIENT }], cases: [{ id: CASE_A, client_id: null }] });
  eq(await rejects(applyOp(caseNoClient, "record_movement", { ...base, case: CASE_A }, MANUAL)), "الدعوى دي مش دعوى الموكل ده", "a case with no client is refused");
  const { db: fee0, writes: w5 } = fakeDb({ cases: [] });
  eq(await rejects(applyOp(fee0, "set_case_fee", { case: CASE_A, kind: "open", quote: "x" }, MANUAL)), "الدعوى غير موجودة", "set_case_fee: a case the lawyer cannot read is refused");
  check([w1, w2, w3, w4, w5].every((w) => w.length === 0), "none of the refused ops wrote anything");
}
{
  // set_case_fee: new fee, open fee, change of an existing fee (with its undo)
  const { db, writes } = fakeDb({ cases: [{ id: CASE_A, client_id: CLIENT }], case_fees: [] });
  const r = await applyOp(db, "set_case_fee", { case: CASE_A, kind: "fixed", amount: "15,000", quote: "x" }, MANUAL);
  const ins = writes.find((w) => w.op === "insert")?.payload;
  eq([ins?.case_id, ins?.kind, ins?.amount_piasters], [CASE_A, "fixed", 1500000], "a new fixed fee: 15,000 = 1500000 piasters");
  eq(r.steps?.[0] && { op: r.steps[0].op, table: r.steps[0].table }, { op: "delete", table: "case_fees" }, "its undo deletes the row");
  const { db: d2, writes: w2 } = fakeDb({ cases: [{ id: CASE_A, client_id: CLIENT }], case_fees: [] });
  await applyOp(d2, "set_case_fee", { case: CASE_A, kind: "open", quote: "x" }, MANUAL);
  const ins2 = w2.find((w) => w.op === "insert")?.payload;
  eq([ins2?.kind, ins2?.amount_piasters], ["open", null], "an open fee has no amount (null)");
  const { db: d3, writes: w3 } = fakeDb({ cases: [{ id: CASE_A, client_id: CLIENT }], case_fees: [{ id: U(7), kind: "fixed", amount_piasters: 1500000, updated_at: "2026-10-01T00:00:00Z" }] });
  const r3 = await applyOp(d3, "set_case_fee", { case: CASE_A, kind: "open", quote: "x" }, MANUAL);
  const upd = w3.find((w) => w.op === "update")?.payload;
  eq([upd?.kind, upd?.amount_piasters], ["open", null], "an existing fee is changed in place (to open)");
  eq(r3.steps?.[0], { op: "restore", table: "case_fees", id: U(7), cols: { kind: "fixed", amount_piasters: 1500000, updated_at: "2026-10-01T00:00:00Z" }, after: r3.steps?.[0].after }, "its undo puts the old kind and amount back");
  w3.length = 0;
  await r3.undo();
  eq(w3[0]?.payload, { kind: "fixed", amount_piasters: 1500000, updated_at: "2026-10-01T00:00:00Z" }, "undo() restores the old fee");
}

// ---------------------------------------------------------------- (e) prepareMovement
console.log("\n-- (e) prepareMovement: the case is named, suggested or asked; the date becomes today --");
{
  const open = (id: string, title: string, number: string) => ({ id, title, case_type: null, case_number: number, case_year: 2025, status: "active", created_at: "2026-01-01" });
  const rows: Rows = {
    clients: [{ id: CLIENT }],
    cases: [open(CASE_A, "إخلاء لعدم سداد الأجرة — عادل ضد وليد", "772"), open(CASE_B, "صحة توقيع — عادل ضد سامح", "4512")],
    case_fees: [{ case_id: CASE_A, kind: "fixed", amount_piasters: 1500000 }, { case_id: CASE_B, kind: "open", amount_piasters: null }],
    account_movements: [{ id: "m1", case_id: CASE_A, kind: "receipt", amount_piasters: 900000, method: "cash", moved_on: "2026-08-01", charged_to: null, note: null, review_status: "confirmed", created_by_kind: "lawyer", created_at: "2026-08-01T10:00:00Z" }],
  };
  const { db } = fakeDb(rows);
  const r = await prepareMovement(db, { ...base });
  check(r.ok && r.args.case === CASE_A, "2 open cases, one with a balance → the case with the balance is put on the card", r.ok ? String(r.args.case) : r.error);
  check(r.ok && /عليها باقي/.test(r.hint.note ?? ""), "… with the sentence saying why", r.ok ? r.hint.note ?? "" : "");
  check(r.ok && r.hint.cases.length === 2 && r.hint.cases.find((c) => c.id === CASE_A)?.remaining === 600000, "… and both cases to change the choice, with the balance (6,000 = 600000)");
  check(r.ok && r.args.date === formatDmy(todayIso()) && r.hint.today, "no date said → today's date, marked as the default");
  const named = await prepareMovement(db, { ...base, case: CASE_B, date: "1/10/2026" });
  check(named.ok && named.args.case === CASE_B && !named.hint.today && named.hint.note === null, "a case the lawyer named is kept, no «why» sentence, the stated date is kept");
  const general = await prepareMovement(db, { ...base, general_account: true });
  check(general.ok && !("case" in general.args) && !("general_account" in general.args), "«الحساب العام» → no case on the card");

  // two cases with a balance: not guessed
  const { db: amb } = fakeDb({ ...rows, case_fees: [{ case_id: CASE_A, kind: "fixed", amount_piasters: 1500000 }, { case_id: CASE_B, kind: "fixed", amount_piasters: 2000000 }] });
  const a2 = await prepareMovement(amb, { ...base });
  check(!a2.ok && /أنهي قضية/.test(a2.error), "two cases with a balance → NOT guessed: the assistant is told to ask", a2.ok ? "" : a2.error.slice(0, 70));
  // one open case only
  const { db: one } = fakeDb({ ...rows, cases: [rows.cases[0]] });
  const o1 = await prepareMovement(one, { ...base });
  check(o1.ok && o1.args.case === CASE_A && /قضية واحدة/.test(o1.hint.note ?? ""), "one open case → it, with its sentence");
  // a client that is not visible
  const { db: none } = fakeDb({ clients: [] });
  const n1 = await prepareMovement(none, { ...base });
  check(!n1.ok, "a client the lawyer cannot read → refused", n1.ok ? "" : n1.error);
  // a client made in the same card: no cases yet
  const n2 = await prepareMovement(db, { ...base, client: "@client1" });
  check(n2.ok && !("case" in n2.args), "a client made in the same card has no case yet → general account");
  // resolveMovementCase alone
  const ch = (id: string, open: boolean, m: ReturnType<typeof money>): CaseChoice => ({ id, open, money: m, label: id, name: id });
  const x = resolveMovementCase({}, [ch("a", true, money({ kind: "fixed", amount: 100 }, 0)), ch("b", true, money({ kind: "fixed", amount: 100 }, 0))]);
  check(!x.ok, "resolveMovementCase: two cases with a balance → error");
  const y = resolveMovementCase({ general_account: true }, [ch("a", true, money(null)), ch("b", true, money(null))]);
  check(y.ok && y.case === null, "resolveMovementCase: general_account settles it");
  const z = resolveMovementCase({ case: "b" }, [ch("a", true, money(null)), ch("b", true, money(null))]);
  check(z.ok && z.case === "b", "resolveMovementCase: a named case settles it");
}

// ---------------------------------------------------------------- (f) live, read-only
console.log("\n-- (f) live, read-only: the new tables through RLS --");
{
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const as = async (email: string, password: string) => {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`sign-in failed: ${error.message}`);
    return sb;
  };
  const demo = await as(process.env.DEMO_EMAIL!, process.env.DEMO_PASSWORD!);
  const other = await as(process.env.OTHER_EMAIL!, process.env.OTHER_PASSWORD!);
  for (const [who, sb] of [["demo", demo], ["other", other]] as const) {
    for (const t of ["account_movements", "case_fees"] as const) {
      const r = await sb.from(t).select("id, amount_piasters");
      check(!r.error, `${who} can read ${t} (the table and its columns exist)`, r.error?.message ?? `${r.data?.length} rows`);
      eq(r.data?.length, 0, `${who} sees no row in ${t} (nothing is saved yet)`);
    }
  }
  // the app's own read path, against the real tables (empty): the shapes and the column names are right
  const { getAccounts } = await import("@/lib/accounts");
  const { data: cl } = await demo.from("clients").select("id").limit(1).single();
  const acc = await getAccounts(demo as unknown as Db, cl!.id);
  check(!!acc && acc.moves.length === 0 && acc.summary.paid === 0, "getAccounts runs on the real tables (empty): no movements, paid 0", acc ? `${acc.cases.length} cases` : "null");
  const foreign = await getAccounts(other as unknown as Db, cl!.id);
  check(foreign === null, "the other office cannot open the demo client's accounts (null)");
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exitCode = fails ? 1 : 0;
