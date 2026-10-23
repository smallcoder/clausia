/**
 * «Clausia noticed»: the small cards under the morning brief. Two kinds only, both found BY CODE from rows (nothing guessed,
 * nothing changed — a card only points; any change still goes through the record-decision sheet and its confirm):
 *
 *  (a) hearing_decision — a hearing before today (Cairo) with no decision (`undecidedPastHearings`). Action: «سجّل القرار».
 *
 *  (b) date_conflict — THE RULE (kept simple on purpose; smarter matching is a `future` issue):
 *      inside ONE case, take the facts that have a day-precision `fact_date` and a source paper. Two facts are «the same event
 *      with two dates» when
 *        1. they come from DIFFERENT papers (`source_document_id` differs),
 *        2. their `fact_date` differs,
 *        3. their texts are equal once the dates are taken out of them (numeric dates like 15/3/2026, «15 مارس 2026», the
 *           fact's own `date_text`) and the rest is normalised with `normalizeForMatch` (digits, diacritics, hamza and ة/ه,
 *           spacing and punctuation ignored), and what is left is at least MIN_KEY letters (so a two-word fact never matches),
 *        4. the text is about a SPECIFIC event, not a stock one that repeats in every case («تم تأجيل الدعوى لجلسة …»,
 *           «صدر حكم ابتدائي في الدعوى بتاريخ …»: two such facts are two events, never one event with two dates). The text,
 *           with its dates out, must keep at least MIN_DISTINCT distinctive words: a word that is not a stock court word
 *           (تأجيل، جلسة، حكم، قرار، الدعوى، إعلان، صدر، تم …, see STOCK) and not a small function word (في، على، من …),
 *           with a prefix (ال، ب، ل، و) not counted. Names, numbers and amounts count (the digits of a date are already out),
 *           and so do specific nouns such as عقد or إنذار with their object («أنذر المستأجر على يد محضر …»).
 *      One card per (case, text); it shows the first two facts that differ. Action: «شوف الورقتين» = one chip per paper.
 *
 *  «تجاهل» is per lawyer (`dismissed_notices`): a dismissed card is filtered out here and never comes back.
 */
import { formatDmy, normalizeDigits } from "@/lib/dates";
import type { HearingWithCase } from "@/lib/hearings";
import { rowTitle } from "@/components/home/text";
import { normalizeForMatch } from "@/lib/quote-match";
import { hearingSource } from "./build";
import type { ConflictNotice, HearingNotice, Notice, SourceRef } from "./types";

/** the shortest normalised text (letters and digits) that may match: below this a match is a coincidence */
export const MIN_KEY = 12;
/** cards in the chat at once (the rest wait behind them) */
export const MAX_NOTICES = 2;

export interface NoticeFact {
  id: string;
  case_id: string;
  text: string;
  fact_date: string | null;
  date_precision: "day" | "month" | "year" | "unknown";
  date_text: string | null;
  source_document_id: string | null;
  source_page: number | null;
  source_quote: string | null;
  source_char_start: number | null;
  source_char_end: number | null;
  created_at: string;
}

const MONTHS = "يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يونية|يوليو|يوليه|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر";
const DATE_PATTERNS = [
  /\b\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2}\b/g, // 2026-03-15
  /\b\d{1,2}\s*[/\-.]\s*\d{1,2}\s*[/\-.]\s*\d{2,4}\b/g, // 15/3/2026, 15-3-26
  new RegExp(`\\b\\d{1,2}\\s+(?:${MONTHS})(?:\\s+(?:سنة\\s+|عام\\s+)?\\d{4})?`, "g"), // 15 مارس 2026
  new RegExp(`(?:${MONTHS})\\s+(?:سنة\\s+|عام\\s+)?\\d{4}`, "g"), // مارس 2026
  /\b\d{1,2}\s*[/\-.]\s*\d{4}\b/g, // 3/2026
];

/** The fact's text with its dates taken out (not normalised). */
function withoutDates(text: string, dateText?: string | null): string {
  let t = normalizeDigits(text);
  const own = dateText?.trim();
  if (own) t = t.split(normalizeDigits(own)).join(" ");
  for (const re of DATE_PATTERNS) t = t.replace(re, " ");
  return t;
}

/** The fact's text without its dates, normalised for matching. */
export function dateFreeKey(text: string, dateText?: string | null): string {
  return normalizeForMatch(withoutDates(text, dateText));
}

/** the distinctive words needed for a match: one specific word is not an event, two make it a specific one */
export const MIN_DISTINCT = 2;

/** Stock words of court papers (court events that repeat in every case) and small function words, stored as normalizeForMatch writes them. */
const STOCK = new Set([
  // court events and papers
  "تأجيل", "تأجيله", "جلسة", "جلسات", "حكم", "الحكم", "قرار", "القرار", "الدعوى", "دعوى", "إعلان", "إعلانه", "المحكمة", "محكمة", "نظر", "تحديد", "تقرر",
  "صدر", "صدور", "حضور", "حضر", "ابتدائي", "ابتدائيا", "استئناف", "نهائي", "الطعن", "طعن", "مذكرة", "قيد", "رقم", "تاريخ", "بتاريخ", "يوم", "موعد", "لنظر", "للنظر",
  // small function words
  "تم", "في", "على", "علي", "من", "إلى", "الى", "عن", "أن", "ان", "أو", "او", "ثم", "كان", "كانت", "هذا", "هذه", "ذلك", "قد", "لا", "لم", "مع", "بعد", "قبل", "حتى", "فيها", "فيه", "به", "بها", "له", "لها",
].map(normalizeForMatch));

