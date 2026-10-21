/**
 * Home wording, built from real data (no LLM call): the long date, the greeting, Arabic counts,
 * the Clausia sentence and the «آخر ما سجّلته» line. Pure functions — no DB access.
 */
import { formatDmy, normalizeDigits, parseDmy } from "@/lib/dates";
import type { HearingWithCase } from "@/lib/hearings";
import { DECISION } from "@/lib/labels";
import type { ProposalOp } from "@/lib/proposals";

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

/** «8833 لسنة 2024» (desktop) or «8833/2024» (mobile). */
export function caseNumber(h: HearingWithCase, style: "long" | "short"): string {
  const { case_number: n, case_year: y } = h.case;
  if (!n) return "";
  if (!y) return n;
  return style === "long" ? `${n} لسنة ${y}` : `${n}/${y}`;
}

/** The Clausia line: today's (or tomorrow's) roll, then the hearings that still need a decision. */
export function clausiaSentence({ today, tomorrow, undecided }: { today: HearingWithCase[]; tomorrow: HearingWithCase[]; undecided: number }): string {
  const firstCourt = (hs: HearingWithCase[]) => shortCourt(hs[0].case.court);
  const allSameCourt = (hs: HearingWithCase[]) => new Set(hs.map((h) => shortCourt(h.case.court))).size === 1;
  const where = (hs: HearingWithCase[]) => (hs.length === 1 ? ` في ${firstCourt(hs)}` : allSameCourt(hs) ? `، ${hs.length === 2 ? "الاتنين" : "كلها"} في ${firstCourt(hs)}` : `، أولها في ${firstCourt(hs)}`);

  let roll: string;
  if (today.length) roll = `عندك ${hearingsCount(today.length)} النهارده${where(today)}.`;
  else if (tomorrow.length) roll = `مفيش جلسات النهارده. بكره عندك ${hearingsCount(tomorrow.length)}${where(tomorrow)}.`;
  else roll = "مفيش جلسات النهارده ولا بكره.";

  let late = "";
  if (undecided === 1) late = " وفيه جلسة فاتت لسه قرارها متسجلش. تحب نبدأ بيها؟";
  else if (undecided === 2) late = " وفيه جلستين فاتوا لسه قرارهم متسجلش. تحب نبدأ بيهم؟";
  else if (undecided > 2) late = ` وفيه ${hearingsCount(undecided)} فاتت لسه قرارها متسجلش. تحب نبدأ بيها؟`;
  else if (!today.length && !tomorrow.length) late = " اكتبلي عن موكل جديد أو اسألني عن أي قضية.";
  return roll + late;
}

/* ---------- «آخر ما سجّلته» ---------- */

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const d = (v: unknown) => { const p = parseDmy(s(v)); return p ? formatDmy(p.iso, p.precision) : null; };

/** One confirmed op in Clausia's voice (past tense, first person). */
function describeOp(o: ProposalOp): string {
  const a = o.args;
  switch (o.tool) {
    case "create_client": return s(a.name) ? `أضفت الموكل ${s(a.name)}` : "أضفت موكلًا جديدًا";
    case "create_case": {
      const no = s(a.case_number) ?? (typeof a.case_number === "number" ? String(a.case_number) : null);
      return no ? `فتحت الدعوى ${no}${a.case_year ? ` لسنة ${a.case_year}` : ""}` : "فتحت دعوى جديدة";
    }
    case "update_case": return "عدّلت بيانات الدعوى";
    case "add_party": return s(a.name) ? `أضفت ${s(a.name)} طرفًا في الدعوى` : "أضفت طرفًا في الدعوى";
    case "add_fact": return "أضفت واقعة";
    case "add_request": return "أضفت طلبًا لموكلنا";
    case "add_argument": return a.side === "ours" ? "أضفت دفاعًا لنا" : "أضفت دفعًا للخصم";
    case "add_hearing": return d(a.date) ? `أضفت جلسة ${d(a.date)}` : "أضفت جلسة";
    case "record_decision": {
      const label = DECISION[a.decision as keyof typeof DECISION];
      const next = d(a.next_date);
      return `سجّلت قرار الجلسة${label ? ` «${label}»` : ""}${next ? ` لجلسة ${next}` : ""}`;
    }
    case "add_judgment": return "سجّلت الحكم";
    case "attach_document": return "ربطت مستندًا بالدعوى";
    default: return "سجّلت بندًا";
  }
}

/** «وبند تاني» / «وبندين كمان» / «و4 بنود تانية» */
function others(n: number): string {
  if (n === 1) return " وبند تاني";
  if (n === 2) return " وبندين كمان";
  return n <= 10 ? ` و${n} بنود تانية` : ` و${n} بند تاني`;
}

/** Cairo clock time «11:42 ص» (with «d/m/yyyy» first when it was not today). */
export function clockLabel(ts: string, todayIsoCairo: string): string {
  const at = new Date(ts);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(at);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "";
  const pm = parts.find((p) => p.type === "dayPeriod")?.value.toUpperCase() === "PM";
  const time = `${hh}:${mm} ${pm ? "م" : "ص"}`;
  return day === todayIsoCairo ? time : `${formatDmy(day)} ${time}`;
}

/**
 * «أضفت جلسة 5/11/2026 لقضية عادل النموذجي، بعد تأكيدك» from the confirmed ops of the latest decided card.
 * `caseName` is left out when the card itself opened the case.
 */
export function describeProposal(ops: ProposalOp[], caseName: string | null): string | null {
  const done = ops.filter((o) => o.status === "confirmed");
  if (!done.length) return null;
  const openedCase = done.some((o) => o.tool === "create_case" || o.tool === "create_client");
  // the op that says most about the card leads; the rest are counted
  const lead = done.find((o) => o.tool === "record_decision") ?? done.find((o) => o.tool === "create_client") ?? done.find((o) => o.tool === "create_case")
    ?? done.find((o) => o.tool === "add_hearing") ?? done.find((o) => o.tool === "add_judgment") ?? done[0];
  const rest = done.length - 1;
  const forCase = caseName && !openedCase ? ` لقضية ${caseName}` : "";
  return `${describeOp(lead)}${forCase}${rest ? others(rest) : ""}، بعد تأكيدك`;
}
