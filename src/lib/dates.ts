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
