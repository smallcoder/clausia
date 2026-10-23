/**
 * Fills a template from a case file. PURE CODE: the model never fills a value (it only picks the template and the case).
 *
 * The never-guess rules, all here:
 *  - a value comes only from a CONFIRMED item of the case file (the file keeps suggested items apart, so they are never used);
 *  - every filled value says where it came from (a paper and its page, or the field of the case file);
 *  - a value the file does not have stays empty and is listed as missing, with the reason; two candidates (two judgments) are NOT picked between;
 *  - the legal grounds and the requests are ALWAYS the lawyer's: empty unless the lawyer asked Clausia to draft them, and then marked «needs_confirmation»;
 *  - a date or a number is never worked out: it is copied as the file has it.
 */
import type { CaseFile } from "@/lib/case-file";
import { formatDmy, todayIso } from "@/lib/dates";
import { DOC_TYPE, STAGE } from "@/lib/labels";
import type { DraftBlock, DraftFill, FillResult, FilledField, LawyerSlot, MissingField, TemplateBody } from "./types";

type Resolved = { value: string; source: string } | { missing: string };

interface Ctx {
  cf: CaseFile;
  /** the file of the case the judgment is in (this case, or the earlier stage's case for an appeal that already exists); null = not available */
  judged: { cf: CaseFile; earlier: boolean } | null;
  forStage: TemplateBody["for_stage"];
  today: string;
}

/** the Arabic names of the fields the case file can fill (the card and the empty-spot list use them) */
export const FIELD_LABEL: Record<string, string> = {
  court: "المحكمة", circuit: "الدائرة", case_number: "رقم الدعوى", client: "اسم الموكل",
  our_parties: "موكلنا (الأطراف)", opponents: "الخصوم", appealed_case: "الدعوى المستأنف حكمها",
  judgment_date: "تاريخ الحكم", judgment_text: "منطوق الحكم", facts_summary: "الوقائع", next_hearing: "الجلسة القادمة",
};
/** the fields nobody but the lawyer can give (no template needs to list these in its `manual`) */
export const MANUAL_LABEL: Record<string, string> = {
  lawyer_name: "اسم المحامي", agent_name: "اسم الوكيل (المحامي)", client_national_id: "الرقم القومي للموكل", client_address: "عنوان الموكل",
};

const SIDE_A = new Set(["plaintiff", "appellant", "cassation_appellant"]);
const SIDE_B = new Set(["defendant", "appellee", "cassation_appellee"]);
const sideOf = (role: string) => (SIDE_A.has(role) ? "A" : SIDE_B.has(role) ? "B" : null);

const clean = (s: string | null | undefined) => (s ?? "").trim();
const STAGE_NOW = (cf: CaseFile) => STAGE[cf.case.stage];

/** where a row of the file came from: «الحكم · ص 3» when it was read from a paper page, else the file's own name for that part */
function sourceOf(cf: CaseFile, prov: { source: { kind: string; document_id: string | null; page: number | null } }, fallback: string): string {
  const s = prov.source;
  if (s.kind === "document" && s.document_id) {
    const d = cf.documents.find((x) => x.id === s.document_id);
    if (d) {
      const name = d.doc_type !== "other" && d.doc_type in DOC_TYPE ? DOC_TYPE[d.doc_type as keyof typeof DOC_TYPE] : clean(d.title) || d.file_name;
      return s.page ? `${name} · ص ${s.page}` : name;
    }
  }
  return fallback;
}

/** «8833 لسنة 2024» — only with BOTH the number and the year (a number without its year is not the whole number) */
function numberWithYear(c: { case_number: string | null; case_year: number | null }): { value: string } | { missing: string } {
  const n = clean(c.case_number);
  if (!n) return { missing: "رقم الدعوى مش متسجل" };
  if (!c.case_year) return { missing: "سنة الدعوى مش متسجلة" };
  return { value: `${n} لسنة ${c.case_year}` };
}
const withSource = (r: { value: string } | { missing: string }, source: string): Resolved => ("missing" in r ? r : { ...r, source });

/** the proceeding's own fields (court, circuit, number) only describe THIS case when the template is for the case's stage */
function proceeding(ctx: Ctx, what: string): string | null {
  if (!ctx.forStage || ctx.cf.case.stage === ctx.forStage) return null;
  return `بيان ${ctx.forStage === "appeal" ? "الاستئناف" : "الطعن"} (${what}) مش في الملف: القضية دي في ${STAGE_NOW(ctx.cf)}`;
}

