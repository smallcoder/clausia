/**
 * The brief's content, built BY CODE from data already in the case file. No model call, nothing guessed:
 * a field that is not there leaves its row out. Pure (no DB, no React), so a test can feed it rows.
 *
 * Choices (the owner asked for the simplest version that works):
 *  - آخر قرار     = the PREVIOUS hearing's decision (hearings.previous_hearing_id), «type — text (d/m)». No previous hearing, no row.
 *  - المطلوب     = the previous hearing's `next_requirements`; if it has none, this hearing's `purpose`.
 *  - أهم واقعة   = the latest CONFIRMED fact of the case (fact_date newest, undated last), shown verbatim.
 *  - ناقص (gold) = 3 code rules, see `missingFor`.
 */
import { circuitNumber, type HearingWithCase } from "@/lib/hearings";
import { DECISION } from "@/lib/labels";
import { nCourts, nHearings, shortDm, weekdayOf, WEEKDAY_LONG } from "@/components/hearings/roll-text";
import { addDaysIso } from "@/lib/dates";
import type { Database } from "@/lib/db/types";

type E = Database["public"]["Enums"];

/** the part of the previous hearing the brief needs */
export interface PrevHearing {
  id: string;
  hearing_date: string;
  decision_type: E["hearing_decision"] | null;
  decision_text: string | null;
  next_requirements: string | null;
}
export interface BriefFact { text: string; fact_date: string | null; sort_order: number | null; created_at: string }

/** What is on file for one hearing's case, read by the loader. */
export interface BriefInput {
  hearing: HearingWithCase;
  prev: PrevHearing | null;
  /** CONFIRMED facts only */
  facts: BriefFact[];
  /** the doc types of the case's papers */
  docTypes: E["doc_type"][];
}

export interface Missing {
  rule: "memo" | "document" | "prev_decision";
  /** the gold line on the card */
  line: string;
  /** the item in the top Clausia line, with whose case: «أصل العقد في قضية عادل» */
  item: string;
  /** the same without the case (phone) */
  itemShort: string;
}

export interface BriefCard {
  hearingId: string;
  caseId: string;
  /** the big gold number (null when the circuit has no number: then `circuitText` is in `meta`) */
  circuit: string | null;
  /** «محكمة استئناف القاهرة · الدور 4 · قاعة 12» (the circuit text only when it has no number) */
  meta: string;
  title: string;
  lastDecision: string | null;
  required: string | null;
  keyFact: string | null;
  missing: Missing[];
  /** who the case is for (first name) or its number: used in the top line and the memo chip */
  who: string | null;
  court: string | null;
}

