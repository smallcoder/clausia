// The agenda's «محتاجة قرار» tab, on the server side and in plain functions. No browser, no network, NO DATABASE: the Db is an in-memory fake, so nothing is
// read from or written to the shared project. Free.
//  - the form's rules (src/lib/decision-form.ts): the five choices and their words; the next date is required for تأجيل and حجز للحكم and only for them;
//    an unclear date, or one that is not after the hearing, is refused with the reason; nothing is guessed
//  - the list (undecidedPastHearings → decideOrder): past, no decision, not rejected; oldest first; the same day by court then circuit
//  - the save (saveDecision → applyOp('record_decision') → the database function) with MANUAL provenance, and NO other write
//  - a refused form touches nothing (no query at all)
//  - the row leaves the list and the count drops, at once (stillWaiting / waitingCount) and after the page is read again; no double count
//  - the addresses: ?tab=decide, the old ?decide=1, the sidebar / home / case page link (DECIDE_HREF)
// The browser side (tab, form, redirect, scrollbars) is scripts/test-agenda.ts (read only).
// Run: npx tsx --conditions=react-server scripts/test-agenda-decide.ts
import { decideOrder, stillWaiting, waitingCount } from "@/components/agenda/decide";
import { DECIDE_HREF, tabOf } from "@/components/agenda/url";
import { addDaysIso, todayIso } from "@/lib/dates";
import { checkDecision, NEEDS_NEXT_DATE, needsNextDate, ROW_DECISION_LABEL, ROW_DECISIONS } from "@/lib/decision-form";
import { saveDecision } from "@/lib/hearing-decision";
import { undecidedPastCount, undecidedPastHearings } from "@/lib/hearings";
import type { Db } from "@/lib/supabase/server";
import { DECISIONS } from "@/lib/tools/registry";

