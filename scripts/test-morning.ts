// Home's chat side, pure parts (no server, no database, no model): the morning brief, the line under it, the date-conflict rule,
// the ignore filter and the chips. The cache and its isolation are in test-rls.ts (they need two real lawyers).
// Run: npx tsx scripts/test-morning.ts        Prints PASS/FAIL per check; exits 1 on any FAIL.
import { cairoInstant } from "../src/lib/brief/time";
import type { HearingWithCase } from "../src/lib/hearings";
import { addDaysIso, formatDmy } from "../src/lib/dates";
import { buildMorning, builtLine, clockHm, clockStamp, FROM_CHAT, FROM_MANUAL, nCases, nNewDocs, QUIET, sentenceText, type NewDoc } from "../src/lib/morning/build";
import { buildChips, GENERIC_CHIPS } from "../src/lib/morning/chips";
import { conflictNotice, dateConflicts, dateFreeKey, dismissalId, hearingNotice, MAX_NOTICES, MIN_KEY, noticedHeading, pickNotices, type NoticeFact } from "../src/lib/morning/notices";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  (${detail})` : ""}`);
}

const TODAY = "2026-10-23";
const NOW = cairoInstant(TODAY, 7, 40);

// ---------- fixtures ----------
let n = 0;
function hearing(o: Partial<HearingWithCase> & { hearing_date: string }): HearingWithCase {
  n++;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, case_id: `c-${n}`, purpose: null, location: null, decision_type: null, decision_text: null,
    next_requirements: null, previous_hearing_id: null, next_hearing_id: null, review_status: "confirmed", created_by_kind: "lawyer",
    source_kind: "manual", source_page: null, source_document_id: null, source_quote: null, source_char_start: null, source_char_end: null,
    decision_source_kind: null, decision_source_document_id: null, decision_source_page: null, decision_source_quote: null,
    decision_source_char_start: null, decision_source_char_end: null,
    case: { id: `c-${n}`, case_number: String(1000 + n), case_year: 2026, title: "إخلاء", court: "محكمة شمال القاهرة الابتدائية", circuit: "الدائرة 3", client_role: null, status: "active", client_name: `موكل ${n}`, case_type: null },
    next_date: null, ...o,
  } as HearingWithCase;
}
const names = new Map([["doc-1", "صحيفة افتتاح دعوى"]]);
const input = (hearings: HearingWithCase[], docs: NewDoc[] = []) => buildMorning({ today: TODAY, now: NOW, hearings, docNames: names, docs });
const newDoc = (i: number): NewDoc => ({ id: `d-${i}`, name: `ورقة ${i}`, caseId: `c-${i}`, caseWho: `موكل ${i}` });
const DATE_LIKE = /\d{1,2}\/\d{1,2}\/\d{4}/g;

// ---------- the brief: no fact without a source ----------
{
  const paper = hearing({ hearing_date: "2026-10-24", source_kind: "document", source_document_id: "doc-1", source_page: 3, source_quote: "تحدد لنظر الدعوى جلسة 24/10/2026", source_char_start: 10, source_char_end: 40 });
  const chat = hearing({ hearing_date: "2026-10-25", source_kind: "chat", source_quote: "الجلسة يوم 25/10" });
  const manual = hearing({ hearing_date: "2026-10-26" });
  const b = input([paper, chat, manual]);
  check("the brief names at most 2 hearings", b.sentences.filter((s) => /عندك جلسة/.test(sentenceText(s))).length === 2);
  const p = b.sentences[0].sources[0];
  check("a paper hearing → a paper chip with doc + page + span", p.kind === "paper" && p.cite.documentId === "doc-1" && p.cite.page === 3 && p.cite.start === 10 && p.cite.end === 40 && p.cite.label === "صحيفة افتتاح دعوى · ص 3");
  const c = b.sentences[1].sources[0];
  check("a hearing from the lawyer's message → «من رسالتك»", c.kind === "chat" && c.label === FROM_CHAT);
  const m = input([manual]).sentences[0].sources[0];
  check("a hearing the lawyer typed in → «إدخال يدوي»", m.kind === "manual" && m.label === FROM_MANUAL);

  const noDoc = hearing({ hearing_date: "2026-10-24", source_kind: "document", source_document_id: null });
  const odd = hearing({ hearing_date: "2026-10-24", source_kind: null as never });
  const dropped = input([noDoc, odd]);
  check("a hearing with no nameable source is left out (and the brief is then empty)", dropped.empty && dropped.sentences.length === 0);
  const mixed = input([noDoc, manual]);
  check("…and the next one that has a source takes its place", mixed.sentences.length === 1 && sentenceText(mixed.sentences[0]).includes(formatDmy("2026-10-26")));

  const many = input(Array.from({ length: 5 }, (_, i) => hearing({ hearing_date: addDaysIso(TODAY, i) })), Array.from({ length: 5 }, (_, i) => newDoc(i)));
  check("every sentence has at least one source (5 hearings + 5 papers)", many.sentences.every((s) => s.sources.length >= 1));
  check("1–3 sentences however much there is", many.sentences.length === 3, `${many.sentences.length}`);
  check("every new-paper chip is the paper itself at page 1", many.sentences[2].sources.every((s) => s.kind === "paper" && s.cite.page === 1 && s.cite.documentId.startsWith("d-")));
  check("at most 2 papers are named", many.sentences[2].sources.length === 2);
}