const RESOLVERS: Record<string, (ctx: Ctx) => Resolved> = {
  court: (ctx) => {
    const stage = proceeding(ctx, "المحكمة"); if (stage) return { missing: stage };
    const v = clean(ctx.cf.case.court);
    return v ? { value: v, source: "بيانات الدعوى · المحكمة" } : { missing: "المحكمة مش متسجلة" };
  },
  circuit: (ctx) => {
    const stage = proceeding(ctx, "الدائرة"); if (stage) return { missing: stage };
    const v = clean(ctx.cf.case.circuit);
    return v ? { value: v, source: "بيانات الدعوى · الدائرة" } : { missing: "الدائرة مش متسجلة" };
  },
  case_number: (ctx) => {
    const stage = proceeding(ctx, "الرقم"); if (stage) return { missing: stage };
    return withSource(numberWithYear(ctx.cf.case), "بيانات الدعوى · الرقم والسنة");
  },
  client: (ctx) => {
    const c = ctx.cf.client;
    return c && clean(c.name) ? { value: c.name, source: "الموكل في الملف" } : { missing: "الدعوى بلا موكل" };
  },
  our_parties: (ctx) => {
    const ours = ctx.cf.parties.filter((p) => p.is_our_client);
    if (ours.length) return { value: ours.map((p) => p.name).join("، "), source: ours.length === 1 ? sourceOf(ctx.cf, ours[0], "الأطراف في الملف") : "الأطراف في الملف" };
    // no party row marked as ours: the case's own client is a recorded fact, not a guess
    const c = ctx.cf.client;
    return c && clean(c.name) ? { value: c.name, source: "الموكل في الملف" } : { missing: "مفيش طرف أو موكل متسجل" };
  },
  opponents: (ctx) => {
    const ours = ctx.cf.parties.find((p) => p.is_our_client);
    const ourSide = ours ? sideOf(ours.role) : null;
    if (!ourSide) return { missing: "مش واضح مين الخصم: صفة موكلنا مش متسجلة في الأطراف" };
    const them = ctx.cf.parties.filter((p) => !p.is_our_client && sideOf(p.role) !== null && sideOf(p.role) !== ourSide);
    return them.length ? { value: them.map((p) => p.name).join("، "), source: them.length === 1 ? sourceOf(ctx.cf, them[0], "الأطراف في الملف") : "الأطراف في الملف" } : { missing: "مفيش خصم متسجل في الملف" };
  },
  appealed_case: (ctx) => {
    // the case IS the judged one (it is still at the earlier stage): its own number. An appeal that already exists: the earlier case's number.
    if (ctx.judged && !ctx.judged.earlier) {
      const r = numberWithYear(ctx.cf.case);
      return "missing" in r ? r : { value: r.value, source: "بيانات الدعوى · الرقم والسنة" };
    }
    const prev = ctx.cf.case.previous_stage_case;
    const m = prev ? /^الدعوى رقم (.+)$/.exec(prev.label) : null;
    return prev && m ? { value: m[1], source: `الدعوى السابقة (${STAGE[prev.stage as keyof typeof STAGE] ?? prev.stage})` } : { missing: "رقم الدعوى اللي صدر فيها الحكم مش متسجل" };
  },
  judgment_date: (ctx) => {
    const j = singleJudgment(ctx);
    if ("missing" in j) return j;
    return j.j.date ? { value: formatDmy(j.j.date), source: sourceOf(j.cf, j.j, "الأحكام في الملف") } : { missing: "تاريخ الحكم مش متسجل" };
  },
  judgment_text: (ctx) => {
    const j = singleJudgment(ctx);
    if ("missing" in j) return j;
    return clean(j.j.operative_text) ? { value: clean(j.j.operative_text), source: sourceOf(j.cf, j.j, "الأحكام في الملف") } : { missing: "منطوق الحكم مش متسجل" };
  },
  facts_summary: (ctx) => {
    const s = clean(ctx.cf.case.summary);
    if (s) return { value: s, source: "بيانات الدعوى · الملخص" };
    const facts = ctx.cf.facts;
    if (!facts.length) return { missing: "مفيش وقائع مؤكدة في الملف" };
    // the confirmed facts as the file has them, in its order (dated first): nothing added, nothing reworded
    const line = (f: CaseFile["facts"][number]) => {
      const when = clean(f.date_text) || (f.date && f.date_precision !== "unknown" ? formatDmy(f.date, f.date_precision as "day") : "");
      return when ? `${when}: ${f.text}` : f.text;
    };
    return { value: facts.map(line).join("\n"), source: `الوقائع المؤكدة في الملف (${facts.length})` };
  },
  next_hearing: (ctx) => {
    const next = ctx.cf.hearings.filter((h) => h.date >= ctx.today).sort((a, b) => a.date.localeCompare(b.date))[0];
    return next ? { value: formatDmy(next.date), source: sourceOf(ctx.cf, next, "الجلسات في الملف") } : { missing: "مفيش جلسة قادمة متسجلة" };
  },
};

