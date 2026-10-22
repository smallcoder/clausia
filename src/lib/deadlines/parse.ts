/**
 * Appeal / cassation periods, read from the TEXT of the article by code (pure: no network, no database).
 * The model never does this, and no number is written in this file as a fallback: when the text cannot be read with
 * certainty the result is `{ ok: false }` and the card shows «راجع المادة» instead of a date.
 *
 * Method: split the article into sentences (a new line or a full stop), choose the sentence by its own words
 * (art. 227: the first sentence is the default period; the sentence that says «المستعجلة» is the urgent one; art. 252:
 * the sentence about النقض), then read the number written right before «يوما / يوم / أيام» — Arabic number words
 * (أربعون، خمسة عشر، ستون …) or digits. Any other number in the article (an article reference like «٢٥٠», the prosecutor's
 * sixty days in another sentence) is never looked at, because only the chosen sentence is read.
 */
import { normalizeDigits } from "@/lib/dates";

export type ParsedDays = { ok: true; days: number; sentence: string } | { ok: false; reason: string };

/** Arabic text for matching: no diacritics or tatweel, alef forms → ا, ى → ي, ة → ه. */
export function norm(s: string): string {
  return normalizeDigits(s)
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

/** The sentences of an article: split on a new line or a full stop (a «.» between digits stays). */
export function sentencesOf(text: string): string[] {
  return text.split(/\n+|(?<!\d)\.(?!\d)|؛/).map((s) => s.trim()).filter(Boolean);
}

const UNITS: Record<string, number> = {
  واحد: 1, واحده: 1, احد: 1, اثنان: 2, اثنين: 2, اثنتان: 2, اثنا: 2, اثني: 2, اثنتا: 2, اثنتي: 2, ثلاث: 3, ثلاثه: 3, اربع: 4, اربعه: 4,
  خمس: 5, خمسه: 5, ست: 6, سته: 6, سبع: 7, سبعه: 7, ثماني: 8, ثمان: 8, ثمانيه: 8, ثمانية: 8, تسع: 9, تسعه: 9,
};
const TENS: Record<string, number> = {
  عشره: 10, عشر: 10, عشرون: 20, عشرين: 20, ثلاثون: 30, ثلاثين: 30, اربعون: 40, اربعين: 40, خمسون: 50, خمسين: 50,
  ستون: 60, ستين: 60, سبعون: 70, سبعين: 70, ثمانون: 80, ثمانين: 80, تسعون: 90, تسعين: 90,
};
const HUNDREDS: Record<string, number> = { مئه: 100, مائه: 100, مئتان: 200, مئتين: 200, مائتان: 200, مائتين: 200 };

const NUMBER_WORDS = new Set<string>([...Object.keys(UNITS), ...Object.keys(TENS), ...Object.keys(HUNDREDS)].map(norm));
const U = new Map(Object.entries(UNITS).map(([k, v]) => [norm(k), v]));
const T = new Map(Object.entries(TENS).map(([k, v]) => [norm(k), v]));
const H = new Map(Object.entries(HUNDREDS).map(([k, v]) => [norm(k), v]));

const DAY_WORD = /^(?:يوما|يوم|ايام)$/;

/** A run of number words («خمسة عشر», «خمسة واربعون», «ستين») → a number, or null when it is not a clean number. */
export function wordsToNumber(words: string[]): number | null {
  const toks = words.map((w) => norm(w)).map((w) => (w.startsWith("و") && w.length > 2 && !NUMBER_WORDS.has(w) ? w.slice(1) : w));
  if (!toks.length || toks.some((w) => !NUMBER_WORDS.has(w))) return null;
  // order: hundreds, then (a unit + «عشر» = 11–19) or (a unit, then tens); nothing twice
  let total = 0;
  let h = false, u = false, t = false;
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i];
    if (H.has(w)) { if (h || u || t) return null; total += H.get(w)!; h = true; continue; }
    if (U.has(w) && (toks[i + 1] === "عشر" || toks[i + 1] === "عشره")) { if (u || t) return null; total += 10 + U.get(w)!; u = t = true; i++; continue; }
    if (U.has(w)) { if (u || t) return null; total += U.get(w)!; u = true; continue; }
    if (T.has(w)) { if (t) return null; total += T.get(w)!; t = true; continue; }
    return null;
  }
  return total > 0 ? total : null;
}

/** Every «<number> يوم» in one sentence (the numbers as written), in order. */
export function dayCounts(sentence: string): number[] {
  const words = norm(sentence).replace(/[،,:()«»"]/g, " ").split(" ").filter(Boolean);
  const out: number[] = [];
  words.forEach((w, i) => {
    if (!DAY_WORD.test(w)) return;
    // digits right before the day word: «40 يوما»
    if (i > 0 && /^\d+$/.test(words[i - 1])) { out.push(Number(words[i - 1])); return; }
    // number words before it (up to 4: «خمسة وسبعون», «مائه وعشرون», «خمسة عشر»)
    for (let len = Math.min(4, i); len >= 1; len--) {
      const n = wordsToNumber(words.slice(i - len, i));
      if (n !== null) { out.push(n); return; }
    }
  });
  return out;
}

function readOne(sentence: string | undefined, what: string): ParsedDays {
  if (!sentence) return { ok: false, reason: `${what}: الجملة مش موجودة في نص المادة` };
  const counts = dayCounts(sentence);
  if (counts.length !== 1) return { ok: false, reason: `${what}: مش قادر أقرا عدد الأيام بوضوح` };
  const days = counts[0];
  if (!Number.isInteger(days) || days < 1 || days > 365) return { ok: false, reason: `${what}: العدد مش منطقي` };
  return { ok: true, days, sentence };
}

/**
 * Art. 227 (the appeal period). Default: the FIRST sentence (it must be about الاستئناف and not about المستعجلة).
 * Urgent: the sentence that says «المستعجلة» (exactly one).
 */
export function parseAppealDays(text: string, urgent: boolean): ParsedDays {
  const ss = sentencesOf(text);
  if (urgent) {
    const hit = ss.filter((s) => norm(s).includes("المستعجل"));
    if (hit.length !== 1) return { ok: false, reason: "م 227: جملة المواد المستعجلة مش واضحة" };
    return readOne(hit[0], "م 227 (مستعجل)");
  }
  const first = ss[0];
  if (!first || !norm(first).includes("الاستئناف") || norm(first).includes("المستعجل")) return { ok: false, reason: "م 227: الجملة الأولى مش عن ميعاد الاستئناف" };
  return readOne(first, "م 227");
}

/** Art. 252 (the cassation period): the first sentence, which must be about النقض. */
export function parseCassationDays(text: string): ParsedDays {
  const first = sentencesOf(text)[0];
  if (!first || !norm(first).includes("النقض")) return { ok: false, reason: "م 252: الجملة الأولى مش عن ميعاد النقض" };
  return readOne(first, "م 252");
}
