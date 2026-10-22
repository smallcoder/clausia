/**
 * The quote matcher, by code only (never the model): the loose match that checks a quote against a page, and the
 * character span of that match in the page's ORIGINAL text.
 *
 * The match runs on normalised text (digits, diacritics, tatweel, hamza and ة/ه forms, spacing and punctuation are
 * ignored), so a position in the normalised text is not a position in the page. `normalizeWithMap` normalises one
 * character at a time and keeps, for every normalised character, the original range it came from. The span of a
 * match is then read straight off that map. No server-only import: the same code runs in tests and on the server.
 */
import { normalizeDigits } from "@/lib/dates";

/** Loose match: digits normalised, diacritics/tatweel/punctuation and spacing ignored, alef/ya/ta-marbuta folded. */
export function normalizeForMatch(s: string): string {
  return normalizeDigits(s)
    .replace(/[ً-ْـ]/g, "")
    .replace(/[إأآٱ]/g, "ا").replace(/[ىی]/g, "ي").replace(/ک/g, "ك").replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();
}

/** Where a quote sits in a page's original text: `text.slice(start, end)`, end exclusive. */
export interface Span { start: number; end: number }
export interface PageSpan extends Span { page: number }

const oneChar = new Map<string, string>();
/** normalizeForMatch of a single character (cached: a page has a few dozen distinct characters). */
function normChar(ch: string): string {
  let n = oneChar.get(ch);
  if (n === undefined) { n = normalizeForMatch(ch); oneChar.set(ch, n); }
  return n;
}

/**
 * `normalizeForMatch(text)` plus, for each character of it, the range [starts[i], ends[i]) of the original text it
 * came from. Every step of the normaliser works on one character at a time (map, drop, or fold), so normalising
 * per character gives the same string; this is checked, and `null` is returned if it ever differs.
 */
export function normalizeWithMap(text: string): { norm: string; starts: number[]; ends: number[] } | null {
  let norm = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let i = 0;
  for (const ch of text) { // by code point: an emoji or a rare letter is one unit, never cut in half
    const n = normChar(ch);
    for (let k = 0; k < n.length; k++) { starts.push(i); ends.push(i + ch.length); }
    norm += n;
    i += ch.length;
  }
  return norm === normalizeForMatch(text) ? { norm, starts, ends } : null;
}

/**
 * The span of `quote` in `pageText` (original offsets), or null when it is not there. When the quote occurs more
 * than once on the page, the FIRST occurrence is taken (see the note in scripts/test-cite-span.ts).
 */
export function findSpan(pageText: string, quote: string | null | undefined): Span | null {
  if (!quote) return null;
  const q = normalizeForMatch(quote);
  if (q.length < 2) return null; // the same floor as verifyQuote
  const m = normalizeWithMap(pageText);
  if (!m) return null;
  const at = m.norm.indexOf(q);
  if (at < 0) return null;
  let end = m.ends[at + q.length - 1];
  // a vowel mark or tatweel after the last letter belongs to that letter: the highlight keeps it (قَالَ, not قَالَ with the fatha outside)
  const mark = /[\p{M}ـ]/uy;
  mark.lastIndex = end;
  while (mark.test(pageText)) end = mark.lastIndex;
  return { start: m.starts[at], end };
}

/**
 * The span of `quote` in a paper's pages (index 0 = page 1). The page the extraction named is tried first; if the
 * quote is not there, the other pages, nearest first (the quote was verified against the whole paper, so the
 * page number the model gave can be off by one).
 */
export function findSpanInPages(pages: string[], quote: string | null | undefined, page: number | null | undefined): PageSpan | null {
  if (!quote || !pages.length) return null;
  const first = page && page >= 1 && page <= pages.length ? page : 1;
  const order = pages.map((_, i) => i + 1).sort((a, b) => Math.abs(a - first) - Math.abs(b - first) || a - b);
  for (const p of order) {
    const s = findSpan(pages[p - 1], quote);
    if (s) return { page: p, ...s };
  }
  return null;
}

/** True when a stored span still reads as the quote on this page text (an old or damaged span is not trusted). */
export function spanMatches(pageText: string, span: Span, quote: string | null | undefined): boolean {
  if (!quote || !Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end <= span.start || span.end > pageText.length) return false;
  return normalizeForMatch(pageText.slice(span.start, span.end)) === normalizeForMatch(quote);
}
