/**
 * The morning brief, built BY CODE from rows (no model call, nothing guessed). Pure: no DB, no React, so a test can feed it rows.
 *
 * What it says (1–3 sentences, in this order):
 *   1–2. the next hearings this week (today and the 6 days after): the day, the date as d/m/yyyy straight from the row, the
 *        court, the case, and what the hearing is for (the row's `purpose`, if it has one);
 *   3.   the papers that are new since yesterday (the first two, by name and case).
 *   Not yet: the nearest deadlines. They come with the deadlines flag (src/lib/flags.ts), which is off.
 *
 * The rule that matters: NO FACT WITHOUT A SOURCE. Each sentence carries the source of the fact in it:
 *   a hearing from a paper → the paper, its page and the sentence (a chip that opens the cite panel);
 *   a hearing from the lawyer's message → «من رسالتك»;  a hearing the lawyer typed in → «إدخال يدوي»;
 *   a new paper → the paper itself (page 1).
 * A candidate whose source cannot be named is dropped before it becomes a sentence. Nothing to say → one short line.
 */
import { dayWord, whoOf } from "@/lib/brief/build";
import { cairoClock } from "@/lib/brief/time";
import { addDaysIso, formatDmy } from "@/lib/dates";
import type { HearingWithCase } from "@/lib/hearings";
import { hearingTitle } from "@/components/hearings/roll-text";
import { shortCourt } from "@/components/home/text";
import { BRIEF_VERSION, type BriefPayload, type BriefSentence, type Seg, type SourceRef } from "./types";

/** the words the lawyer sees on a source that has no paper */
export const FROM_CHAT = "من رسالتك";
export const FROM_MANUAL = "إدخال يدوي";
/** «this week» = today and the 6 days after */
export const WEEK_DAYS = 7;
/** the whole brief says nothing when there is nothing to say */
export const QUIET = "مفيش حاجة مستعجلة النهارده.";
/** at most this many hearings are named (the page beside the chat lists them all) */
const MAX_HEARINGS = 2;
const MAX_DOCS = 2;

/** a paper that came in since yesterday */
export interface NewDoc {
  id: string;
  /** «صحيفة افتتاح دعوى» (the title, else the type, else the file name) */
  name: string;
  caseId: string | null;
  /** «منى» / the case number: who the case is for; null without a case */
  caseWho: string | null;
}

export interface MorningInput {
  /** Cairo today, yyyy-mm-dd */
  today: string;
  now: Date;
  /** the CONFIRMED hearings of the week (today … today+6), in date order */
  hearings: HearingWithCase[];
  /** names of the papers the hearings came from, by document id */
  docNames: Map<string, string>;
  /** papers created since the start of yesterday (Cairo), newest first */
  docs: NewDoc[];
}

const joinAnd = (xs: string[]) => xs.map((x, i) => (i ? `و${x}` : x)).join("، ");

/** The chip of a hearing, or null when it has no source we can name (then the hearing is not said). */
export function hearingSource(h: HearingWithCase, docNames: Map<string, string>): SourceRef | null {
  if (h.source_kind === "document") {
    if (!h.source_document_id) return null;
    const page = h.source_page && h.source_page > 0 ? h.source_page : 1;
    const name = docNames.get(h.source_document_id) ?? "مستند";
    return {
      kind: "paper",
      cite: {
        id: `morning-hearing:${h.id}`, documentId: h.source_document_id, page,
        start: h.source_char_start, end: h.source_char_end, quote: h.source_quote,
        label: `${name} · ص ${page}`, about: `جلسة · ${formatDmy(h.hearing_date)}${h.purpose ? ` · ${h.purpose}` : ""}`,
      },
    };
  }
  if (h.source_kind === "chat") return { kind: "chat", label: FROM_CHAT };
  if (h.source_kind === "manual") return { kind: "manual", label: FROM_MANUAL };
  return null;
}

function hearingSentence(h: HearingWithCase, source: SourceRef, today: string): BriefSentence {
  const day = dayWord(h.hearing_date, today);
  const purpose = h.purpose?.trim();
  return {
    parts: [
      { text: day, gold: true },
      { text: ` (${formatDmy(h.hearing_date)}) عندك جلسة في ${shortCourt(h.case.court)}: ${hearingTitle(h)}${purpose ? `، المطلوب: ${purpose}` : ""}.` },
    ],
    sources: [source],
  };
}