// ---------- dates verbatim ----------
{
  const h = [hearing({ hearing_date: "2026-10-25", purpose: "للاطلاع والمذكرات" }), hearing({ hearing_date: "2026-11-03" })]; // the second is out of the week
  const b = input(h);
  const text = b.sentences.map(sentenceText).join(" ");
  check("the date is the row's, written d/m/yyyy (25/10/2026)", text.includes("25/10/2026"));
  check("no other date-like text appears", (text.match(DATE_LIKE) ?? []).join() === "25/10/2026", (text.match(DATE_LIKE) ?? []).join());
  check("a hearing past the 7-day window is not said", !text.includes("3/11/2026") && b.sentences.length === 1);
  check("the purpose is the row's own words", text.includes("المطلوب: للاطلاع والمذكرات"));
  const edge = input([hearing({ hearing_date: addDaysIso(TODAY, 6) }), hearing({ hearing_date: addDaysIso(TODAY, 7) }), hearing({ hearing_date: "2026-10-22" })]);
  check("the window is today … today+6 (yesterday and +7 are out)", edge.sentences.length === 1 && sentenceText(edge.sentences[0]).includes(formatDmy(addDaysIso(TODAY, 6))));
  const sugg = input([hearing({ hearing_date: "2026-10-24", review_status: "suggested" })]);
  check("a hearing nobody confirmed is not stated as a fact", sugg.empty);
  const today = input([hearing({ hearing_date: TODAY })]);
  check("today's hearing: «النهارده» and its date", sentenceText(today.sentences[0]).startsWith("النهارده (23/10/2026)"));
}

// ---------- the empty state and the line ----------
{
  const e = input([]);
  check("nothing to say → no sentences, flagged empty", e.empty && e.sentences.length === 0);
  check("…and the short line is the one in the spec", QUIET === "مفيش حاجة مستعجلة النهارده.");
  check("…and no «built from» line (kept short)", builtLine(e) === null);

  const b = { ...input([hearing({ hearing_date: "2026-10-24" })]), cases: 3, newDocs: 4 };
  check("the line: «اتعمل من 3 قضايا و4 أوراق جديدة · 07:40» (Cairo time)", builtLine(b) === "اتعمل من 3 قضايا و4 أوراق جديدة · 07:40", String(builtLine(b)));
  check("the line counts the cases and the new papers of the input", (() => {
    const r = input([hearing({ hearing_date: "2026-10-24" }), hearing({ hearing_date: "2026-10-25" })], [newDoc(7), newDoc(8), newDoc(9)]);
    return r.cases === 5 && r.newDocs === 3;
  })());
  check("two hearings of the same case count as one case", (() => {
    const a = hearing({ hearing_date: "2026-10-24" });
    const c = hearing({ hearing_date: "2026-10-25", case_id: a.case_id });
    return input([a, c]).cases === 1;
  })());
  check("no new papers → no «ورق جديد» part", builtLine({ ...b, newDocs: 0 }) === "اتعمل من 3 قضايا · 07:40");
  check("counting words: 1 / 2 / 5 / 12", nCases(1) === "قضية واحدة" && nCases(2) === "قضيتين" && nCases(5) === "5 قضايا" && nCases(12) === "12 قضية" && nNewDocs(1) === "ورقة جديدة" && nNewDocs(2) === "ورقتين جديدتين" && nNewDocs(12) === "12 ورقة جديدة");
  check("the stamp: 7:40 ص, and 19:05 → 7:05 م", clockStamp(NOW.toISOString()) === "7:40 ص" && clockStamp(cairoInstant(TODAY, 19, 5).toISOString()) === "7:05 م" && clockHm(cairoInstant(TODAY, 0, 5).toISOString()) === "00:05");
}

