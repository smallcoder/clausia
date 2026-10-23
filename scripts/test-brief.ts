// Tomorrow's brief (/brief): the pure parts, no network and no database.
//   the card builder (last decision, required, key fact, the 3 missing rules, a missing field leaves its row out),
//   the Clausia line template, the WhatsApp text and link, and the 20:00 / 07:00 clock rules in Africa/Cairo at FIXED instants
//   (summer time and winter time: Egypt has both again, so a fixed +3 would pass in October and fail in December).
// Prints PASS/FAIL per check; exits 1 on any FAIL.
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-brief.ts
import { buildCard, briefLine, keyFact, lastDecision, linePlain, missingFor, nMissing, whatsappText, whatsappUrl, type BriefInput, type PrevHearing } from "../src/lib/brief/build";
import { dateParam } from "../src/lib/brief/load";
import { BRIEF_HOUR, REMIND_HOUR, briefDay, briefReady, cairoClock, cairoInstant, reminderDue, remindInstant } from "../src/lib/brief/time";
import type { HearingWithCase } from "../src/lib/hearings";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  (${detail})` : ""}`);
}
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ---------- fixtures ----------
function hearing(o: { id?: string; court?: string | null; circuit?: string | null; client?: string | null; title?: string | null; purpose?: string | null; location?: string | null; number?: string | null; prevId?: string | null } = {}): HearingWithCase {
  return {
    id: o.id ?? "h1", case_id: `c-${o.id ?? "h1"}`, hearing_date: "2026-10-23", purpose: o.purpose ?? null, location: o.location ?? null,
    decision_type: null, decision_text: null, next_requirements: null, previous_hearing_id: o.prevId ?? null, next_hearing_id: null,
    review_status: "confirmed", created_by_kind: "lawyer", source_kind: "manual", source_page: null, source_document_id: null, source_quote: null,
    source_char_start: null, source_char_end: null, decision_source_kind: null, decision_source_document_id: null, decision_source_page: null,
    decision_source_quote: null, decision_source_char_start: null, decision_source_char_end: null, next_date: null,
    case: { id: `c-${o.id ?? "h1"}`, case_number: o.number ?? "8833", case_year: 2024, title: o.title === undefined ? "صحة ونفاذ عقد بيع" : o.title, court: o.court === undefined ? "محكمة استئناف القاهرة" : o.court,
      circuit: o.circuit === undefined ? "الدائرة 7 مدني" : o.circuit, client_role: null, status: "active", client_name: o.client === undefined ? "كريم المثالي" : o.client, case_type: null, opponent: null },
  };
}
const prev = (o: Partial<PrevHearing> = {}): PrevHearing => ({ id: "p1", hearing_date: "2026-10-20", decision_type: "postponed", decision_text: "للاطلاع والمذكرات", next_requirements: "مذكرة الدفاع", ...o });
const input = (o: Partial<BriefInput> = {}): BriefInput => ({ hearing: hearing(), prev: prev(), facts: [], docTypes: [], ...o });
const fact = (text: string, fact_date: string | null, created_at = "2026-01-01T00:00:00Z", sort_order: number | null = null) => ({ text, fact_date, sort_order, created_at });

// ---------- the card: the mockup's first card ----------
{
  const c = buildCard(input({ facts: [fact("البيع تم بعقد عرفي 3/2/2021، والبائع أقر بالتوقيع", "2021-02-03")], docTypes: ["claim_sheet"] }));
  eq("card: circuit number", c.circuit, "7");
  eq("card: meta = court (no location on file)", c.meta, "محكمة استئناف القاهرة");
  eq("card: title = client — subject", c.title, "كريم المثالي — صحة ونفاذ عقد بيع");
  eq("card: last decision = type — text (d/m) of the PREVIOUS hearing", c.lastDecision, "تأجيل — للاطلاع والمذكرات (20/10)");
  eq("card: required = previous hearing's next_requirements", c.required, "مذكرة الدفاع");
  eq("card: key fact verbatim", c.keyFact, "البيع تم بعقد عرفي 3/2/2021، والبائع أقر بالتوقيع");
  eq("card: memo required, no memo on file → «المذكرة لسه متكتبتش»", c.missing.map((m) => m.line), ["المذكرة لسه متكتبتش"]);
  eq("card: who = client's first name", c.who, "كريم");
}
eq("who: a company keeps two words", buildCard(input({ hearing: hearing({ client: "شركة الافتراض للاستيراد" }) })).who, "شركة الافتراض");
eq("who: no client → the case number", buildCard(input({ hearing: hearing({ client: null }) })).who, "8833");
{
  const c = buildCard(input({ hearing: hearing({ location: "الدور 4 · قاعة 12" }) }));
  eq("card: meta adds the location only when it is on file", c.meta, "محكمة استئناف القاهرة · الدور 4 · قاعة 12");
}