/** Arabic search form: no marks, one alef, ى→ي, ة→ه, so «مذكرة» / «المذكرات» / «إنذار» match what was typed. */
export function norm(s: string): string {
  return s.replace(/[ً-ٰٟـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
}

/** words in the requirement that name a paper, and the type that paper would have on the case */
const DOC_WORDS: { re: RegExp; type: E["doc_type"]; name: string }[] = [
  { re: /عقد/, type: "contract", name: "العقد" },
  { re: /توكيل/, type: "power_of_attorney", name: "التوكيل" },
  { re: /تقرير الخبير/, type: "expert_report", name: "تقرير الخبير" },
  { re: /انذار/, type: "correspondence", name: "الإنذار" },
  { re: /صحيفه/, type: "claim_sheet", name: "صحيفة الدعوى" },
];

/** a company's first word is not a name: «شركة المثال» keeps its second word */
const ORG_WORD = /^(شركة|مؤسسة|مصنع|بنك|هيئة|جمعية|مكتب)$/;

/** First name of the client (two words for a company), else the case number, else null. */
export function whoOf(h: HearingWithCase): string | null {
  const w = h.case.client_name?.trim().split(/\s+/).filter(Boolean) ?? [];
  const name = w.length ? (ORG_WORD.test(w[0]) && w[1] ? `${w[0]} ${w[1]}` : w[0]) : null;
  return name || h.case.case_number?.trim() || null;
}

/**
 * The 3 rules (code only, from what is on file):
 *  1. memo:          the requirement mentions a memo (مذكرة) and the case has no paper of type «مذكرتنا».   → «المذكرة لسه متكتبتش»
 *  2. document:      the requirement names a paper (عقد، توكيل، تقرير الخبير، إنذار، صحيفة) and the case has none of that type.
 *                    One such paper with «أصل» in the requirement → «الأصل مش مرفوع على الملف»; otherwise «<paper> مش مرفوع على الملف».
 *  3. prev_decision: there is a previous hearing and no decision was recorded for it.                       → «قرار الجلسة اللي فاتت لسه متسجّلش»
 */
export function missingFor(i: BriefInput, required: string | null): Missing[] {
  const out: Missing[] = [];
  const who = whoOf(i.hearing);
  const inCase = who ? ` في قضية ${who}` : "";
  const text = required ? norm(required) : "";
  if (/مذكر/.test(text) && !i.docTypes.includes("our_memo")) {
    out.push({ rule: "memo", line: "المذكرة لسه متكتبتش", item: `المذكرة${inCase}`, itemShort: "المذكرة" });
  }
  const hits = DOC_WORDS.filter((w) => w.re.test(text) && !i.docTypes.includes(w.type));
  const asl = /(^|\s)(ال)?اصل/.test(text);
  for (const w of hits) {
    const single = asl && hits.length === 1;
    out.push({
      rule: "document",
      line: single ? "الأصل مش مرفوع على الملف" : `${asl ? "أصل " : ""}${w.name} مش مرفوع على الملف`,
      item: `${asl ? "أصل " : ""}${w.name}${inCase}`,
      itemShort: `${asl ? "أصل " : ""}${w.name}`,
    });
  }
  if (i.prev && !i.prev.decision_type) {
    out.push({ rule: "prev_decision", line: "قرار الجلسة اللي فاتت لسه متسجّلش", item: `قرار الجلسة اللي فاتت${inCase}`, itemShort: "قرار الجلسة اللي فاتت" });
  }
  return out;
}

/** The latest confirmed fact: newest `fact_date`, undated last, then the higher `sort_order`, then the newest row. */
export function keyFact(facts: BriefFact[]): string | null {
  const best = [...facts].filter((f) => f.text.trim()).sort((a, b) =>
    (b.fact_date ?? "").localeCompare(a.fact_date ?? "") || (b.sort_order ?? -1) - (a.sort_order ?? -1) || b.created_at.localeCompare(a.created_at))[0];
  return best ? best.text.trim() : null;
}

/** «تأجيل — للاطلاع والمذكرات (20/10)»; null without a previous hearing or without a recorded decision. */
export function lastDecision(prev: PrevHearing | null): string | null {
  if (!prev?.decision_type) return null;
  const text = prev.decision_text?.trim();
  return `${DECISION[prev.decision_type]}${text ? ` — ${text}` : ""} (${shortDm(prev.hearing_date)})`;
}

export function buildCard(i: BriefInput): BriefCard {
  const h = i.hearing;
  const required = i.prev?.next_requirements?.trim() || h.purpose?.trim() || null;
  const circuit = circuitNumber(h);
  const circuitText = !circuit ? h.case.circuit?.trim() || null : null;
  const court = h.case.court?.trim() || null;
  const place = h.location?.trim() || null;
  const meta = [court, circuitText, place].filter(Boolean).join(" · ");
  const c = h.case;
  const subject = c.title?.trim() || null;
  const client = c.client_name?.trim() || null;
  const title = client && subject ? `${client} — ${subject}` : client ?? subject ?? (c.case_number ? `الدعوى ${c.case_number}` : "دعوى بلا عنوان");
  return {
    hearingId: h.id, caseId: h.case_id, circuit, meta, title, court,
    lastDecision: lastDecision(i.prev), required, keyFact: keyFact(i.facts),
    missing: missingFor(i, required), who: whoOf(h),
  };
}

/** How the sentences name the hearings day: «بكرة» / «النهارده» / «يوم الأحد» (`today` = Cairo's today, yyyy-mm-dd). */
export function dayWord(date: string, today: string): string {
  if (date === today) return "النهارده";
  if (date === addDaysIso(today, 1)) return "بكرة";
  return `يوم ${WEEKDAY_LONG[weekdayOf(date)]}`;
}

/** «حاجة ناقصة / حاجتين ناقصين / 3 حاجات ناقصة / 12 حاجة ناقصة» */
export function nMissing(n: number): string {
  if (n === 1) return "حاجة ناقصة";
  if (n === 2) return "حاجتين ناقصين";
  if (n >= 3 && n <= 10) return `${n} حاجات ناقصة`;
  return `${n} حاجة ناقصة`;
}

const joinAnd = (xs: string[]) => xs.map((x, i) => (i ? `و${x}` : x)).join("، ");

export interface BriefLine {
  /** pieces of the sentence; `gold` marks the missing count */
  long: { text: string; gold?: boolean }[];
  /** the phone's shorter sentence */
  short: { text: string; gold?: boolean }[];
}

/**
 * The Clausia line on top, from the cards (no model). The mockup also says «أولها 9 الصبح»: a hearing has a date but no
 * time in the data, so that part is left out until a time is recorded.
 */
export function briefLine(cards: BriefCard[], day: string, skipped?: string): BriefLine {
  if (!cards.length) {
    const t = `مفيش جلسات ${day}، ولا في الأسبوع الجاي.`;
    return { long: [{ text: t }], short: [{ text: t }] };
  }
  const courts = [...new Set(cards.map((c) => c.court).filter((x): x is string => !!x))];
  const where = courts.length === 1 ? ` في ${courts[0]}` : courts.length > 1 ? ` في ${nCourts(courts.length)}` : "";
  const missing = cards.flatMap((c) => c.missing);
  /** tomorrow was empty and the brief shows a later day: say so first */
  const pre = skipped ? `مفيش جلسات ${skipped}. ` : "";
  const head = `${pre}${day} ${nHearings(cards.length)}${where}.`;
  const shortHead = `${pre}${nHearings(cards.length)}.`;
  if (!missing.length) {
    const none = " مالقيتش نواقص في الملفات.";
    return { long: [{ text: head + none }], short: [{ text: shortHead + none }] };
  }
  return {
    long: [{ text: `${head} ` }, { text: nMissing(missing.length), gold: true }, { text: `: ${joinAnd(missing.map((m) => m.item))}.` }],
    short: [{ text: `${shortHead} ` }, { text: nMissing(missing.length), gold: true }, { text: `: ${joinAnd(missing.map((m) => m.itemShort))}.` }],
  };
}

export const linePlain = (parts: { text: string }[]) => parts.map((p) => p.text).join("");

/** WhatsApp's own «share text» link: it opens WhatsApp with the text typed in and lets the lawyer pick who gets it. It sends nothing. */
export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/**
 * The text of «ابعت الملخص ده واتساب». Plain text, no markup; the lawyer sees it in WhatsApp and picks who gets it.
 * `heading` = «تحضير جلسات بكرة (الأربعاء 22 أكتوبر)».
 */
export function whatsappText(cards: BriefCard[], heading: string): string {
  const blocks = cards.map((c, n) => {
    const lines = [
      `${n + 1}) ${c.title}`,
      [c.court, c.circuit ? `دائرة ${c.circuit}` : null].filter(Boolean).join(" · ") || null,
      c.lastDecision ? `آخر قرار: ${c.lastDecision}` : null,
      c.required ? `المطلوب: ${c.required}` : null,
      c.keyFact ? `أهم واقعة: ${c.keyFact}` : null,
      ...c.missing.map((m) => `ناقص: ${m.line}`),
    ];
    return lines.filter(Boolean).join("\n");
  });
  return [heading, ...blocks].join("\n\n");
}
