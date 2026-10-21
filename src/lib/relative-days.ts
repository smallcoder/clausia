/**
 * Relative days in the lawyer's own words (owner decision 2026-10-21): code, never the model, turns the
 * unambiguous ones into a date, counted from the message's time in Africa/Cairo:
 *   النهارده (+0) · بكرة (+1) · بعد بكرة (+2) · امبارح (−1)
 *   «<يوم> الجاي» = the next such weekday after the message day (1–7 days ahead; said on a Thursday,
 *   «الخميس الجاي» is +7) · «<يوم> اللي فات» = the last one before it (1–7 days back).
 * Vague phrases («الأسبوع الجاي»، «أول الشهر»، «آخر الأسبوع»، «قريب»، «كمان كام يوم»، a bare «الخميس») are not
 * resolved: Clausia asks. Only the lawyer's message text goes in here, never a paper's text.
 * Pure: no clock — callers pass the message's created_at.
 */
import { addDaysIso, formatDayLabel } from "@/lib/dates";

export interface RelativeDay {
  /** the word as the lawyer wrote it (no clitic, no diacritics, single spaces), e.g. «بكرة»، «الخميس الجاي» */
  word: string;
  /** yyyy-mm-dd (Cairo calendar day) */
  iso: string;
  /** «الخميس 22/10/2026» */
  label: string;
}

/** The Cairo calendar date (yyyy-mm-dd) of an instant. */
export function cairoDateOf(instant: string | Date): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) throw new Error(`bad instant: ${String(instant)}`);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Diacritics and tatweel go first (the word shown keeps the lawyer's spelling otherwise). */
const clean = (s: string) => s.replace(/[\u064B-\u0652\u0670\u0640]/g, "");
/** One letter for one letter (indices stay valid): alef forms → ا, ة → ه, ى → ي. */
const fold = (s: string) => s.replace(/[إأآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");

/** Weekday stems after «ال» (folded), index = JS getUTCDay (الأحد = 0). Longer spellings first. */
const WEEKDAYS: [number, string][] = [
  [6, "سبت"],
  [0, "احد|حد"],
  [1, "اتنين|اثنين"],
  [2, "ثلاثاء|تلاتاء|تلات"],
  [3, "اربعاء|اربع"],
  [4, "خميس"],
  [5, "جمعه"],
];
const STEMS = WEEKDAYS.map(([, s]) => s).join("|");

// a word may carry a clitic in front: و / ف and/or ل / ب («وبكرة»، «لبكرة»، «للخميس الجاي»، «ليوم الخميس الجاي»).
// The last group of each pattern is the word itself; it always ends the match.
const PRE = "(?<!\\p{L})[وف]?[لب]?";
const END = "(?!\\p{L})";
const SIMPLE: [RegExp, number][] = [
  [new RegExp(`${PRE}(بعد\\s*بكره)${END}`, "gu"), 2],
  [new RegExp(`${PRE}(بكره)${END}`, "gu"), 1],
  [new RegExp(`${PRE}(ال?نهارده)${END}`, "gu"), 0],
  [new RegExp(`${PRE}(امبارح)${END}`, "gu"), -1],
];
// «الخميس الجاي»، «يوم الخميس الجاي»، «الخميس اللي جاي»، «الجمعة الجاية»، «الجمعة اللي فاتت»
const WEEKDAY_RE = new RegExp(
  `(?<!\\p{L})[وف]?(?:[لب]?يوم\\s+)?((?:ال|لل|بال)(${STEMS})\\s+(?:ال|اللي\\s+)(جاي|جايه|فات|فاتت))${END}`, "gu");

/**
 * Every unambiguous relative day in `text`, resolved against the Cairo date of `messageInstant`
 * (the message's created_at). In order of appearance, one entry per word and date.
 */
export function resolveRelativeDays(text: string, messageInstant: string | Date): RelativeDay[] {
  const src = clean(text);
  const t = fold(src);
  const base = cairoDateOf(messageInstant);
  const [y, m, d] = base.split("-").map(Number);
  const today = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const hits: { at: number; end: number; days: number }[] = [];
  const add = (mt: RegExpMatchArray, days: number) => {
    const end = mt.index! + mt[0].length;
    hits.push({ at: end - mt[1].length, end, days });
  };

  for (const mt of t.matchAll(WEEKDAY_RE)) {
    const target = WEEKDAYS.find(([, s]) => s.split("|").includes(mt[2]))![0];
    add(mt, mt[3].startsWith("جاي") ? ((target - today + 7) % 7 || 7) : -((today - target + 7) % 7 || 7));
  }
  for (const [re, days] of SIMPLE) {
    for (const mt of t.matchAll(re)) {
      const at = mt.index! + mt[0].length - mt[1].length;
      if (hits.some((h) => at >= h.at && at < h.end)) continue; // «بكرة» inside «بعد بكرة»
      add(mt, days);
    }
  }

  hits.sort((a, b) => a.at - b.at);
  const out: RelativeDay[] = [];
  for (const h of hits) {
    const word = src.slice(h.at, h.end).replace(/\s+/g, " ").replace(/^(لل|بال)/, "ال");
    const iso = addDaysIso(base, h.days);
    if (out.some((x) => x.word === word && x.iso === iso)) continue;
    out.push({ word, iso, label: formatDayLabel(iso) });
  }
  return out;
}

/** «بكرة = الخميس 22/10/2026» — what the card shows. */
export const relativeDayText = (r: Pick<RelativeDay, "word" | "label">) => `${r.word} = ${r.label}`;