// ---------- the conflict rule ----------
const fact = (o: Partial<NoticeFact> & { id: string }): NoticeFact => ({
  case_id: "case-A", text: "أنذر المستأجر على يد محضر بسداد المتأخر خلال خمسة عشر يومًا", fact_date: "2026-03-15", date_precision: "day", date_text: null,
  source_document_id: "doc-A", source_page: 2, source_quote: null, source_char_start: null, source_char_end: null, created_at: "2026-10-20T10:00:00Z", ...o,
});
{
  const a = fact({ id: "f1", text: "أنذر المستأجر بتاريخ 15/3/2026 على يد محضر بسداد المتأخر", fact_date: "2026-03-15", source_document_id: "doc-A" });
  const b = fact({ id: "f2", text: "أنذر المستأجر بتاريخ 15/4/2026 على يد محضر بسداد المتأخر", fact_date: "2026-04-15", source_document_id: "doc-B" });
  const r = dateConflicts([a, b]);
  check("conflict: same event, two papers, two dates → one card", r.length === 1 && r[0].key === "f1:f2");
  check("the key is the sorted pair of fact ids", dateConflicts([b, a])[0].key === "f1:f2");
  check("a date written in words doesn't hide the match («15 مارس 2026» vs «15 أبريل 2026»)", dateConflicts([
    fact({ id: "g1", text: "أنذر المستأجر في 15 مارس 2026 على يد محضر بسداد المتأخر", source_document_id: "doc-A" }),
    fact({ id: "g2", text: "أنذر المستأجر في 15 أبريل 2026 على يد محضر بسداد المتأخر", fact_date: "2026-04-15", source_document_id: "doc-B" }),
  ]).length === 1);
  check("the fact's own date_text is taken out too", dateConflicts([
    fact({ id: "h1", text: "حرر الموكل عقد الإيجار في أول سبتمبر الماضي للشقة رقم 12", date_text: "أول سبتمبر الماضي", source_document_id: "doc-A" }),
    fact({ id: "h2", text: "حرر الموكل عقد الإيجار في تاريخ مختلف للشقة رقم 12", date_text: "تاريخ مختلف", fact_date: "2022-08-01", source_document_id: "doc-B" }),
  ]).length === 1);
  check("Arabic-Indic digits and hamza forms don't matter", dateKeyEq("أنذر المستأجر بتاريخ ١٥/٣/٢٠٢٦ على يد محضر", "انذر المستأجر بتاريخ 15/4/2026 علي يد محضر"));

  check("different events do not match", dateConflicts([a, fact({ id: "f3", text: "امتنع المستأجر عن سداد الأجرة الشهرية اعتبارًا من يناير", fact_date: "2026-01-01", source_document_id: "doc-B" })]).length === 0);
  check("same paper twice does not match", dateConflicts([a, { ...b, source_document_id: "doc-A" }]).length === 0);
  check("same date does not match", dateConflicts([a, { ...b, fact_date: "2026-03-15" }]).length === 0);
  check("a different case does not match", dateConflicts([a, { ...b, case_id: "case-B" }]).length === 0);
  check("a fact with no paper does not match", dateConflicts([a, { ...b, source_document_id: null }]).length === 0);
  check("a month-only date does not match", dateConflicts([a, { ...b, date_precision: "month" }]).length === 0);
  check("a very short text does not match", dateConflicts([fact({ id: "s1", text: "حضور المدعى 3/3/2026", source_document_id: "doc-A" }), fact({ id: "s2", text: "حضور المدعى 4/4/2026", fact_date: "2026-04-04", source_document_id: "doc-B" })]).length === 0 && dateFreeKey("حضور المدعى 3/3/2026").length < MIN_KEY);
  check("three papers, one case → still one card", dateConflicts([a, b, fact({ id: "f9", text: a.text, fact_date: "2026-05-15", source_document_id: "doc-C", created_at: "2026-10-22T10:00:00Z" })]).length === 1);

  const card = conflictNotice(r[0], "موكل — إخلاء", new Map([["doc-A", "الصحيفة"], ["doc-B", "الإنذار"]]));
  check("the card: both dates verbatim (d/m/yyyy), both papers, one chip each", card.text.includes("15/3/2026 في الصحيفة") && card.text.includes("15/4/2026 في الإنذار") && card.sources.length === 2 && card.sources.every((s) => s.kind === "paper"));
}
function dateKeyEq(x: string, y: string) { return dateFreeKey(x) === dateFreeKey(y); }

