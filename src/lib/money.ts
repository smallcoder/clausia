/**
 * Money, exact (PR 5, الحسابات). An amount is a whole number of PIASTERS (1 EGP = 100 piasters): the database column is bigint, and here it is a
 * JS integer kept below 2^53 (the database check stops at 10^12 piasters = 10 billion EGP, far below). There is NO float anywhere: the text the
 * lawyer wrote is read digit by digit (never parseFloat), sums are integer sums, and the display splits the integer with / and % and groups it.
 * Pure (no server-only, no database): the card, the tab, the receipt, the tools and the tests share it.
 */
import { normalizeDigits } from "@/lib/dates";

/** The largest amount one row may hold, in piasters (10 billion EGP). The database check is the same number. */
export const MAX_PIASTERS = 1_000_000_000_000;

const CURRENCY = /جنيه(?:ا|ات)?|ج\.\s?م\.?|EGP|L\.?\s?E\.?|£/gi;

/**
 * «3000», «3,000», «٣٬٠٠٠», «3000.50», «3000 جنيه» → piasters. Anything that is not ONE clear amount gives null (the caller then ASKS, never guesses):
 * words («3 آلاف»), a range («3000 أو 4000»), a sign, zero, more than 2 decimals («3.000» could mean 3 or 3000), a misplaced comma («3,00»), too large.
 * A number input is read through its text, so 3000.5 is «3000.5» (= 3,000.50), never 300050.00000000006.
 */
export function parseAmount(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number" && !Number.isFinite(input)) return null;
  let s = normalizeDigits(String(input)).replace(CURRENCY, " ").replace(/٬/g, ",").replace(/،/g, ",").replace(/٫/g, ".").trim();
  if (!s || /\s/.test(s)) return null; // a second number or a word left over: unclear
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  if (m[1].length > 13) return null;
  const piasters = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
  return Number.isSafeInteger(piasters) && piasters >= 1 && piasters <= MAX_PIASTERS ? piasters : null;
}

/** 3350000 piasters → «33,500»; 45050 → «450.50» (the piasters are shown only when there are some). */
export function formatAmount(piasters: number): string {
  const p = Math.abs(piasters);
  const whole = Math.trunc(p / 100);
  const cents = p % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${piasters < 0 ? "-" : ""}${grouped}${cents ? `.${String(cents).padStart(2, "0")}` : ""}`;
}

/** «3,000 ج.م» */
export const formatEgp = (piasters: number): string => `${formatAmount(piasters)} ج.م`;

/** The amount as the plain text the card and the forms hold («3000» or «450.50»), the form `parseAmount` reads back exactly. */
export function amountText(piasters: number): string {
  return formatAmount(piasters).replace(/,/g, "");
}

/** A database number (bigint comes through the API as a JSON number) → a safe integer, else an error: a wrong number is never shown. */
export function fromDb(v: unknown): number {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
  if (typeof n !== "number" || !Number.isSafeInteger(n)) throw new Error("مبلغ غير صالح في قاعدة البيانات");
  return n;
}

/** An exact integer sum (it refuses to go past 2^53 instead of rounding). */
export function sumPiasters(values: number[]): number {
  let t = 0;
  for (const v of values) {
    t += v;
    if (!Number.isSafeInteger(t)) throw new Error("المجموع كبير جدًا");
  }
  return t;
}

const SCALE: [RegExp, number][] = [[/^\s*(?:ألف|الف|آلاف|الاف)/, 1000], [/^\s*مليون/, 1_000_000]];

/**
 * Every amount written in a text, in piasters: «3000», «3,000», «٣٠٠٠», «3.5 ألف» (= 3,500), «2 مليون». Used by the never-guess check: a proposed
 * amount must be one of these. A number spelled in words («ثلاثة آلاف») is NOT found, so the assistant has to ask.
 */
export function amountsIn(text: string): number[] {
  const src = normalizeDigits(text).replace(/٬/g, ",").replace(/،/g, ",").replace(/٫/g, ".");
  const out: number[] = [];
  for (const m of src.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const raw = m[0].replace(/,+$/, "");
    const after = src.slice(m.index + m[0].length);
    const scale = SCALE.find(([re]) => re.test(after))?.[1];
    if (scale) {
      // «3.5 ألف»: the digits are scaled by integer maths on the text, not by multiplying a float
      const [w, f = ""] = raw.replace(/,/g, "").split(".");
      const digits = scale === 1000 ? 3 : 6;
      if (f.length > digits) continue;
      const v = Number(w + f.padEnd(digits, "0")) * 100;
      if (Number.isSafeInteger(v) && v >= 1 && v <= MAX_PIASTERS) out.push(v);
      continue;
    }
    const p = parseAmount(raw);
    if (p !== null) out.push(p);
  }
  return out;
}

/** True when the amount (as the model wrote it) is one the lawyer's own words state. */
export function amountStated(amount: string | number, texts: string[]): boolean {
  const p = parseAmount(amount);
  return p !== null && amountsIn(texts.join("\n")).includes(p);
}
