/**
 * Home wording, built from real data (no LLM call): the long date, the greeting, Arabic counts,
 * and the Clausia sentence. Pure functions — no DB access.
 */
import { normalizeDigits } from "@/lib/dates";
import type { HearingWithCase } from "@/lib/hearings";

const AR_WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/** «الثلاثاء 20 أكتوبر» (the mockup's long date; elsewhere dates stay d/m/yyyy) */
export function formatLongDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${AR_WEEKDAYS[wd]} ${d} ${AR_MONTHS[m - 1]}`;
}

const cairoHour = (now: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "numeric", hour12: false }).format(now));

/** «مساء الخير، أستاذ تجريبي» — «أ.» is spelled out; an e-mail is never used as a name. */
export function greeting(displayName: string | null | undefined, now = new Date()): string {
  const hello = cairoHour(now) < 12 ? "صباح الخير" : "مساء الخير";
  const name = (displayName ?? "").trim();
  if (!name || name.includes("@")) return hello;
  return `${hello}، ${name.replace(/^أ\.\s*/u, "أستاذ ")}`;
}

/** Egyptian counting: 1 «جلسة واحدة», 2 «جلستين», 3–10 «N جلسات», 11+ «N جلسة». */
export function hearingsCount(n: number): string {
  if (n === 1) return "جلسة واحدة";
  if (n === 2) return "جلستين";
  return n <= 10 ? `${n} جلسات` : `${n} جلسة`;
}

/** «محكمة استئناف القاهرة» → «استئناف القاهرة» (the mockup drops the word محكمة). */
export const shortCourt = (court: string | null | undefined) => (court ?? "").trim().replace(/^محكمة\s+(?!الأسرة)/u, "") || "محكمة غير محددة";

/** Circuit tile number: «الدائرة 12 مدني كلي» → «12». */
export const circuitNo = (circuit: string | null | undefined) => normalizeDigits(circuit ?? "").match(/\d+/)?.[0] ?? "—";

/** «كريم المثالي — صحة ونفاذ عقد البيع» (the case title already ends in «— client ضد opponent»; keep its subject). */
export function rowTitle(h: HearingWithCase): string {
  const subject = (h.case.title ?? "").split(" — ")[0].replace(/^دعوى\s+/u, "").trim();
  const client = h.case.client_name?.trim();
  if (client && subject) return `${client} — ${subject}`;
  return client || subject || caseNumber(h, "long") || "دعوى بلا رقم";
}

/** Where the hearing is: «استئناف القاهرة · الدائرة 7 مدني» (the schema has no floor/hall, so the circuit stands in). */
export function placeLine(h: HearingWithCase): string {
  const circuit = h.case.circuit?.trim();
  return [shortCourt(h.case.court), circuit].filter(Boolean).join(" · ");
}

/** «8833 لسنة 2024» (desktop) or «8833/2024» (mobile). */
export function caseNumber(h: HearingWithCase, style: "long" | "short"): string {
  const { case_number: n, case_year: y } = h.case;
  if (!n) return "";
  if (!y) return n;
  return style === "long" ? `${n} لسنة ${y}` : `${n}/${y}`;
}

/**
 * The Clausia line, in parts so the view can bold the gold bit and drop the long bits on mobile:
 * `roll` + `where` (desktop only) + «.» + ` وفيه ` + `late.gold` (bold gold) + `late.tail` + `ask` (desktop only).
 * `late` is null when nothing is waiting for a decision; then `calm` (no gold) is said instead.
 */
export interface ClausiaLine {
  roll: string;
  where: string;
  late: { gold: string; tail: string } | null;
  calm: string;
  ask: string;
}

export function clausiaLine({ today, tomorrow, undecided }: { today: HearingWithCase[]; tomorrow: HearingWithCase[]; undecided: number }): ClausiaLine {
  const firstCourt = (hs: HearingWithCase[]) => shortCourt(hs[0].case.court);
  const allSameCourt = (hs: HearingWithCase[]) => new Set(hs.map((h) => shortCourt(h.case.court))).size === 1;
  const where = (hs: HearingWithCase[]) => (hs.length === 1 ? ` في ${firstCourt(hs)}` : allSameCourt(hs) ? `، ${hs.length === 2 ? "الاتنين" : "كلها"} في ${firstCourt(hs)}` : `، أولها في ${firstCourt(hs)}`);

  let roll: string;
  let at = "";
  if (today.length) { roll = `عندك ${hearingsCount(today.length)} النهارده`; at = where(today); }
  else if (tomorrow.length) { roll = `مفيش جلسات النهارده. بكره عندك ${hearingsCount(tomorrow.length)}`; at = where(tomorrow); }
  else roll = "مفيش جلسات النهارده ولا بكره";

  let late: ClausiaLine["late"] = null;
  let ask = "";
  let calm = "";
  if (undecided === 1) { late = { gold: "جلسة فاتت", tail: " لسه قرارها متسجلش." }; ask = " تحب نبدأ بيها؟"; }
  else if (undecided === 2) { late = { gold: "جلستين فاتوا", tail: " لسه قرارهم متسجلش." }; ask = " تحب نبدأ بيهم؟"; }
  else if (undecided > 2) { late = { gold: `${hearingsCount(undecided)} فاتت`, tail: " لسه قرارها متسجلش." }; ask = " تحب نبدأ بيها؟"; }
  else if (today.length || tomorrow.length) calm = " وكل الجلسات اللي فاتت قراراتها متسجلة.";
  else calm = " اكتبلي عن موكل جديد أو اسألني عن أي قضية.";
  return { roll, where: at, late, calm, ask };
}