// ---------- required: previous requirement, else this hearing's purpose, else nothing ----------
eq("required: falls back to the hearing's purpose", buildCard(input({ prev: prev({ next_requirements: null }), hearing: hearing({ purpose: "نظر الجنحة" }) })).required, "نظر الجنحة");
eq("required: previous wins over the purpose", buildCard(input({ hearing: hearing({ purpose: "نظر الجنحة" }) })).required, "مذكرة الدفاع");
eq("required: nothing on file → null", buildCard(input({ prev: null })).required, null);
eq("required: blank text counts as nothing", buildCard(input({ prev: prev({ next_requirements: "  " }) })).required, null);

// ---------- never guess: a card with nothing on file has no rows ----------
{
  const c = buildCard({ hearing: hearing({ court: null, circuit: null, client: null, title: null }), prev: null, facts: [], docTypes: [] });
  check("empty card: no last decision, required, key fact or missing", c.lastDecision === null && c.required === null && c.keyFact === null && c.missing.length === 0);
  check("empty card: no circuit number, empty meta", c.circuit === null && c.meta === "");
  eq("empty card: title falls back to the case number", c.title, "الدعوى 8833");
}
eq("circuit without a number: no big number, the text goes to the meta line", (({ circuit, meta }) => [circuit, meta])(buildCard(input({ hearing: hearing({ circuit: "الدائرة المدنية" }) }))), [null, "محكمة استئناف القاهرة · الدائرة المدنية"]);
eq("last decision: previous hearing without a decision → null", lastDecision(prev({ decision_type: null, decision_text: null })), null);
eq("last decision: no text → just the type and date", lastDecision(prev({ decision_text: null })), "تأجيل (20/10)");
eq("last decision: no previous hearing → null", lastDecision(null), null);

// ---------- key fact ----------
eq("key fact: the newest dated fact", keyFact([fact("قديمة", "2021-02-03"), fact("جديدة", "2026-01-01"), fact("وسط", "2024-05-05")]), "جديدة");
eq("key fact: undated facts come last", keyFact([fact("بلا تاريخ", null, "2026-10-01T00:00:00Z"), fact("مؤرخة", "2020-01-01")]), "مؤرخة");
eq("key fact: same date → higher sort order, then the newer row", keyFact([fact("أ", "2026-01-01", "2026-01-01T00:00:00Z", 1), fact("ب", "2026-01-01", "2026-01-01T00:00:00Z", 2)]), "ب");
eq("key fact: none → null", keyFact([]), null);

