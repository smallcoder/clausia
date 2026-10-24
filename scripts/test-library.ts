// PR 6 (المكتبة): unit tests with a FAKE Db (nothing is sent anywhere, nothing is written), plus a live READ-ONLY look at the base templates and a real fill through RLS.
//  (a) the fill card: every filled value carries its source, the missing ones are listed with the reason, the legal grounds / requests are NEVER filled unless asked
//  (b) the never-guess rule: a missing court / year / date stays empty; two judgments are not picked between; a suggested item is not used; an appeal's own court is not the first instance court
//  (c) the guards: «did the lawyer ask for the grounds», «no number of the model's own in a drafted text»
//  (d) prepareDraft / applyOp("create_draft") with a fake Db: what the card shows, what is written, the undo, an unreadable template or case refused
//  (e) live, read-only: the 6 base templates through RLS (shape, known placeholders, empty lawyer sections, marked for review) and a real fill of a demo case
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-library.ts
import { createClient } from "@supabase/supabase-js";
import type { CaseFile } from "@/lib/case-file";
import { fillTemplate, FIELD_LABEL, MANUAL_LABEL, needsFromLawyer, PLACEHOLDER } from "@/lib/library/fill";
import { askedForLegalText, numbersNotIn } from "@/lib/library/guards";
import { buildDraft, draftFromCall, fileTexts, prepareDraft, recentLawyerTexts, TemplateBodySchema } from "@/lib/library/make";
import type { TemplateBody } from "@/lib/library/types";
import type { Db } from "@/lib/supabase/server";
import { applyOp, MANUAL } from "@/lib/tools/apply";
import { READ_TOOL_SPECS } from "@/lib/tools/read";
import { INTERNAL_TOOLS, WRITE_TOOL_ARGS, writeToolSpecs } from "@/lib/tools/registry";

