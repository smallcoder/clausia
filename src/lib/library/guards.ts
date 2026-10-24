/**
 * The two guards in front of the legal grounds and the requests of a draft (PR 6). Pure code.
 *  - `askedForLegalText`: Clausia drafts the grounds / requests only when the lawyer ASKED for them in his own words.
 *  - `numbersNotIn`: whatever it drafts may not carry a number or a date the lawyer's words / the case file do not have
 *    (no article numbers, no case numbers, no dates from memory: there is no legal source yet).
 */
import { normalizeDigits } from "@/lib/dates";

/** words folded the way the text is (alef forms, ya, ta marbuta, no diacritics), spaces kept so a short word is not found inside a longer one */
const fold = (t: string) => normalizeDigits(t).replace(/[ً-ْـ]/g, "").replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
const TOPIC = /(اسباب|اسانيد|دفاع|طلبات|حدود الوكاله)/;
const VERB = /(^|\s)(اكتب|اقترح|اقتراح|صيغ|صغ|صوغ|جهز|حضر|ضيف|اضف|عبي|املا|اعمل|ابدا|ابدأ|هات)/;

/** Did the lawyer ask Clausia to write the grounds / the requests / the defense? (a message of his with a topic word AND a «write it» word) */
export function askedForLegalText(lawyerTexts: string[]): boolean {
  return lawyerTexts.some((t) => {
    const n = fold(t);
    return TOPIC.test(n) && VERB.test(n);
  });
}

/** The digit runs of a text, Arabic-Indic numerals read as Western ones. */
const digitRuns = (s: string) => (normalizeDigits(s).match(/\d+/g) ?? []).map((n) => n.replace(/^0+(?=\d)/, "")); // 09 and 9 are the same number

/** Numbers in `drafted` that none of the `sources` has (so they would be invented). Empty = fine. */
export function numbersNotIn(drafted: string, sources: string[]): string[] {
  const have = new Set(sources.flatMap(digitRuns));
  return [...new Set(digitRuns(drafted))].filter((n) => !have.has(n));
}

// ---------------------------------------------------------------- spelled-out numbers near «مادة» / «لسنة» / «رقم» (#202)
/** Arabic number words, folded like `fold` (no «ال», no diacritics, ة→ه, أ→ا, ى→ي): cardinals and ordinals. */
const NUMBER_WORDS = new Set((
  "واحد واحده اثنان اثنين اتنين اثنتان اثنا ثلاث ثلاثه تلات تلاته اربع اربعه خمس خمسه ست سته سبع سبعه ثمان ثماني ثمانيه تمان تمانيه تسع تسعه عشر عشره احد احدي " +
  "عشرون عشرين ثلاثون ثلاثين اربعون اربعين خمسون خمسين ستون ستين سبعون سبعين ثمانون ثمانين تسعون تسعين مائه مئه ميه مايه مائتين مئتين مائتان الف الفين الفان " +
  "اول اولي ثاني ثانيه ثالث ثالثه رابع رابعه خامس خامسه سادس سادسه سابع سابعه ثامن ثامنه تاسع تاسعه عاشر عاشره حاديه حادي"
).split(" "));
// the one-word hundreds («ثلاثمائة»، «خمسمائة»، «ستمائة»، «ثمانمئة»): a unit prefix joined to «مائة / مئة / مية / ماية»; and «اثني / اثنى عشر»
for (const unit of ["ثلاث", "تلات", "اربع", "خمس", "ست", "سبع", "ثمان", "تمان", "تسع"]) for (const h of ["مائه", "مئه", "ميه", "مايه"]) NUMBER_WORDS.add(unit + h);
for (const w of ["اثني", "اثنى", "اثنين", "اثنا"]) NUMBER_WORDS.add(w);
/** the words that introduce a citation: an article, a year of a law, a case or law number */
const CITE_WORDS = new Set(["ماده", "مواد", "لسنه", "رقم"]);

/** a word, with the prefix of «للمادة» / «والخامسة» dropped when what is left is a citation word or a number word (so «للمادة» and «المادة» are the same word) */
const norm = (w: string) => { const s = w.replace(/^[وبلكف]+/, ""); return [w, w.replace(/^ال/, ""), s, s.replace(/^ال/, "")].find((x) => CITE_WORDS.has(x) || NUMBER_WORDS.has(x)) ?? w; };
const tokenize = (t: string) => fold(t).split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(norm);
/** a token as it is and without its prefixes («بالمادة»، «وللمادة»، «والخامسة») */
const bare = (w: string) => { const s = w.replace(/^[وبلكف]+/, ""); return [w, w.replace(/^ال/, ""), s, s.replace(/^ال/, "")]; };
const isNumberWord = (w: string) => bare(w).some((x) => NUMBER_WORDS.has(x));
const isCiteWord = (w: string) => bare(w).some((x) => CITE_WORDS.has(x));

/**
 * Citations with a SPELLED-OUT number («المادة الخامسة»، «لسنة ألفين وأربعة وعشرين»، «الطعن رقم خمسة آلاف»): the phrase from the trigger word to the number
 * word (folded, as the checks compare it). Digits are `numbersNotIn`'s job.
 */
export const spelledCitations = (text: string) => citationPhrases(text, false);

/** the same with digits too («المادة 227»، «لسنة 2024»): every citation, however its number is written */
export function citationPhrases(text: string, digits = true): string[] {
  const w = tokenize(text);
  const out: string[] = [];
  for (let i = 0; i < w.length; i++) {
    if (!isCiteWord(w[i])) continue;
    for (let j = i + 1; j <= Math.min(i + 3, w.length - 1); j++) {
      if (isNumberWord(w[j]) || (digits && /^\d+$/.test(w[j]))) { out.push(w.slice(i, j + 1).join(" ")); break; }
    }
  }
  return out;
}

/**
 * The citations of `drafted` that none of the `sources` has in the same words (so they would be invented). Empty = fine.
 * Default: spelled-out ones only (digits are `numbersNotIn`'s job). `digits: true`: every citation phrase, whatever the number is written in — for text where an
 * article or a ruling may come only from the lawyer's words or the draft itself, never from memory (a case's papers are cited with their source instead).
 */
export function citationsNotIn(drafted: string, sources: string[], opts: { digits?: boolean } = {}): string[] {
  const have = ` ${tokenize(sources.join("\n")).join(" ")} `;
  return [...new Set(citationPhrases(drafted, !!opts.digits))].filter((c) => !have.includes(` ${c} `));
}