// ---------- the 3 missing rules ----------
{
  const m = (required: string | null, docTypes: BriefInput["docTypes"] = [], p: PrevHearing | null = prev()) => missingFor(input({ docTypes, prev: p }), required).map((x) => x.line);
  eq("rule 1: memo mentioned + no memo → gold line", m("مذكرة الدفاع"), ["المذكرة لسه متكتبتش"]);
  eq("rule 1: «المذكرات» (plural, article) counts as a memo", m("للاطلاع والمذكرات"), ["المذكرة لسه متكتبتش"]);
  eq("rule 1: a memo (مذكرتنا) is on the case → nothing", m("مذكرة الدفاع", ["our_memo"]), []);
  eq("rule 1: an opponent's memo is not ours → still missing", m("مذكرة الدفاع", ["opponent_memo"]), ["المذكرة لسه متكتبتش"]);
  eq("rule 2: «أصل عقد» + no contract → «الأصل مش مرفوع على الملف»", m("أصل عقد الإيجار", ["claim_sheet"]), ["الأصل مش مرفوع على الملف"]);
  eq("rule 2: the contract is on the case → nothing", m("أصل عقد الإيجار", ["contract"]), []);
  eq("rule 2: two papers named → each is named", m("أصل عقد الإيجار وإنذار التكليف", []), ["أصل العقد مش مرفوع على الملف", "أصل الإنذار مش مرفوع على الملف"]);
  eq("rule 2: no «أصل» → «<paper> مش مرفوع»", m("توكيل رسمي", []), ["التوكيل مش مرفوع على الملف"]);
  eq("rule 2: the expert's report", m("ورود تقرير الخبير", []), ["تقرير الخبير مش مرفوع على الملف"]);
  eq("rule 3: previous hearing with no decision recorded", m("متابعة", [], prev({ decision_type: null })), ["قرار الجلسة اللي فاتت لسه متسجّلش"]);
  eq("rule 3: no previous hearing → no such rule", m("متابعة", [], null), []);
  eq("nothing required → no rule 1 or 2", m(null), []);
  eq("a requirement that names nothing known → nothing missing", m("إعلان المتهم"), []);
}

// ---------- the Clausia line ----------
{
  const mk = (id: string, court: string, client: string, req: string, docTypes: BriefInput["docTypes"] = []) =>
    buildCard({ hearing: hearing({ id, court, client, number: id }), prev: prev({ next_requirements: req }), facts: [], docTypes });
  const three = [
    mk("a", "محكمة استئناف القاهرة", "كريم المثالي", "مذكرة الدفاع"),
    mk("b", "محكمة الجيزة الابتدائية", "منى الافتراضية", "متابعة تقرير الخبير", ["expert_report"]),
    mk("c", "شمال القاهرة الابتدائية", "عادل النموذجي", "أصل عقد الإيجار"),
  ];
  const line = briefLine(three, "بكرة");
  eq("line: count, courts, missing in gold (the mockup's sentence, without the time)", linePlain(line.long), "بكرة 3 جلسات في 3 محاكم. حاجتين ناقصين: المذكرة في قضية كريم، وأصل العقد في قضية عادل.");
  eq("line: the missing count is the gold piece", line.long.filter((p) => p.gold).map((p) => p.text), ["حاجتين ناقصين"]);
  eq("line: phone sentence is shorter", linePlain(line.short), "3 جلسات. حاجتين ناقصين: المذكرة، وأصل العقد.");
  check("line: no time is invented (hearings have no time field)", !/الصبح|الساعة/.test(linePlain(line.long)));
  eq("line: one court is named", linePlain(briefLine([three[0]], "بكرة").long), "بكرة جلسة واحدة في محكمة استئناف القاهرة. حاجة ناقصة: المذكرة في قضية كريم.");
  eq("line: nothing missing", linePlain(briefLine([three[1]], "بكرة").long), "بكرة جلسة واحدة في محكمة الجيزة الابتدائية. مالقيتش نواقص في الملفات.");
  eq("line: a later day says so first", linePlain(briefLine([three[1]], "يوم الأحد", "بكرة").long).startsWith("مفيش جلسات بكرة. يوم الأحد جلسة واحدة"), true);
  eq("line: empty", linePlain(briefLine([], "بكرة").long), "مفيش جلسات بكرة، ولا في الأسبوع الجاي.");
  eq("count words", [1, 2, 3, 10, 11].map(nMissing), ["حاجة ناقصة", "حاجتين ناقصين", "3 حاجات ناقصة", "10 حاجات ناقصة", "11 حاجة ناقصة"]);

  // ---------- WhatsApp ----------
  const text = whatsappText(three, "تحضير جلسات بكرة (الجمعة 23 أكتوبر)");
  check("whatsapp: heading first, one numbered block per hearing", text.startsWith("تحضير جلسات بكرة (الجمعة 23 أكتوبر)\n\n1) ") && /\n\n2\) /.test(text) && /\n\n3\) /.test(text));
  check("whatsapp: a missing row appears as «ناقص: …»", text.includes("ناقص: المذكرة لسه متكتبتش") && text.includes("ناقص: الأصل مش مرفوع على الملف"));
  check("whatsapp: only what is on file (no empty «أهم واقعة:» row)", !text.includes("أهم واقعة:"));
  const url = whatsappUrl(text);
  check("whatsapp: a wa.me share link (draft only, it sends nothing)", url.startsWith("https://wa.me/?text=") && decodeURIComponent(url.slice("https://wa.me/?text=".length)) === text);
  check("whatsapp: the link has no raw newline or space", !/[\s]/.test(url));
}