/** A new paper's chip: the paper itself, page 1, no marked sentence (the fact is that the paper arrived). */
function docSource(d: NewDoc): SourceRef {
  return { kind: "paper", cite: { id: `morning-doc:${d.id}`, documentId: d.id, page: 1, start: null, end: null, quote: null, label: `${d.name} · ص 1`, about: `ورقة جديدة · ${d.name}` } };
}

function docsSentence(docs: NewDoc[]): BriefSentence | null {
  const named = docs.slice(0, MAX_DOCS);
  if (!named.length) return null;
  const parts: Seg[] = [
    { text: "من الورق الجديد: ", gold: true },
    { text: `${joinAnd(named.map((d) => `${d.name}${d.caseWho ? ` في قضية ${d.caseWho}` : ""}`))}.` },
  ];
  return { parts, sources: named.map(docSource) };
}

/** The Cairo wall clock of an instant as «07:40». */
export function clockHm(iso: string): string {
  const c = cairoClock(new Date(iso));
  return `${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}`;
}

/** «7:40 ص» (the stamp on top of the brief). */
export function clockStamp(iso: string): string {
  const c = cairoClock(new Date(iso));
  const h12 = c.hour % 12 === 0 ? 12 : c.hour % 12;
  return `${h12}:${String(c.minute).padStart(2, "0")} ${c.hour < 12 ? "ص" : "م"}`;
}

export function buildMorning(i: MorningInput): BriefPayload {
  const end = addDaysIso(i.today, WEEK_DAYS - 1);
  const week = i.hearings.filter((h) => h.review_status === "confirmed" && h.hearing_date >= i.today && h.hearing_date <= end);
  // a hearing whose source cannot be named is dropped here, before it can become a sentence
  const sayable = week.flatMap((h) => { const s = hearingSource(h, i.docNames); return s ? [{ h, s }] : []; }).slice(0, MAX_HEARINGS);
  const sentences: BriefSentence[] = sayable.map(({ h, s }) => hearingSentence(h, s, i.today));
  const docs = docsSentence(i.docs);
  if (docs) sentences.push(docs);
  const cases = new Set<string>([...week.map((h) => h.case_id), ...i.docs.map((d) => d.caseId).filter((x): x is string => !!x)]).size;
  return {
    v: BRIEF_VERSION, forDate: i.today, builtAt: i.now.toISOString(),
    sentences, empty: sentences.length === 0, cases, newDocs: i.docs.length,
  };
}

/** «قضية واحدة / قضيتين / 3 قضايا / 12 قضية» */
export function nCases(n: number): string {
  if (n === 1) return "قضية واحدة";
  if (n === 2) return "قضيتين";
  return n <= 10 ? `${n} قضايا` : `${n} قضية`;
}

/** «ورقة جديدة / ورقتين جديدتين / 4 أوراق جديدة / 12 ورقة جديدة» */
export function nNewDocs(n: number): string {
  if (n === 1) return "ورقة جديدة";
  if (n === 2) return "ورقتين جديدتين";
  return n <= 10 ? `${n} أوراق جديدة` : `${n} ورقة جديدة`;
}

/**
 * The line under the brief: «اتعمل من 3 قضايا و4 أوراق جديدة · 07:40» (no «ورق جديد» part when none came in; no line at all when the
 * brief has nothing to say: it is kept short). `null` = no line.
 */
export function builtLine(b: BriefPayload): string | null {
  if (b.empty) return null;
  const what = [b.cases > 0 ? nCases(b.cases) : null, b.newDocs > 0 ? nNewDocs(b.newDocs) : null].filter((x): x is string => !!x);
  if (!what.length) return null;
  return `اتعمل من ${what.join(" و")} · ${clockHm(b.builtAt)}`;
}

/** The text of a sentence without its chips. */
export const sentenceText = (s: BriefSentence) => s.parts.map((p) => p.text).join("");