// ---------- ignore: per lawyer ----------
{
  const hs = [hearing({ hearing_date: "2026-10-10" }), hearing({ hearing_date: "2026-10-11" }), hearing({ hearing_date: "2026-10-12" })].map((h) => hearingNotice(h, new Map()));
  const aDismissed = new Set([dismissalId("hearing_decision", hs[0].key)]);
  const forA = pickNotices([], hs, aDismissed);
  const forB = pickNotices([], hs, new Set());
  check("a dismissed card is gone for the lawyer who dismissed it", !forA.some((x) => x.key === hs[0].key) && forA.length === 2);
  check("another lawyer (their own empty set) still sees it", forB.some((x) => x.key === hs[0].key) && forB.length === 3);
  check("a dismissal of the same key under another kind does not hide it", pickNotices([], hs, new Set([dismissalId("date_conflict", hs[0].key)])).length === 3);
  const many = Array.from({ length: 6 }, (_, i) => hearingNotice(hearing({ hearing_date: `2026-10-0${i + 1}` }), new Map()));
  check(`at most ${MAX_NOTICES} cards at once`, pickNotices([], many, new Set()).length === MAX_NOTICES);
  check("a dismissed one lets the next one in", pickNotices([], many, new Set([dismissalId("hearing_decision", many[0].key)])).map((x) => x.key).join() === [many[1], many[2], many[3]].map((x) => x.key).join());
  const c = conflictNotice({ key: "x:y", caseId: "case-A", a: fact({ id: "x" }), b: fact({ id: "y", fact_date: "2026-04-15", source_document_id: "doc-B" }) }, "t", new Map());
  check("conflicts come before undecided hearings", pickNotices([c], many, new Set())[0].kind === "date_conflict");
  check("the hearing card says which hearing, with its date verbatim", hs[0].text === "جلسة 10/10/2026 فاتت من غير قرار.");
  check("the hearing card carries its source (manual here)", hs[0].source?.kind === "manual");
  check("the heading counts the cards", noticedHeading(1) === "لاحظت حاجة" && noticedHeading(2) === "لاحظت حاجتين" && noticedHeading(3) === "لاحظت 3 حاجات");
}

// ---------- chips ----------
{
  const u = hearing({ hearing_date: "2026-10-12" });
  const nx = hearing({ hearing_date: "2026-10-24" });
  const full = buildChips({ undecided: u, next: nx, nextMissingPaper: true });
  check("chips from the lawyer's cases: decision, next requirement, missing paper", full.length === 3);
  check("«سجّل قرار جلسة <case> <d/m>»", full[0].label === `سجّل قرار جلسة موكل 12/10`, full[0].label);
  check("«إيه المطلوب في <case> الجلسة الجاية؟»", full[1].label === "إيه المطلوب في موكل الجلسة الجاية؟", full[1].label);
  check("«ارفع ورقة لقضية <case>»", full[2].label === "ارفع ورقة لقضية موكل", full[2].label);
  check("a chip fills the composer (its text is not empty and is not a sent message): text ends where the lawyer continues", full[0].text.endsWith(": "));
  const none = buildChips({ undecided: null, next: null, nextMissingPaper: false });
  check("nothing in the cases → the generic chips (2)", none.length === 2 && none.every((c) => GENERIC_CHIPS.some((g) => g.label === c.label)));
  const one = buildChips({ undecided: u, next: null, nextMissingPaper: false });
  check("one chip from the cases + one generic = 2", one.length === 2 && one[0].label.startsWith("سجّل قرار جلسة") && GENERIC_CHIPS.some((g) => g.label === one[1].label));
  check("never more than 3", buildChips({ undecided: u, next: nx, nextMissingPaper: true }).length <= 3);
  const numbered = buildChips({ undecided: null, next: hearing({ hearing_date: "2026-10-24", case: { ...nx.case, client_name: null, case_number: "772" } }), nextMissingPaper: false });
  check("a case with no client is named by its number", numbered[0].label === "إيه المطلوب في قضية 772 الجلسة الجاية؟", numbered[0].label);
}

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