// ---------- ?date= ----------
eq("date param: ISO", dateParam("2026-10-23"), "2026-10-23");
eq("date param: d/m/yyyy (as the roll writes it)", dateParam("23/10/2026"), "2026-10-23");
eq("date param: junk / month precision / empty → null", [dateParam("x"), dateParam("10/2026"), dateParam(""), dateParam(undefined), dateParam("2026-13-40")], [null, null, null, null, null]);

// ---------- the clock: Africa/Cairo, fixed instants ----------
const at = (s: string) => new Date(s);
eq("constants", [BRIEF_HOUR, REMIND_HOUR], [20, 7]);
// summer time (UTC+3): 20:00 Cairo = 17:00Z
check("summer: 19:59 Cairo → not ready", !briefReady(at("2026-10-22T16:59:00Z")));
check("summer: 20:00 Cairo → ready", briefReady(at("2026-10-22T17:00:00Z")));
// winter time (UTC+2): 20:00 Cairo = 18:00Z
check("winter: 19:59 Cairo → not ready", !briefReady(at("2026-12-10T17:59:00Z")));
check("winter: 20:00 Cairo → ready", briefReady(at("2026-12-10T18:00:00Z")));
check("23:59 Cairo → still ready", briefReady(at("2026-10-22T20:59:00Z")));
check("00:00 Cairo (the new day) → the evening brief is over", !briefReady(at("2026-10-22T21:00:00Z")));
eq("cairo clock at 00:30 reads hour 0, not 24", cairoClock(at("2026-10-22T21:30:00Z")), { date: "2026-10-23", hour: 0, minute: 30 });
eq("brief day at 20:00 = tomorrow in Cairo", briefDay(at("2026-10-22T17:00:00Z")), "2026-10-23");
eq("brief day across the UTC date line (Cairo is already the next day)", briefDay(at("2026-10-22T22:30:00Z")), "2026-10-24");
eq("brief day over a month end", briefDay(at("2026-10-31T18:00:00Z")), "2026-11-01");
eq("07:00 Cairo in summer = 04:00Z", remindInstant("2026-10-23").toISOString(), "2026-10-23T04:00:00.000Z");
eq("07:00 Cairo in winter = 05:00Z", remindInstant("2026-12-11").toISOString(), "2026-12-11T05:00:00.000Z");
eq("07:00 Cairo after summer time ends (Fri 30/10/2026 is already winter) = 05:00Z", remindInstant("2026-10-31").toISOString(), "2026-10-31T05:00:00.000Z");
eq("07:00 Cairo before summer time starts (April) = 05:00Z, after it = 04:00Z", [remindInstant("2026-04-20").toISOString(), remindInstant("2026-05-01").toISOString()], ["2026-04-20T05:00:00.000Z", "2026-05-01T04:00:00.000Z"]);
eq("cairoInstant round-trips to the same wall clock", cairoClock(cairoInstant("2026-10-23", 7, 5)), { date: "2026-10-23", hour: 7, minute: 5 });
{
  const when = remindInstant("2026-10-23"); // 04:00Z
  check("reminder: 1 minute before 07:00 → not due", !reminderDue(when, new Date(when.getTime() - 60_000)));
  check("reminder: at 07:00 → due", reminderDue(when, when));
  check("reminder: 3 hours later → still due (shown until opened)", reminderDue(when.toISOString(), new Date(when.getTime() + 3 * 3_600_000)));
  check("reminder: a day old → stale, not shown as news", !reminderDue(when, new Date(when.getTime() + 25 * 3_600_000)));
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
