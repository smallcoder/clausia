/** Dates: shown as d/m/yyyy everywhere; stored as ISO yyyy-mm-dd plus a precision. */

export type DatePrecision = "day" | "month" | "year" | "unknown";

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Arabic-Indic / Persian digits → ASCII. */
export function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (c) => String(AR_DIGITS.indexOf(c) >= 0 ? AR_DIGITS.indexOf(c) : FA_DIGITS.indexOf(c)));
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function validYmd(y: number, m: number, d: number) {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Parse a lawyer-written date: «5/3/2024», «05-03-2024», «3/2024» (month), «2024» (year).
 * Day first (Egyptian usage). Returns null when it is not a clear date — callers must then ASK, never guess.
 */
export function parseDmy(input: string | null | undefined): { iso: string; precision: DatePrecision } | null {
  if (!input) return null;
  const s = normalizeDigits(input).trim().replace(/[.\-\\]/g, "/").replace(/\s+/g, "");
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validYmd(y, mo, d) ? { iso: `${y}-${pad(mo)}-${pad(d)}`, precision: "day" } : null;
  }
  m = /^(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const [mo, y] = [Number(m[1]), Number(m[2])];
    return validYmd(y, mo, 1) ? { iso: `${y}-${pad(mo)}-01`, precision: "month" } : null;
  }
  m = /^(\d{4})$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    return validYmd(y, 1, 1) ? { iso: `${y}-01-01`, precision: "year" } : null;
  }
  // ISO from the database / internal callers
  m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(s);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validYmd(y, mo, d) ? { iso: `${y}-${pad(mo)}-${pad(d)}`, precision: "day" } : null;
  }
  return null;
}

/** ISO (yyyy-mm-dd or timestamp) → «d/m/yyyy», respecting precision. */
export function formatDmy(iso: string | null | undefined, precision: DatePrecision = "day"): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y) return "—";
  if (precision === "year") return `${y}`;
  if (precision === "month") return `${m}/${y}`;
  if (precision === "unknown") return "تاريخ غير محدد";
  return `${d}/${m}/${y}`;
}

const AR_WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** «الثلاثاء 20/10/2026» */
export function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${AR_WEEKDAYS[wd]} ${d}/${m}/${y}`;
}

/** Today in Cairo as yyyy-mm-dd (hearing rolls are by Cairo date). */
export function todayIso(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parts; // en-CA gives yyyy-mm-dd
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

// ---- how a date label is drawn (owner rule 2026-10-23) ----

const DIGIT = "[0-9٠-٩۰-۹]";
const PURE_NUMERIC = new RegExp(`^(?=.*${DIGIT})[0-9٠-٩۰-۹\\s/:.\\-–—]+$`);
const NUMBER_RUN = new RegExp(`${DIGIT}+(?:[/:.]${DIGIT}+)*`, "g");

/**
 * True when the value is only a number, a date or a time: digits plus `/ : . -` and spaces
 * («22/10/2026», «5/11», «2026», «9:00»). These use the numbers font and dir="ltr".
 * Anything with a word («النهارده», «الأحد 25», «جلسة 22/10», «يناير 2026») is Arabic text: Arabic font and dir="rtl".
 */
export function isNumericDate(value: string): boolean {
  return PURE_NUMERIC.test(value.trim());
}

/** Splits Arabic text into plain pieces and number runs («جلسة 22/10» → «جلسة », «22/10»); the runs are drawn in <bdi>. */
export function splitNumbers(value: string): { text: string; num: boolean }[] {
  const out: { text: string; num: boolean }[] = [];
  let at = 0;
  for (const m of value.matchAll(NUMBER_RUN)) {
    if (m.index > at) out.push({ text: value.slice(at, m.index), num: false });
    out.push({ text: m[0], num: true });
    at = m.index + m[0].length;
  }
  if (at < value.length) out.push({ text: value.slice(at), num: false });
  return out;
}
