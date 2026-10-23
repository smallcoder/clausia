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