let fails = 0;
const check = (ok: boolean, what: string, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`); if (!ok) fails++; };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---------- a fake Db: the few queries these functions make, answered from memory ----------
type Row = Record<string, unknown>;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function fakeDb(seed: { hearings: Row[]; cases: Row[] }) {
  const hearings = seed.hearings.map((h) => ({ ...h }));
  const cases = seed.cases.map((c) => ({ ...c }));
  const rpcCalls: Row[] = [];
  const writes: string[] = [];
  let queries = 0;
  let nextId = 900;

  class Q {
    private preds: ((r: Row) => boolean)[] = [];
    private cols = "*";
    private sort: { col: string; asc: boolean } | null = null;
    private max = Infinity;
    private head = false;
    constructor(private table: string) {}
    select(cols = "*", opts?: { count?: string; head?: boolean }) { this.cols = cols; this.head = !!opts?.head; return this; }
    eq(c: string, v: unknown) { this.preds.push((r) => r[c] === v); return this; }
    neq(c: string, v: unknown) { this.preds.push((r) => r[c] !== v); return this; }
    lt(c: string, v: string) { this.preds.push((r) => String(r[c]) < v); return this; }
    is(c: string, v: null) { this.preds.push((r) => (r[c] ?? null) === v); return this; }
    in(c: string, vs: unknown[]) { this.preds.push((r) => vs.includes(r[c])); return this; }
    order(col: string, o?: { ascending?: boolean }) { this.sort = { col, asc: o?.ascending !== false }; return this; }
    limit(n: number) { this.max = n; return this; }
    insert() { writes.push(`insert ${this.table}`); return this; }
    update() { writes.push(`update ${this.table}`); return this; }
    delete() { writes.push(`delete ${this.table}`); return this; }
    private rows(): Row[] {
      queries++;
      const src = this.table === "hearings" ? hearings : this.table === "cases" ? cases : [];
      let out = src.filter((r) => this.preds.every((p) => p(r)));
      if (this.sort) { const { col, asc } = this.sort; out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1)); }
      out = out.slice(0, this.max);
      if (this.table === "hearings" && this.cols.includes("cases!inner")) return out.map((h) => ({ ...h, cases: cases.find((c) => c.id === h.case_id) }));
      if (this.cols === "*") return out;
      const names = this.cols.split(",").map((s) => s.trim());
      return out.map((r) => Object.fromEntries(names.map((n) => [n, r[n]])));
    }
    single() { const r = this.rows(); return Promise.resolve(r.length === 1 ? { data: r[0], error: null } : { data: null, error: { message: "no row" } }); }
    maybeSingle() { const r = this.rows(); return Promise.resolve({ data: r[0] ?? null, error: null }); }
    then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
      const r = this.rows();
      return Promise.resolve(this.head ? { data: null, error: null, count: r.length } : { data: r, error: null }).then(res, rej);
    }
  }

  const db = {
    from: (table: string) => new Q(table),
    // the database function record_hearing_decision, as the SQL does it: the same two refusals, the decision on the hearing, a next hearing, the case status
    rpc: async (name: string, p: Row) => {
      rpcCalls.push({ name, ...p });
      const h = hearings.find((x) => x.id === p.p_hearing_id);
      if (!h) return { data: null, error: { message: "hearing not found" } };
      if (p.p_decision === "postponed" && !p.p_next_date) return { data: null, error: { message: "a postponed decision needs the next hearing date" } };
      if (p.p_next_date && String(p.p_next_date) <= String(h.hearing_date)) return { data: null, error: { message: "next hearing date must be after the hearing date" } };
      let nxt: string | null = null;
      if (p.p_next_date) {
        nxt = h.next_hearing_id ? String(h.next_hearing_id) : U(nextId++);
        if (h.next_hearing_id) Object.assign(hearings.find((x) => x.id === nxt)!, { hearing_date: p.p_next_date, purpose: p.p_next_requirements ?? undefined });
        else hearings.push({ id: nxt, case_id: h.case_id, hearing_date: p.p_next_date, purpose: p.p_next_requirements ?? null, decision_type: null, review_status: "confirmed", previous_hearing_id: h.id, next_hearing_id: null, source_kind: p.p_source_kind, created_by_kind: p.p_created_by_kind });
      }
      Object.assign(h, { decision_type: p.p_decision, decision_text: p.p_decision_text ?? null, next_requirements: p.p_next_requirements ?? null, next_hearing_id: nxt ?? h.next_hearing_id, decision_source_kind: p.p_source_kind, decision_created_by_kind: p.p_created_by_kind });
      const c = cases.find((x) => x.id === h.case_id)!;
      if (p.p_decision === "reserved_for_judgment") c.status = "reserved_for_judgment";
      if (p.p_decision === "judgment") c.status = "judged";
      return { data: { hearing_id: h.id, next_hearing_id: nxt }, error: null };
    },
  };
  return { db: db as unknown as Db, hearings, cases, rpcCalls, writes, queries: () => queries };
}

const today = todayIso();
const day = (n: number) => addDaysIso(today, n);
const caseRow = (n: number, court: string, circuit: string, num: string, client: string, opponent: string): Row => ({
  id: U(n), case_number: num, case_year: 2025, title: null, court, circuit, client_role: "plaintiff", status: "active", case_type: null,
  clients: { name: client }, case_parties: [{ name: opponent, is_our_client: false, review_status: "confirmed" }],
});
const hearing = (n: number, caseN: number, date: string, extra: Row = {}): Row => ({
  id: U(n), case_id: U(caseN), hearing_date: date, purpose: null, location: null, decision_type: null, decision_text: null, next_requirements: null,
  previous_hearing_id: null, next_hearing_id: null, review_status: "confirmed", created_by_kind: "lawyer", source_kind: "manual", ...extra,
});

const CASES = [
  caseRow(1, "محكمة الجيزة الابتدائية", "الدائرة 5 عمال", "1290", "منى الافتراضية", "شركة الأمل"),
  caseRow(2, "شمال القاهرة الابتدائية", "الدائرة 3 إيجارات", "772", "عادل النموذجي", "وليد التجريبي"),
  caseRow(3, "استئناف القاهرة", "الدائرة 7 مدني", "8833", "كريم المثالي", "حسن الافتراضي"),
  caseRow(4, "جنوب القاهرة الابتدائية", "الدائرة 9", "3021", "حسام الافتراضي", "شركة النيل"),
];
const seed = () => ({
  cases: CASES,
  hearings: [
    hearing(11, 1, day(-30), { purpose: "تقرير الخبير" }),   // the oldest
    hearing(12, 2, day(-10)),                                 // same day as 13, a court that sorts AFTER it (but is first in the table)
    hearing(13, 3, day(-10), { purpose: "الاطلاع والمذكرات" }),
    hearing(14, 4, day(-2)),                                  // the newest
    hearing(15, 4, day(-20), { decision_type: "judgment" }),  // decided: not listed
    hearing(16, 2, day(5)),                                   // future: not listed
    hearing(17, 1, day(-40), { review_status: "rejected" }),  // rejected: not listed
  ],
});

// ---------- 1) the form's rules ----------
{
  check(same([...ROW_DECISIONS], ["postponed", "reserved_for_judgment", "judgment", "struck_off", "other"]), "the form offers five decisions: تأجيل / حجز للحكم / حكم / شطب / غير ذلك");
  check(same(ROW_DECISIONS.map((k) => ROW_DECISION_LABEL[k]), ["تأجيل", "حجز للحكم", "حكم", "شطب", "غير ذلك"]), "…with those words");
  check(same([...NEEDS_NEXT_DATE], ["postponed", "reserved_for_judgment"]), "the date is needed for تأجيل and حجز للحكم only");
  check(ROW_DECISIONS.every((k) => (DECISIONS as readonly string[]).includes(k)), "every choice is a decision the save accepts");

  const H = "2026-10-01";
  const c = (decision: string | undefined, nextRaw?: string, hearingDate: string | undefined = H) => checkDecision({ decision, nextRaw, hearingDate }, DECISIONS);
  for (const d of ["postponed", "reserved_for_judgment"]) {
    const r = c(d);
    check(!r.ok && r.field === "next_date", `${d} without a date is refused (field next_date)`, JSON.stringify(r));
    const ok = c(d, "5/11/2026");
    check(ok.ok && ok.next === "2026-11-05", `${d} with 5/11/2026 → 2026-11-05`);
  }
  for (const d of ["judgment", "struck_off", "other"]) {
    const r = c(d);
    check(r.ok && r.next === null, `${d} needs no date`, JSON.stringify(r));
  }
  check(c("judgment", "5/11/2026").ok, "a date typed for a حكم is accepted");
  check(!c("judgment", "5/13/2026").ok, "…but an unclear one is still refused (month 13)");
  check(!c("postponed", "11/2026").ok && !c("postponed", "2026").ok, "a month or a year alone is not a hearing date (never guessed)");
  const early = c("postponed", "1/10/2026");
  check(!early.ok && early.field === "next_date", "a date equal to the hearing's is refused");
  check(!c("postponed", "30/9/2026").ok, "a date before the hearing's is refused");
  const ar = c("postponed", "٥/١١/٢٠٢٦");
  check(ar.ok && ar.next === "2026-11-05", "Arabic digits are read (٥/١١/٢٠٢٦)");
  const none = c(undefined);
  check(!none.ok && none.field === "decision", "no decision chosen → «اختر القرار»");
  check(!c("nonsense").ok, "an unknown decision is refused");
  check(needsNextDate("postponed") && needsNextDate("reserved_for_judgment") && !needsNextDate("judgment") && !needsNextDate("other"), "needsNextDate says the same");
}

// ---------- 2) the list: which rows, in what order ----------
{
  const f = fakeDb(seed());
  const count = await undecidedPastCount(f.db);
  const rows = await undecidedPastHearings(f.db, 200);
  const ids = rows.map((h) => h.id);
  check(count === 4 && rows.length === 4, "4 past hearings wait: decided, future and rejected ones are left out", `count ${count}, rows ${rows.length}`);
  check(!ids.includes(U(15)) && !ids.includes(U(16)) && !ids.includes(U(17)), "…the decided, the future and the rejected hearing are not there");
  const sorted = decideOrder(rows).map((h) => h.id);
  check(same(sorted, [U(11), U(13), U(12), U(14)]), "oldest first; the same day by court (استئناف before شمال)", sorted.map((x) => Number(x.slice(-12))).join(","));
  check(same(decideOrder([...rows].reverse()).map((h) => h.id), sorted), "the order does not depend on how the rows arrive");
  const first = rows.find((h) => h.id === U(11))!;
  check(first.case.court === "محكمة الجيزة الابتدائية" && first.case.circuit === "الدائرة 5 عمال" && first.case.case_number === "1290" && first.case.case_year === 2025
    && first.case.client_name === "منى الافتراضية" && first.case.opponent === "شركة الأمل" && first.purpose === "تقرير الخبير" && first.hearing_date === day(-30),
  "each row has what it shows: date, court, circuit, case number, client, opponent, what was required");
  check(f.writes.length === 0, "reading the list wrote nothing");
}

// ---------- 3) a refused form touches nothing ----------
{
  const f = fakeDb(seed());
  const q0 = f.queries();
  const r1 = await saveDecision(f.db, { hearing: U(11), decision: "postponed", hearingDate: day(-30) });
  const r2 = await saveDecision(f.db, { hearing: U(11), decision: "reserved_for_judgment", nextRaw: "غدا", hearingDate: day(-30) });
  const r3 = await saveDecision(f.db, { hearing: U(11), hearingDate: day(-30) });
  const r4 = await saveDecision(f.db, { decision: "judgment" });
  check(!r1.ok && r1.field === "next_date" && !r2.ok && r2.field === "next_date" && !r3.ok && r3.field === "decision" && !r4.ok, "تأجيل / حجز without a date, a date in words, no decision, no hearing: all refused with the reason");
  check(f.queries() === q0 && f.rpcCalls.length === 0 && f.writes.length === 0, "…and not one query or write left for the database");
  check(await undecidedPastCount(f.db) === 4, "…the list is unchanged");
}

// ---------- 4) a save goes through applyOp (MANUAL), and the row leaves the list ----------
{
  const f = fakeDb(seed());
  const before = await undecidedPastHearings(f.db, 200);
  const total = await undecidedPastCount(f.db);
  const target = U(11);

  const r = await saveDecision(f.db, { hearing: target, decision: "postponed", nextRaw: "5/11/2099", nextRequirements: "إعلان الخصم", hearingDate: day(-30) });
  check(r.ok && r.nextDate === "2099-11-05", "تأجيل to 5/11/2099 saves; the result carries the date the lawyer typed", JSON.stringify(r));
  const call = f.rpcCalls[0];
  check(f.rpcCalls.length === 1 && call.name === "record_hearing_decision" && call.p_hearing_id === target && call.p_decision === "postponed"
    && call.p_next_date === "2099-11-05" && call.p_next_requirements === "إعلان الخصم", "the one write is applyOp → record_hearing_decision, with the typed date and requirement", JSON.stringify(call));
  check(call.p_source_kind === "manual" && call.p_created_by_kind === "lawyer", "MANUAL provenance (source manual, created by the lawyer)");
  check(f.writes.length === 0, "no other write: no insert / update / delete outside the database function");
  const saved = f.hearings.find((h) => h.id === target)!;
  check(saved.decision_type === "postponed" && saved.decision_source_kind === "manual", "the hearing now has its decision");
  check(f.hearings.some((h) => h.previous_hearing_id === target && h.hearing_date === "2099-11-05" && h.purpose === "إعلان الخصم"), "the next hearing was made from the typed date and requirement");

  // at once, before the page is read again: the stale rows still hold it, the page hides it
  const savedIds = new Set([target]);
  const waiting = stillWaiting(before, savedIds);
  check(waiting.length === 3 && !waiting.some((h) => h.id === target), "the saved row leaves the list at once");
  check(waitingCount(total, before, savedIds) === 3, "…and the tab's number drops 4 → 3");
  check(stillWaiting(before, new Set()).length === 4 && waitingCount(total, before, new Set()) === 4, "nothing saved → nothing hidden");

  // after the page is read again: the database no longer lists it, and the count is not taken down twice
  const after = await undecidedPastHearings(f.db, 200);
  const total2 = await undecidedPastCount(f.db);
  check(after.length === 3 && total2 === 3 && !after.some((h) => h.id === target), "read again: the database lists 3 and counts 3");
  check(!after.some((h) => h.hearing_date === "2099-11-05"), "the new next hearing (in the future) is not in the list");
  check(stillWaiting(after, savedIds).length === 3 && waitingCount(total2, after, savedIds) === 3, "after the refresh the tab's number stays 3 (not 2)");

  // the other decisions save without a date
  const r2 = await saveDecision(f.db, { hearing: U(12), decision: "struck_off", hearingDate: day(-10) });
  const r3 = await saveDecision(f.db, { hearing: U(13), decision: "reserved_for_judgment", nextRaw: "20/12/2099", hearingDate: day(-10) });
  check(r2.ok && r2.nextDate === null && r3.ok && r3.nextDate === "2099-12-20", "شطب saves with no date; حجز للحكم saves with its date");
  check(f.cases.find((c) => c.id === U(3))!.status === "reserved_for_judgment", "حجز للحكم puts the case in «محجوزة للحكم» (the database function's own rule)");
  check(await undecidedPastCount(f.db) === 1 && (await undecidedPastHearings(f.db, 200)).map((h) => h.id).join() === U(14), "one is left: the newest");

  // an empty list is the empty state
  await saveDecision(f.db, { hearing: U(14), decision: "judgment", hearingDate: day(-2) });
  const empty = await undecidedPastHearings(f.db, 200);
  check(empty.length === 0 && waitingCount(await undecidedPastCount(f.db), empty, new Set()) === 0 && stillWaiting(empty, new Set()).length === 0, "all saved → no rows, the number is 0 (the tab shows «كل القرارات متسجلة ✓»)");
  check(f.writes.length === 0, "still no write outside the database function");
}

// ---------- 5) the database's own refusals come back in plain words ----------
{
  const f = fakeDb(seed());
  const r = await saveDecision(f.db, { hearing: U(11), decision: "judgment", nextRaw: "1/1/2020", hearingDate: day(-30) });
  check(!r.ok && r.field === "next_date", "a next date that is not after the hearing is refused before the database");
  const missing = await saveDecision(f.db, { hearing: U(99), decision: "judgment" });
  check(!missing.ok, "a hearing that is not there is refused (nothing saved)", missing.ok ? "" : missing.error);
  check(f.hearings.every((h) => !h.decision_type || h.id === U(15)), "…nothing was decided");
}

// ---------- 6) the addresses ----------
{
  const sp = (q: string) => new URLSearchParams(q);
  check(DECIDE_HREF === "/agenda?tab=decide", "the sidebar, home card, morning block and case page all use /agenda?tab=decide");
  check(tabOf(sp("tab=decide")) === "decide" && tabOf(sp("decide=1")) === "decide", "?tab=decide opens the tab, and so does the old ?decide=1");
  check(tabOf(sp("")) === "agenda" && tabOf(sp("view=week&date=20/10/2026")) === "agenda" && tabOf(sp("tab=other")) === "agenda", "anything else is the days");
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