/** the ONE judgment of the judged case's file; none, or more than one, is not picked between */
function singleJudgment(ctx: Ctx): { cf: CaseFile; j: CaseFile["judgments"][number] } | { missing: string } {
  if (!ctx.judged) return { missing: "الحكم مش في ملف القضية دي ولا في دعوى سابقة متسجلة" };
  const js = ctx.judged.cf.judgments;
  if (!js.length) return { missing: ctx.judged.earlier ? "مفيش حكم متسجل في الدعوى السابقة" : "مفيش حكم متسجل في الملف" };
  if (js.length > 1) return { missing: `فيه ${js.length} أحكام في الملف: حدد الحكم بنفسك` };
  return { cf: ctx.judged.cf, j: js[0] };
}

/**
 * The file the judgment is read from: a template for the next stage, on a case that is already at that stage, reads the earlier case
 * (`previous`, which the caller loads: it has to be a case this lawyer can read); otherwise it is this case.
 */
export function judgedSource(cf: CaseFile, forStage: TemplateBody["for_stage"], previous: CaseFile | null): Ctx["judged"] {
  if (!forStage) return { cf, earlier: false };
  const now = RANK[cf.case.stage];
  const want = RANK[forStage];
  if (now < want) return { cf, earlier: false }; // the case is still the one that was judged
  if (now === want) return previous ? { cf: previous, earlier: true } : null; // the appeal exists: the judgment is in the earlier case
  return null; // a case past that stage: which judgment is meant is not for code to say
}
const RANK = { first_instance: 0, appeal: 1, cassation: 2 } as const;

export const PLACEHOLDER = /\{\{([a-z_]+)\}\}/g;

/** Does a template need the earlier stage's file? (so the caller loads it) */
export const needsEarlierCase = (body: TemplateBody, cf: CaseFile) => !!body.for_stage && cf.case.stage === body.for_stage && !!cf.case.previous_stage_case;

export interface FillOptions {
  /** the file of the earlier stage's case (see `judgedSource`) */
  previous?: CaseFile | null;
  /** the text the lawyer ASKED Clausia to draft for the legal-grounds / requests sections (the caller has already checked that he asked) */
  grounds?: string | null;
  requests?: string | null;
  today?: string;
}

/** Fills the template. Never throws on missing data: a spot with no value stays empty and is listed. */
export function fillTemplate(body: TemplateBody, cf: CaseFile, opts: FillOptions = {}): FillResult {
  const ctx: Ctx = { cf, judged: judgedSource(cf, body.for_stage, opts.previous ?? null), forStage: body.for_stage, today: opts.today ?? todayIso() };
  const manual = new Map([...Object.entries(MANUAL_LABEL), ...(body.manual ?? []).map((m) => [m.key, m.label] as const)]);
  const filled: FilledField[] = [];
  const missing: MissingField[] = [];
  const values = new Map<string, string>();
  const seen = new Set<string>();

  const resolve = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    const label = FIELD_LABEL[key] ?? manual.get(key) ?? key;
    const fn = RESOLVERS[key];
    if (!fn) { missing.push({ key, label, reason: "بيان لازم تكتبه بنفسك: مش موجود في ملف القضية" }); return; }
    const r = fn(ctx);
    if ("missing" in r) missing.push({ key, label, reason: r.missing });
    else { filled.push({ key, label, value: r.value, source: r.source }); values.set(key, r.value); }
  };

  const lawyer: LawyerSlot[] = [];
  const blocks: DraftBlock[] = body.blocks.map((b): DraftBlock => {
    if (b.t === "lawyer") {
      // the grounds and the requests are never filled by code; they hold text only when the lawyer asked for it, and then wait for his confirmation
      const asked = b.key === "grounds" ? clean(opts.grounds) : b.key === "requests" ? clean(opts.requests) : "";
      const state = asked ? "needs_confirmation" : "empty";
      lawyer.push({ key: b.key, heading: b.heading, state });
      return { t: "lawyer", key: b.key, heading: b.heading, ...(b.hint ? { hint: b.hint } : {}), text: asked, state };
    }
    for (const m of b.text.matchAll(PLACEHOLDER)) resolve(m[1]);
    return { t: b.t, text: b.text.replace(PLACEHOLDER, (all, key: string) => values.get(key) ?? all) };
  });

  return { body: { version: 1, blocks }, fill: { filled, missing, lawyer } };
}

/** What the lawyer still has to give: the missing spots first, then the sections only he writes (the card's «محتاجة منك» line). */
export function needsFromLawyer(fill: DraftFill): string[] {
  return [...fill.missing.map((m) => m.label), ...fill.lawyer.filter((l) => l.state === "empty").map((l) => l.heading)];
}