let fails = 0;
const check = (ok: boolean, what: string, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`); if (!ok) fails++; };
const eq = (got: unknown, want: unknown, what: string) => check(JSON.stringify(got) === JSON.stringify(want), what, `got ${JSON.stringify(got)}${JSON.stringify(got) === JSON.stringify(want) ? "" : `, want ${JSON.stringify(want)}`}`);
const rejects = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e instanceof Error ? e.message : String(e); } };

// ---------------------------------------------------------------- fixtures
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CASE = U(2), CLIENT = U(1), TPL = U(10), DOC = U(20);
const prov = (kind: "chat" | "document" | "manual" = "chat", extra: Partial<{ document_id: string; page: number }> = {}) => ({
  review_status: "confirmed" as const, created_by: "lawyer" as const,
  source: { kind, message_id: null, document_id: extra.document_id ?? null, page: extra.page ?? null, quote: null, char_start: null, char_end: null },
});

function cf(over: Partial<Omit<CaseFile, "case">> & { case?: Partial<CaseFile["case"]> } = {}): CaseFile {
  const { case: caseOver, ...rest } = over;
  return {
    schema_version: 1, generated_at: "2026-10-26T00:00:00Z",
    case: {
      id: CASE, label: "الدعوى رقم 8833 لسنة 2024", title: "صحة ونفاذ عقد بيع", case_number: "8833", case_year: 2024, court: "شمال القاهرة الابتدائية", circuit: "الدائرة 7 مدني",
      case_type: "مدني", stage: "first_instance", status: "judged", client_role: "plaintiff", summary: null, facts_date: null, facts_date_precision: "unknown",
      previous_stage_case: null, later_stage_cases: [], ...prov(), ...(caseOver ?? {}),
    },
    client: { id: CLIENT, name: "كريم المثالي", kind: "person", phone: null },
    parties: [
      { id: U(31), name: "كريم المثالي", role: "plaintiff", is_our_client: true, representative: null, notes: null, ...prov("document", { document_id: DOC, page: 1 }) },
      { id: U(32), name: "وليد التجريبي", role: "defendant", is_our_client: false, representative: null, notes: null, ...prov() },
    ],
    facts: [{ id: U(41), date: "2022-09-01", date_precision: "day", date_text: null, text: "حرر الطرفان عقد بيع الشقة.", ...prov() }],
    requests: [{ id: U(51), text: "صحة ونفاذ العقد", kind: null, ...prov() }],
    arguments: [], hearings: [],
    judgments: [{ id: U(61), date: "2026-09-29", kind: "final", operative_text: "حكمت المحكمة برفض الدعوى.", outcome: "against_us", appeal_deadline: null, appeal_deadline_note: null, hearing_id: null, ...prov("document", { document_id: DOC, page: 3 }) }],
    documents: [{ id: DOC, file_name: "الحكم.pdf", doc_type: "judgment", title: null, doc_date: null, page_count: 4, read_status: "done", review_status: "confirmed", pages: [] }],
    pending_suggestions: [],
    ...rest,
  };
}

const body = (blocks: TemplateBody["blocks"], more: Partial<TemplateBody> = {}): TemplateBody => ({ version: 1, blocks, ...more });
const p = (text: string) => ({ t: "p" as const, text });
const GROUNDS = { t: "lawyer" as const, key: "grounds", heading: "أسباب الاستئناف", hint: "يكتبها المحامي" };
const REQUESTS = { t: "lawyer" as const, key: "requests", heading: "الطلبات" };
const APPEAL: TemplateBody = body([
  { t: "title", text: "صحيفة استئناف" }, p("محكمة الاستئناف: {{court}}"), p("الدائرة: {{circuit}}"), p("رقم الاستئناف: {{case_number}}"),
  p("الدعوى المستأنف حكمها: {{appealed_case}}"), p("تاريخ الحكم: {{judgment_date}}"), p("منطوق الحكم: {{judgment_text}}"),
  p("المستأنف: {{our_parties}}"), p("المستأنف ضده: {{opponents}}"), p("{{facts_summary}}"), GROUNDS, REQUESTS, p("وكيل المستأنف: {{lawyer_name}}"),
], { manual: [{ key: "lawyer_name", label: "اسم المحامي" }], for_stage: "appeal" });
const MEMO: TemplateBody = body([
  p("المحكمة: {{court}}"), p("الدائرة: {{circuit}}"), p("في الدعوى رقم: {{case_number}}"), p("لجلسة: {{next_hearing}}"), p("مقدمة من: {{our_parties}}"), p("ضد: {{opponents}}"),
  p("{{facts_summary}}"), GROUNDS, REQUESTS,
]);
const get = (r: ReturnType<typeof fillTemplate>, key: string) => r.fill.filled.find((f) => f.key === key);
const miss = (r: ReturnType<typeof fillTemplate>, key: string) => r.fill.missing.find((f) => f.key === key);
const text = (r: ReturnType<typeof fillTemplate>) => r.body.blocks.map((b) => (b.t === "lawyer" ? `${b.heading}\n${b.text}` : b.text)).join("\n");

// ---------------------------------------------------------------- (a) the fill card
console.log("\n-- (a) the fill: sources, what is missing, the grounds and the requests --");
{
  const r = fillTemplate(MEMO, cf(), { today: "2026-10-26" });
  eq([get(r, "court")?.value, get(r, "court")?.source], ["شمال القاهرة الابتدائية", "بيانات الدعوى · المحكمة"], "the court is filled from the case, and says it came from the case's court field");
  eq(get(r, "circuit")?.value, "الدائرة 7 مدني", "the circuit is filled");
  eq([get(r, "case_number")?.value, get(r, "case_number")?.source], ["8833 لسنة 2024", "بيانات الدعوى · الرقم والسنة"], "the number is «8833 لسنة 2024» (number AND year)");
  eq([get(r, "our_parties")?.value, get(r, "our_parties")?.source], ["كريم المثالي", "حكم · ص 1"], "our party is filled, from the paper and page it was read from (a document-sourced row says «حكم · ص 1»)");
  eq([get(r, "opponents")?.value, get(r, "opponents")?.source], ["وليد التجريبي", "الأطراف في الملف"], "the opponent is filled, from the file's parties");
  eq(get(r, "facts_summary")?.value, "1/9/2022: حرر الطرفان عقد بيع الشقة.", "with no summary, the CONFIRMED facts are listed as the file has them (date: text), nothing reworded");
  eq(get(r, "facts_summary")?.source, "الوقائع المؤكدة في الملف (1)", "…and the source says they are the file's confirmed facts");
  check(r.fill.filled.every((f) => f.source.length > 2 && f.value.length > 0), "EVERY filled value carries a source");
  eq(r.fill.filled.map((f) => f.key), ["court", "circuit", "case_number", "our_parties", "opponents", "facts_summary"], "each key is filled once, in the order the template uses them");
  eq(r.fill.missing.map((m) => m.key), ["next_hearing"], "the only missing value is the next hearing (the file has none)");
  eq(miss(r, "next_hearing")?.reason, "مفيش جلسة قادمة متسجلة", "…with its reason");
  check(text(r).includes("{{next_hearing}}"), "a missing value stays as {{next_hearing}} in the body (the view shows a blank, Word a dotted line)");
  check(!text(r).includes("{{court}}") && text(r).includes("المحكمة: شمال القاهرة الابتدائية"), "a filled value replaces its placeholder in the text");
}
{
  // the grounds and the requests
  const r = fillTemplate(MEMO, cf());
  const g = r.body.blocks.find((b) => b.t === "lawyer" && b.key === "grounds");
  const q = r.body.blocks.find((b) => b.t === "lawyer" && b.key === "requests");
  eq([g?.t === "lawyer" && g.text, g?.t === "lawyer" && g.state], ["", "empty"], "the legal grounds are EMPTY (state empty) when nobody asked");
  eq([q?.t === "lawyer" && q.text, q?.t === "lawyer" && q.state], ["", "empty"], "the requests are EMPTY when nobody asked, even though the file HAS a request («صحة ونفاذ العقد»)");
  check(!text(r).includes("صحة ونفاذ العقد") && !text(r).includes("رفض الدعوى"), "nothing from the file's requests or from the judgment leaks into the grounds or the requests");
  eq(r.fill.lawyer, [{ key: "grounds", heading: "أسباب الاستئناف", state: "empty" }, { key: "requests", heading: "الطلبات", state: "empty" }], "both sections are listed as «needs the lawyer»");
  eq(needsFromLawyer(r.fill), ["الجلسة القادمة", "أسباب الاستئناف", "الطلبات"], "the «محتاجة منك» list: missing values first, then the sections only he writes");
  const asked = fillTemplate(MEMO, cf(), { grounds: "الدفع بعدم قبول الدعوى لرفعها على غير ذي صفة." });
  const g2 = asked.body.blocks.find((b) => b.t === "lawyer" && b.key === "grounds");
  eq([g2?.t === "lawyer" && g2.text, g2?.t === "lawyer" && g2.state], ["الدفع بعدم قبول الدعوى لرفعها على غير ذي صفة.", "needs_confirmation"], "drafted grounds (the lawyer asked) are kept and marked «needs_confirmation»");
  eq(asked.fill.lawyer.map((l) => l.state), ["needs_confirmation", "empty"], "…while the requests stay empty");
  eq(needsFromLawyer(asked.fill), ["الجلسة القادمة", "الطلبات"], "drafted grounds are not in the «still empty» list (they are in the confirm list)");
  const blank = fillTemplate(MEMO, cf(), { grounds: "   ", requests: "" });
  eq(blank.fill.lawyer.map((l) => l.state), ["empty", "empty"], "a blank text is not drafted text");
}

// ---------------------------------------------------------------- (b) never guess
console.log("\n-- (b) never guess --");
{
  const r = fillTemplate(MEMO, cf({ case: { court: null, circuit: "  ", case_year: null } }));
  eq([miss(r, "court")?.reason, miss(r, "circuit")?.reason, miss(r, "case_number")?.reason], ["المحكمة مش متسجلة", "الدائرة مش متسجلة", "سنة الدعوى مش متسجلة"], "no court / circuit / year in the file → empty, each with its reason (a number without its year is NOT filled)");
  check(["{{court}}", "{{circuit}}", "{{case_number}}"].every((k) => text(r).includes(k)), "…and the body keeps the blanks");
  const none = fillTemplate(MEMO, cf({ case: { case_number: null } }));
  eq(miss(none, "case_number")?.reason, "رقم الدعوى مش متسجل", "no number → empty");
  // two judgments: no pick
  const j = cf().judgments[0];
  const two = fillTemplate(APPEAL, cf({ judgments: [j, { ...j, id: U(62), date: "2026-10-01", operative_text: "حكم آخر" }] }));
  eq([miss(two, "judgment_text")?.reason, miss(two, "judgment_date")?.reason], ["فيه 2 أحكام في الملف: حدد الحكم بنفسك", "فيه 2 أحكام في الملف: حدد الحكم بنفسك"], "TWO judgments are not picked between: both judgment fields are left empty");
  const noj = fillTemplate(APPEAL, cf({ judgments: [] }));
  eq(miss(noj, "judgment_text")?.reason, "مفيش حكم متسجل في الملف", "no judgment → empty");
  const nodate = fillTemplate(APPEAL, cf({ judgments: [{ ...j, date: null }] }));
  eq([miss(nodate, "judgment_date")?.reason, get(nodate, "judgment_text")?.value], ["تاريخ الحكم مش متسجل", "حكمت المحكمة برفض الدعوى."], "a judgment with no date: the date is empty, the text is still filled");
  // a suggested item is not in the file's sections (the file keeps it apart): never used
  const sug = fillTemplate(MEMO, cf({
    parties: [cf().parties[0]],
    pending_suggestions: [{ table: "case_parties", id: U(33), text: "x", item: { ...cf().parties[1], id: U(33), review_status: "suggested" } }],
  }));
  eq([miss(sug, "opponents")?.reason], ["مفيش خصم متسجل في الملف"], "a SUGGESTED opponent (not confirmed) is not used");
  // no party of ours: the side is unknown, so who is the opponent is not guessed
  const unsure = fillTemplate(MEMO, cf({ parties: cf().parties.map((x) => ({ ...x, is_our_client: false })) }));
  eq([miss(unsure, "opponents")?.reason], ["مش واضح مين الخصم: صفة موكلنا مش متسجلة في الأطراف"], "no party marked as ours → the opponent is NOT guessed");
  eq(get(unsure, "our_parties")?.source, "الموكل في الملف", "…our party falls back to the case's own client, and says so");
  // the witness / expert are not opponents; a co-plaintiff is not an opponent
  const side = fillTemplate(MEMO, cf({ parties: [...cf().parties, { ...cf().parties[1], id: U(34), name: "الشاهد", role: "witness" }, { ...cf().parties[0], id: U(35), name: "شريك المدعي", role: "plaintiff", is_our_client: false }] }));
  eq(get(side, "opponents")?.value, "وليد التجريبي", "a witness and a co-plaintiff are not listed as opponents");
  // next hearing: only a hearing from today on, the earliest
  const h = (id: number, date: string) => ({ id: U(id), date, purpose: null, location: null, decision_type: null, decision_text: null, next_requirements: null, next_hearing_id: null, decision_source: null, ...prov() });
  const hh = fillTemplate(MEMO, cf({ hearings: [h(71, "2026-09-01"), h(72, "2026-12-05"), h(73, "2026-11-10")] }), { today: "2026-10-26" });
  eq(get(hh, "next_hearing")?.value, "10/11/2026", "the next hearing is the earliest one from today on (past ones are ignored)");
  // the manual keys are never filled
  const m = fillTemplate(APPEAL, cf());
  eq(miss(m, "lawyer_name")?.label, "اسم المحامي", "a manual placeholder (the lawyer's name) is never filled");
  const unknown = fillTemplate(body([p("{{something_new}}")]), cf());
  eq([unknown.fill.missing[0]?.key, unknown.fill.missing[0]?.reason], ["something_new", "بيان لازم تكتبه بنفسك: مش موجود في ملف القضية"], "an unknown placeholder is left empty and listed (never invented)");
  eq(MANUAL_LABEL.agent_name, "اسم الوكيل (المحامي)", "the standard manual keys have names");
}
{
  // the appeal template on a case still at the first instance: the appeal's own court / circuit / number are NOT the first-instance court's
  const r = fillTemplate(APPEAL, cf());
  eq(r.fill.filled.map((f) => f.key), ["appealed_case", "judgment_date", "judgment_text", "our_parties", "opponents", "facts_summary"], "appeal template, first-instance case: the court, circuit and number of the appeal are NOT filled");
  check(/الاستئناف.*أول درجة/.test(miss(r, "court")?.reason ?? ""), "…and the reason says the case is still at the first instance", miss(r, "court")?.reason);
  eq(get(r, "appealed_case")?.value, "8833 لسنة 2024", "the judged case is this case: its number is the appealed case");
  eq([get(r, "judgment_date")?.value, get(r, "judgment_date")?.source], ["29/9/2026", "حكم · ص 3"], "the judgment date is the judgment's date, with the paper and page it was read from");
  eq(get(r, "judgment_text")?.source, "حكم · ص 3", "the operative text names the same paper and page (the mockup's «الحكم · ص 3»)");
  // the appeal already exists (stage appeal): its own court is filled, the judgment is read from the EARLIER case's file
  const appealCase = cf({ judgments: [], case: { stage: "appeal", court: "استئناف القاهرة", circuit: "الدائرة 7", case_number: "1500", case_year: 2026, previous_stage_case: { id: U(3), label: "الدعوى رقم 8833 لسنة 2024", stage: "first_instance" } } });
  const withPrev = fillTemplate(APPEAL, appealCase, { previous: cf() });
  eq([get(withPrev, "court")?.value, get(withPrev, "case_number")?.value], ["استئناف القاهرة", "1500 لسنة 2026"], "the appeal case exists: its own court and number are filled");
  eq([get(withPrev, "appealed_case")?.value, get(withPrev, "appealed_case")?.source], ["8833 لسنة 2024", "الدعوى السابقة (أول درجة)"], "…the appealed case is the earlier one");
  eq(get(withPrev, "judgment_text")?.value, "حكمت المحكمة برفض الدعوى.", "…the judgment is read from the earlier case's file");
  const noPrev = fillTemplate(APPEAL, appealCase, { previous: null });
  check(!!miss(noPrev, "judgment_text") && /مش في ملف القضية/.test(miss(noPrev, "judgment_text")!.reason), "…and if the earlier file can not be read, the judgment is left empty", miss(noPrev, "judgment_text")?.reason);
  // a case past the stage
  const past = fillTemplate(APPEAL, cf({ case: { stage: "cassation" } }));
  check(!!miss(past, "judgment_text"), "a cassation case asked for an APPEAL template: which judgment is meant is not guessed");
  // a claim-sheet style template (no for_stage) takes the case's own court on any stage
  const any = fillTemplate(MEMO, appealCase);
  eq(get(any, "court")?.value, "استئناف القاهرة", "a template with no stage uses the case's own court");
}

// ---------------------------------------------------------------- (c) the guards
console.log("\n-- (c) the guards --");
{
  for (const yes of ["اكتبلي صحيفة استئناف لقضية كريم وضيف الأسباب", "عايز صحيفة استئناف مع اقتراح لأسباب الاستئناف", "جهزلي مذكرة واكتب الدفاع", "صيغ الطلبات"]) check(askedForLegalText([yes]), `asked: «${yes}»`);
  for (const no of ["صحيفة استئناف لقضية كريم", "عايز مذكرة بدفاع لقضية منى", "اعمل إنذار للمستأجر", "الأسباب مهمة", "كتبت الطلبات امبارح"]) check(!askedForLegalText([no]), `NOT asked: «${no}»`);
  check(askedForLegalText(["صحيفة استئناف", "اكتبلي الأسباب"]), "asked in any of the lawyer's recent messages");
  eq(numbersNotIn("الدفع بعدم القبول لانتفاء الصفة", ["x"]), [], "a text with no number is fine");
  eq(numbersNotIn("طبقا للمادة 227 من القانون", ["القضية 8833 لسنة 2024"]), ["227"], "an article number the lawyer and the file never said is caught");
  eq(numbersNotIn("الحكم الصادر في 29/9/2026 في القضية 8833", ["8833 لسنة 2024", "2026-09-29"]), [], "numbers the file has (even as an ISO date) are fine");
  eq(numbersNotIn("المادة ٢٢٧", ["227"]), [], "Arabic-Indic numerals are read as Western ones");
  eq(numbersNotIn("المادة ٢٢٧", []), ["227"], "…and caught when no one said them");
}

// ---------------------------------------------------------------- (d) prepareDraft / applyOp with a fake Db
type Rows = Record<string, Record<string, unknown>[]>;
function fakeDb(rows: Rows) {
  const writes: { op: string; table: string; payload?: Record<string, unknown> }[] = [];
  const db = {
    from(table: string) {
      const list = rows[table] ?? [];
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "in", "is", "order", "limit", "not", "or", "gte", "lte", "range"]) q[m] = () => q;
      for (const m of ["insert", "update", "delete", "upsert"]) q[m] = (payload?: Record<string, unknown>) => { writes.push({ op: m, table, payload }); return q; };
      const first = () => (writes.some((w) => w.table === table && w.op === "insert") ? { id: "new-draft-id" } : list[0] ?? null);
      q.single = async () => ({ data: first(), error: null });
      q.maybeSingle = async () => ({ data: first(), error: null });
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: writes.some((w) => w.table === table && w.op !== "select") ? [{ id: "x" }] : list, error: null }).then(res);
      return q;
    },
  };
  return { db: db as unknown as Db, writes };
}
const P = (kind = "chat") => ({ review_status: "confirmed", created_by_kind: "lawyer", source_kind: kind, source_message_id: null, source_document_id: null, source_page: null, source_quote: null, source_char_start: null, source_char_end: null });
const dbRows = (over: Rows = {}): Rows => ({
  templates: [{ id: TPL, name: "مذكرة بدفاع", body: MEMO, needs_lawyer_review: true, office_id: null }],
  cases: [{ id: CASE, title: "صحة ونفاذ عقد بيع", case_number: "8833", case_year: 2024, court: "شمال القاهرة الابتدائية", circuit: "الدائرة 7", case_type: "مدني", stage: "first_instance", status: "active", client_role: "plaintiff", summary: null, facts_date: null, facts_date_precision: "unknown", previous_stage_case_id: null, client_id: CLIENT, ...P() }],
  clients: [{ id: CLIENT, name: "كريم المثالي", kind: "person", phone: null }],
  case_parties: [{ id: U(31), name: "كريم المثالي", role: "plaintiff", is_our_client: true, representative: null, notes: null, created_at: "2026-10-01", ...P() }, { id: U(32), name: "وليد التجريبي", role: "defendant", is_our_client: false, representative: null, notes: null, created_at: "2026-10-01", ...P() }],
  case_facts: [], case_requests: [], case_arguments: [], hearings: [], judgments: [], documents: [], document_pages: [],
  drafts: [{ id: "new-draft-id" }],
  ...over,
});
const ARGS = { template: TPL, case: CASE, quote: "عايز مذكرة بدفاع لقضية كريم" };
{
  const { db, writes } = fakeDb(dbRows());
  const r = await prepareDraft(db, { template: TPL, case: CASE }, ["عايز مذكرة بدفاع لقضية كريم"]);
  check(r.ok, "prepareDraft: a template and a case → the fill for the card");
  if (r.ok) {
    eq(r.title, "مذكرة بدفاع · كريم المثالي", "the draft's title is «template · client»");
    eq(r.fill.filled.map((f) => f.key), ["court", "circuit", "case_number", "our_parties", "opponents"], "the card's filled values come from the case file (the fake one)");
    check(r.fill.missing.some((m) => m.key === "facts_summary"), "the file has no facts → «الوقائع» is listed as missing");
  }
  check(writes.length === 0, "prepareDraft writes NOTHING");
  const g = await prepareDraft(db, { template: TPL, case: CASE, grounds: "الدفع بعدم القبول" }, ["عايز مذكرة بدفاع لقضية كريم"]);
  check(!g.ok && /لم يطلب/.test(g.error), "grounds sent although the lawyer did not ask → refused", !g.ok ? g.error.slice(0, 50) : "");
  const rq = await prepareDraft(db, { template: TPL, case: CASE, requests: "الحكم بالطلبات" }, ["عايز مذكرة"]);
  check(!rq.ok, "requests sent although the lawyer did not ask → refused");
  const ok = await prepareDraft(db, { template: TPL, case: CASE, grounds: "الدفع بعدم القبول لانتفاء الصفة" }, ["اكتبلي مذكرة بدفاع وضيف الأسباب"]);
  check(ok.ok, "grounds drafted because the lawyer asked → accepted");
  if (ok.ok) eq(ok.fill.lawyer.map((l) => l.state), ["needs_confirmation", "empty"], "…marked «needs confirmation»; the requests stay empty");
  const num = await prepareDraft(db, { template: TPL, case: CASE, grounds: "طبقا للمادة 227 مرافعات" }, ["اكتبلي الأسباب"]);
  check(!num.ok && /227/.test(num.error), "drafted text with an article number nobody said → refused", !num.ok ? num.error.slice(0, 60) : "");
  const word = await prepareDraft(db, { template: TPL, case: CASE, grounds: "طبقا للمادة الخامسة من القانون" }, ["اكتبلي الأسباب"]);
  check(!word.ok && /مكتوبين بالحروف/.test(word.error), "drafted text with a SPELLED-OUT article («المادة الخامسة») nobody said → refused (#202)", !word.ok ? word.error.slice(0, 70) : "");
  const wordSaid = await prepareDraft(db, { template: TPL, case: CASE, grounds: "طبقا للمادة الخامسة من القانون" }, ["اكتبلي الأسباب وفيها المادة الخامسة"]);
  check(wordSaid.ok, "…but the lawyer's own spelled-out article is allowed");
  const said = await prepareDraft(db, { template: TPL, case: CASE, grounds: "طبقا للمادة 227 مرافعات" }, ["اكتبلي الأسباب وفيها المادة 227"]);
  check(said.ok, "…but the lawyer's own number is allowed");
  const fileNum = await prepareDraft(db, { template: TPL, case: CASE, grounds: "في الدعوى 8833 لسنة 2024" }, ["اكتبلي الأسباب"]);
  check(fileNum.ok, "…and so is a number the case file has (8833 لسنة 2024)");
  const other = fakeDb(dbRows({ templates: [] }));
  const nt = await prepareDraft(other.db, { template: TPL, case: CASE }, ["x"]);
  check(!nt.ok && /الصيغة غير موجودة/.test(nt.error), "a template this lawyer can not read (another office's) → not found");
  const nc = fakeDb(dbRows({ cases: [] }));
  const nc1 = await prepareDraft(nc.db, { template: TPL, case: CASE }, ["x"]);
  check(!nc1.ok && /الدعوى غير موجودة/.test(nc1.error), "a case this lawyer can not read → not found");
  const bad = await prepareDraft(db, { template: "@t1", case: CASE }, ["x"]);
  check(!bad.ok, "an «@ref» as a template id → refused");
  const broken = fakeDb(dbRows({ templates: [{ id: TPL, name: "x", body: { version: 1 }, needs_lawyer_review: true, office_id: null }] }));
  const bt = await prepareDraft(broken.db, { template: TPL, case: CASE }, ["x"]);
  check(!bt.ok && /تالفة/.test(bt.error), "a template body of the wrong shape is refused (data is checked, not trusted)");
  const evil = fakeDb(dbRows({ templates: [{ id: TPL, name: "x", body: { version: 1, blocks: [{ t: "script", text: "<script>" }] }, needs_lawyer_review: true, office_id: null }] }));
  check(!(await prepareDraft(evil.db, { template: TPL, case: CASE }, ["x"])).ok, "an unknown block type in a template is refused");
}
{
  // what the chat does with the model's create_draft call (turn.ts calls these two)
  const { db, writes } = fakeDb(dbRows());
  const lawyer = [{ id: "m1", content: "قديمة" }, { id: "m2", content: "اكتبلي الأسباب" }, { id: "m3", content: "تانية" }, { id: "m4", content: "الحالية" }];
  eq(recentLawyerTexts("الحالية", "m4", lawyer), ["الحالية", "تانية", "اكتبلي الأسباب"], "the lawyer's words that count: this message and the TWO before it (newest first), not older ones, not a paper");
  const ok = await draftFromCall(db, { template: TPL, case: CASE, quote: "x" }, ["مذكرة"]);
  check(ok.ok && ok.draft.title === "مذكرة بدفاع · كريم المثالي" && ok.draft.fill.filled.length > 0, "draftFromCall: the card preview (title + the fill)");
  const at = await draftFromCall(db, { template: "@t1", case: CASE }, ["x"]);
  check(!at.ok && /معرّفات محفوظة/.test(at.error), "draftFromCall: an «@ref» as the template is refused with the reason");
  const num = await draftFromCall(db, { template: TPL, case: 5 }, ["x"]);
  check(!num.ok, "draftFromCall: a case that is not a string is refused");
  const old = await draftFromCall(db, { template: TPL, case: CASE, grounds: "الدفع بعدم القبول" }, recentLawyerTexts("مذكرة بدفاع", "m4", [{ id: "m1", content: "اكتبلي الأسباب" }, { id: "m2", content: "x" }, { id: "m3", content: "y" }, { id: "m4", content: "مذكرة بدفاع" }]));
  check(!old.ok, "draftFromCall: «اكتبلي الأسباب» three messages ago no longer counts as asking");
  const recent = await draftFromCall(db, { template: TPL, case: CASE, grounds: "الدفع بعدم القبول" }, recentLawyerTexts("مذكرة بدفاع", "m4", [{ id: "m2", content: "اكتبلي الأسباب" }, { id: "m3", content: "y" }, { id: "m4", content: "مذكرة بدفاع" }]));
  check(recent.ok, "draftFromCall: …but two messages ago still does");
  check(writes.length === 0, "none of it writes anything");
}
{
  // applyOp: the draft row
  const { db, writes } = fakeDb(dbRows());
  const res = await applyOp(db, "create_draft", { ...ARGS }, { ...MANUAL, created_by_kind: "model", source_kind: "chat", source_message_id: U(90) });
  const ins = writes.find((w) => w.op === "insert" && w.table === "drafts")?.payload as Record<string, unknown> | undefined;
  eq([ins?.case_id, ins?.template_id, ins?.template_name, ins?.title], [CASE, TPL, "مذكرة بدفاع", "مذكرة بدفاع · كريم المثالي"], "applyOp writes ONE draft: case, template, template name, title");
  eq([ins?.review_status, ins?.created_by_kind, ins?.source_kind, ins?.source_message_id, ins?.needs_lawyer_review], ["confirmed", "model", "chat", U(90), true], "…with the card's provenance, and needs_lawyer_review copied from the template");
  const fill = ins?.fill as { filled: { key: string }[]; lawyer: { state: string }[] };
  eq(fill.filled.map((f) => f.key), ["court", "circuit", "case_number", "our_parties", "opponents"], "…the fill is saved with it (what was filled, from where)");
  eq(fill.lawyer.map((l) => l.state), ["empty", "empty"], "…the grounds and the requests are saved EMPTY");
  const saved = JSON.stringify(ins?.body);
  check(!saved.includes("Clausia"), "no «Clausia» mark in the saved body");
  eq(writes.filter((w) => w.op === "insert").map((w) => w.table), ["drafts"], "nothing else is written");
  eq(res.steps?.map((s) => ({ op: s.op, table: s.table })), [{ op: "delete", table: "drafts" }], "the undo is «delete this draft»");
  writes.length = 0;
  await res.undo();
  eq(writes.map((w) => `${w.op} ${w.table}`), ["delete drafts"], "undo() deletes the draft");
  // the grounds the lawyer asked for are saved and marked
  const { db: d2, writes: w2 } = fakeDb(dbRows());
  await applyOp(d2, "create_draft", { ...ARGS, grounds: "الدفع بعدم القبول" }, MANUAL);
  const ins2 = w2.find((w) => w.op === "insert")?.payload as { body: { blocks: { t: string; key?: string; text: string; state?: string }[] } };
  const g = ins2.body.blocks.find((b) => b.t === "lawyer" && b.key === "grounds");
  eq([g?.text, g?.state], ["الدفع بعدم القبول", "needs_confirmation"], "drafted grounds are saved and marked «needs_confirmation»");
  // unreadable ids are refused and nothing is written
  const nt = fakeDb(dbRows({ templates: [] }));
  eq(await rejects(applyOp(nt.db, "create_draft", ARGS, MANUAL)), "الصيغة غير موجودة", "a template this lawyer can not read is refused");
  const nc = fakeDb(dbRows({ cases: [] }));
  eq(await rejects(applyOp(nc.db, "create_draft", ARGS, MANUAL)), "الدعوى غير موجودة", "a case this lawyer can not read is refused");
  check([nt, nc].every((x) => x.writes.length === 0), "…and nothing was written");
  check((await rejects(applyOp(db, "create_draft", { template: "not-a-uuid", case: CASE, quote: "x" }, MANUAL))) !== null, "a template id that is not a uuid is refused");
  check((await rejects(applyOp(db, "create_draft", { case: CASE, quote: "x" }, MANUAL))) !== null, "a missing template is refused by the tool schema");
}
{
  // the tool as the model sees it
  const spec = writeToolSpecs().find((s) => s.name === "create_draft");
  const props = Object.keys((spec?.parameters as { properties: Record<string, unknown> }).properties).sort();
  eq(props, ["case", "grounds", "quote", "requests", "template"], "the model sees ONLY: template, case, grounds, requests, quote (it can not pass a court, a name, a number or a date)");
  check(!(INTERNAL_TOOLS as readonly string[]).includes("create_draft"), "create_draft is a model tool (the lawyer's request starts it)");
  check(READ_TOOL_SPECS.some((t) => t.name === "search_templates"), "the model can look the templates up (search_templates)");
  check(!WRITE_TOOL_ARGS.create_draft.safeParse({ template: TPL, case: CASE, grounds: "x".repeat(4001), quote: "q" }).success, "grounds longer than 4000 characters are refused");
  check(WRITE_TOOL_ARGS.create_draft.safeParse({ template: TPL, case: CASE, quote: "q" }).success, "template + case + quote is a complete call");
}

// ---------------------------------------------------------------- (e) live, read-only
console.log("\n-- (e) live, read-only: the base templates and a real fill through RLS --");
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
  const known = new Set([...Object.keys(FIELD_LABEL), ...Object.keys(MANUAL_LABEL)]);
  for (const [who, sb] of [["demo", demo], ["other", other]] as const) {
    const t = await sb.from("templates").select("id, slug, name, category, body, needs_lawyer_review, office_id");
    check(!t.error && (t.data?.length ?? 0) >= 6, `${who} reads at least the 6 base templates`, t.error?.message ?? `${t.data?.length} rows`);
    for (const x of t.data ?? []) {
      const b = TemplateBodySchema.safeParse(x.body);
      check(b.success, `${who}: «${x.name}» has a valid body`, b.success ? "" : b.error.message.slice(0, 80));
      if (!b.success) continue;
      const body = b.data as TemplateBody;
      const keys = [...new Set(body.blocks.flatMap((bl) => (bl.t === "lawyer" ? [] : [...bl.text.matchAll(PLACEHOLDER)].map((m) => m[1]))))];
      const manual = new Set((body.manual ?? []).map((m) => m.key));
      const unknownKeys = keys.filter((k) => !known.has(k) && !manual.has(k));
      eq(unknownKeys, [], `${who}: «${x.name}» uses only known placeholders`);
      check(body.blocks.some((bl) => bl.t === "lawyer" && bl.key === "grounds") && body.blocks.some((bl) => bl.t === "lawyer" && bl.key === "requests"), `${who}: «${x.name}» has EMPTY grounds and requests sections`);
      check(x.office_id !== null || x.needs_lawyer_review, `${who}: «${x.name}» is marked needs_lawyer_review`);
    }
    // base templates are read-only through the app
    const up = await sb.from("templates").update({ name: "تغيير" }).is("office_id", null).select("id");
    check(!up.error && (up.data?.length ?? 0) === 0, `${who} can not change a base template (0 rows updated)`, up.error?.message ?? `${up.data?.length} rows`);
    const de = await sb.from("templates").delete().is("office_id", null).select("id");
    check(!de.error && (de.data?.length ?? 0) === 0, `${who} can not delete a base template (0 rows deleted)`, de.error?.message ?? `${de.data?.length} rows`);
    const ins = await sb.from("templates").insert({ name: "صيغة أساسية جديدة", category: "memo", slug: "x", body: { version: 1, blocks: [] } as never });
    check(!!ins.error, `${who} can not add a base template`, ins.error?.message.slice(0, 70));
    const dr = await sb.from("drafts").select("id");
    check(!dr.error, `${who} can read drafts (the table exists)`, dr.error?.message ?? `${dr.data?.length} rows`);
  }
  // a real fill of the demo office's cases, read-only (nothing is saved): what the card would show
  const tpls = (await demo.from("templates").select("id, slug").is("office_id", null)).data ?? [];
  const cases = (await demo.from("cases").select("id, case_number, case_year, stage").order("created_at")).data ?? [];
  const tplId = (slug: string) => tpls.find((t) => t.slug === slug)!.id;
  let shown = 0;
  for (const c of cases) {
    const b = await buildDraft(demo as unknown as Db, { template: tplId("appeal-sheet"), case: c.id }).catch(() => null);
    if (!b) continue;
    check(b.fill.filled.every((f) => f.source), `real case ${c.case_number ?? "?"}/${c.case_year ?? "?"}: every filled value has a source`);
    check(b.fill.lawyer.every((l) => l.state === "empty"), `real case ${c.case_number ?? "?"}: the grounds and the requests are empty`);
    if (shown++ < 3) console.log(`      ${b.title}: filled [${b.fill.filled.map((f) => f.key).join(", ")}]; missing [${b.fill.missing.map((m) => m.key).join(", ")}]`);
  }
  check(shown > 0, "at least one real case filled", `${shown} cases`);
  // the other office can not fill a demo case
  const foreign = await buildDraft(other as unknown as Db, { template: tplId("appeal-sheet"), case: cases[0].id }).catch((e) => String(e.message));
  eq(foreign, "الدعوى غير موجودة", "the other office can not fill a demo case");
  const demoText = fileTexts(await (await import("@/lib/case-file")).getCaseFile(demo as unknown as Db, cases[0].id));
  check(demoText.length > 0 && !demoText.some((s) => /^[0-9a-f]{8}-[0-9a-f]{4}/.test(s)), "fileTexts: the texts of a real case file, with no ids");
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exitCode = fails ? 1 : 0;