/** the leading prefixes that stick to a word: وال بال لل ال و ب ل */
const PREFIX = /^(?:وال|بال|لل|ال|و|ب|ل)/;

/** The words of the fact (dates out) that are neither stock court words nor function words. Names, numbers and specific nouns stay. */
export function distinctiveWords(text: string, dateText?: string | null): string[] {
  return withoutDates(text, dateText).split(/\s+/).map(normalizeForMatch).filter((w) => {
    if (!w) return false;
    const bare = w.replace(PREFIX, "");
    return !STOCK.has(w) && !(bare && STOCK.has(bare));
  });
}

/** The conflicts of a case's facts (see the rule in the file header). Pure. */
export function dateConflicts(facts: NoticeFact[]): { key: string; caseId: string; a: NoticeFact; b: NoticeFact }[] {
  const groups = new Map<string, NoticeFact[]>();
  for (const f of facts) {
    if (!f.source_document_id || !f.fact_date || f.date_precision !== "day") continue;
    const k = dateFreeKey(f.text, f.date_text);
    if (k.length < MIN_KEY || distinctiveWords(f.text, f.date_text).length < MIN_DISTINCT) continue;
    const g = `${f.case_id}|${k}`;
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(f);
  }
  const out: { key: string; caseId: string; a: NoticeFact; b: NoticeFact }[] = [];
  for (const g of groups.values()) {
    const sorted = [...g].sort((x, y) => x.created_at.localeCompare(y.created_at) || x.id.localeCompare(y.id));
    let found: [NoticeFact, NoticeFact] | null = null;
    for (let i = 0; i < sorted.length && !found; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[i].source_document_id !== sorted[j].source_document_id && sorted[i].fact_date !== sorted[j].fact_date) { found = [sorted[i], sorted[j]]; break; }
      }
    }
    if (found) out.push({ key: [found[0].id, found[1].id].sort().join(":"), caseId: found[0].case_id, a: found[0], b: found[1] });
  }
  return out.sort((x, y) => x.key.localeCompare(y.key));
}

const paperSource = (f: NoticeFact, names: Map<string, string>, about: string): SourceRef => {
  const page = f.source_page && f.source_page > 0 ? f.source_page : 1;
  return {
    kind: "paper",
    cite: { id: `morning-fact:${f.id}`, documentId: f.source_document_id!, page, start: f.source_char_start, end: f.source_char_end, quote: f.source_quote, label: `${names.get(f.source_document_id!) ?? "مستند"} · ص ${page}`, about },
  };
};

const clamp = (s: string, n = 90) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };

/** The card of a conflict. `caseTitle` = «client — subject», `names` = paper names by document id. */
export function conflictNotice(c: { key: string; caseId: string; a: NoticeFact; b: NoticeFact }, caseTitle: string, names: Map<string, string>): ConflictNotice {
  const name = (f: NoticeFact) => names.get(f.source_document_id!) ?? "مستند";
  return {
    kind: "date_conflict", key: c.key, caseId: c.caseId, title: caseTitle,
    text: `نفس الواقعة بتاريخين مختلفين: ${formatDmy(c.a.fact_date)} في ${name(c.a)}، و${formatDmy(c.b.fact_date)} في ${name(c.b)}. أنهي الصح؟`,
    quote: clamp(c.a.text),
    sources: [paperSource(c.a, names, `واقعة · ${formatDmy(c.a.fact_date)} · ${clamp(c.a.text, 50)}`), paperSource(c.b, names, `واقعة · ${formatDmy(c.b.fact_date)} · ${clamp(c.b.text, 50)}`)],
  };
}

export function hearingNotice(h: HearingWithCase, names: Map<string, string>): HearingNotice {
  return {
    kind: "hearing_decision", key: h.id, hearing: h, title: rowTitle(h),
    text: `جلسة ${formatDmy(h.hearing_date)} فاتت من غير قرار.`,
    source: hearingSource(h, names),
  };
}

/**
 * The cards to show: conflicts first (rarer), then undecided hearings (oldest first), without what this lawyer dismissed,
 * at most MAX_NOTICES. `dismissed` holds «kind:key» strings.
 */
export function pickNotices(conflicts: ConflictNotice[], hearings: HearingNotice[], dismissed: Set<string>): Notice[] {
  const live = (n: Notice) => !dismissed.has(dismissalId(n.kind, n.key));
  return [...conflicts.filter(live), ...hearings.filter(live)].slice(0, MAX_NOTICES);
}

export const dismissalId = (kind: string, key: string) => `${kind}:${key}`;

/** «لاحظت حاجة / حاجتين / 3 حاجات» */
export function noticedHeading(n: number): string {
  return n === 1 ? "لاحظت حاجة" : n === 2 ? "لاحظت حاجتين" : `لاحظت ${n} حاجات`;
}
