// Appeal deadlines: the pure parts (no network, no database). Free.
//   1. reading the days from the REAL text of art. 227 and 252 (tests/fixtures/lawmill-articles.json, fetched once from LawMill)
//   2. number words, digits, the urgent clause, broken texts → «راجع المادة»
//   3. the date math: art. 15 counting, Fridays, approved holidays, a holiday then a Friday, a year with no reviewed holidays, rollover
// Run: npx tsx scripts/test-deadlines.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { daysBetween, isFriday, lastDay, reminderDates, type HolidayInfo } from "../src/lib/deadlines/compute";
import { dayCounts, parseAppealDays, parseCassationDays, sentencesOf, wordsToNumber } from "../src/lib/deadlines/parse";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const FX = JSON.parse(readFileSync(join(import.meta.dirname, "../tests/fixtures/lawmill-articles.json"), "utf8")) as Record<string, { text_ar: string }>;
const a227 = FX["227"].text_ar;
const a252 = FX["252"].text_ar;

// ---------- 1. the real articles ----------
{
  const d = parseAppealDays(a227, false);
  check("art. 227 default: 40 days (first sentence)", d.ok && d.days === 40, JSON.stringify(d));
  const u = parseAppealDays(a227, true);
  check("art. 227 urgent: 15 days (the «المستعجلة» sentence)", u.ok && u.days === 15, JSON.stringify(u));
  check("art. 227: the prosecutor's 60 days is never picked", !(d.ok && d.days === 60) && !(u.ok && u.days === 60));
  const c = parseCassationDays(a252);
  check("art. 252: 60 days (the article number ٢٥٠ in sentence 2 is never read)", c.ok && c.days === 60, JSON.stringify(c));
  check("art. 227 has three sentences", sentencesOf(a227).length === 3);
}

// ---------- 2. number words, digits, broken text ----------
const W = (s: string) => wordsToNumber(s.split(" "));
check("number words: أربعون / أربعين = 40", W("أربعون") === 40 && W("أربعين") === 40);
check("number words: خمسة عشر = 15", W("خمسة عشر") === 15);
check("number words: ستون / ستين = 60", W("ستون") === 60 && W("ستين") === 60);
check("number words: ثلاثون = 30, عشرة = 10, عشرون = 20", W("ثلاثون") === 30 && W("عشرة") === 10 && W("عشرون") === 20);
check("number words: خمسة وأربعون = 45, ثلاثة عشر = 13, أحد عشر = 11, اثنا عشر = 12", W("خمسة وأربعون") === 45 && W("ثلاثة عشر") === 13 && W("أحد عشر") === 11 && W("اثنا عشر") === 12);
check("number words: مائة وعشرون = 120", W("مائة وعشرون") === 120);
check("number words: a bad run is not a number (أربعون ستون, عشر خمسة, نص)", W("أربعون ستون") === null && W("خمسة خمسة") === null && W("ميعاد") === null);
check("digits: «40 يوما» and Arabic-Indic «٤٠ يوما»", dayCounts("ميعاد الاستئناف 40 يوما")[0] === 40 && dayCounts("ميعاد الاستئناف ٤٠ يوما")[0] === 40);
check("a number that is not followed by a day word is ignored", dayCounts("وفقا لحكم المادة ٢٥٠").length === 0);
check("with tashkeel: «أَرْبَعُونَ يَوْمًا»", dayCounts("ميعاد الاستئناف أَرْبَعُونَ يَوْمًا")[0] === 40);
{
  const broken = parseAppealDays("ميعاد الاستئناف عدة أيام ما لم ينص القانون على غير ذلك.\nويكون الميعاد في المواد المستعجلة أيا كانت المحكمة.", false);
  check("a text with no readable number → not ok («راجع المادة»)", !broken.ok);
  check("an urgent clause with no number → not ok", !parseAppealDays("ميعاد الاستئناف أربعون يوما.\nويكون الميعاد قصيرا في المواد المستعجلة.", true).ok);
  check("no urgent clause at all → not ok (never falls back to another sentence)", !parseAppealDays("ميعاد الاستئناف أربعون يوما ما لم ينص القانون على غير ذلك.", true).ok);
  check("the first sentence is not about الاستئناف → not ok", !parseAppealDays("ميعاد المعارضة عشرة أيام.\nميعاد الاستئناف أربعون يوما.", false).ok);
  check("two different numbers in the chosen sentence → not ok", !parseAppealDays("ميعاد الاستئناف أربعون يوما أو ستون يوما.", false).ok);
  check("an empty text → not ok", !parseAppealDays("", false).ok && !parseCassationDays("").ok);
  check("art. 252 text about something else → not ok", !parseCassationDays("ميعاد الاستئناف أربعون يوما.").ok);
  const alt = parseAppealDays("ميعاد الاستئناف خمسة عشر يوما ما لم ينص القانون على غير ذلك.", false);
  check("the days come from the text, not from a constant: «خمسة عشر» in the default sentence → 15", alt.ok && alt.days === 15);
}

// ---------- 3. the date math ----------
const none: HolidayInfo = { dates: new Set(), approvedYears: new Set([2026, 2027]) };
check("art. 15: 20/10/2026 + 40 days = Sunday 29/11/2026 (the mockup)", lastDay("2026-10-20", 40, none).last === "2026-11-29");
check("the start day is not counted: start + 1 day is the next day", lastDay("2026-10-20", 1, none).last === "2026-10-21");
{
  // 2026-11-27 is a Friday: start 2026-10-18 + 40 days
  check("2026-11-27 is a Friday", isFriday("2026-11-27"));
  const r = lastDay("2026-10-18", 40, none);
  check("a last day on a Friday moves to Saturday", r.raw === "2026-11-27" && r.last === "2026-11-28" && r.moved && !r.reviewHolidays, JSON.stringify(r));
}
{
  const h: HolidayInfo = { dates: new Set(["2026-11-29"]), approvedYears: new Set([2026]) };
  const r = lastDay("2026-10-20", 40, h);
  check("a last day on an approved holiday moves to the next working day", r.raw === "2026-11-29" && r.last === "2026-11-30" && r.moved, JSON.stringify(r));
}
{
  // holiday on Thursday 26/11 then Friday 27/11, then Saturday: last day raw = Thu 2026-11-26 (start 2026-10-17 + 40)
  const h: HolidayInfo = { dates: new Set(["2026-11-26"]), approvedYears: new Set([2026]) };
  const r = lastDay("2026-10-17", 40, h);
  check("a holiday followed by a Friday moves past both", r.raw === "2026-11-26" && r.last === "2026-11-28", JSON.stringify(r));
}
{
  // a Friday followed by an approved holiday on Saturday
  const h: HolidayInfo = { dates: new Set(["2026-11-28"]), approvedYears: new Set([2026]) };
  const r = lastDay("2026-10-18", 40, h);
  check("a Friday followed by a holiday moves past both", r.raw === "2026-11-27" && r.last === "2026-11-29", JSON.stringify(r));
}
{
  const h: HolidayInfo = { dates: new Set(["2026-11-30"]), approvedYears: new Set([2026]) };
  check("a holiday that is not the last day changes nothing", lastDay("2026-10-20", 40, h).last === "2026-11-29");
}
{
  const draftOnly: HolidayInfo = { dates: new Set(), approvedYears: new Set() };
  const r = lastDay("2026-10-20", 40, draftOnly);
  check("a year with no approved holidays → «راجع الإجازات»", r.reviewHolidays && r.last === "2026-11-29", JSON.stringify(r));
  const other: HolidayInfo = { dates: new Set(), approvedYears: new Set([2025]) };
  check("approved holidays of ANOTHER year do not count", lastDay("2026-10-20", 40, other).reviewHolidays);
  check("a reviewed year is not flagged", !lastDay("2026-10-20", 40, none).reviewHolidays);
}
{
  const crossing: HolidayInfo = { dates: new Set(), approvedYears: new Set([2026]) };
  const r = lastDay("2026-12-01", 40, crossing);
  check("year rollover: 1/12/2026 + 40 = 10/1/2027, and 2027 has no reviewed holidays → flagged", r.raw === "2027-01-10" && r.reviewHolidays, JSON.stringify(r));
  check("month rollover: 20/1/2026 + 15 = 4/2/2026", lastDay("2026-01-20", 15, none).raw === "2026-02-04");
  check("leap year: 20/2/2028 + 15 = 6/3/2028 (29 days in February 2028)", lastDay("2028-02-20", 15, { dates: new Set(), approvedYears: new Set([2028]) }).raw === "2028-03-06");
  check("a move across the new year: Thu 31/12/2026 (holiday) → 1/1/2027 (holiday and a Friday) → Saturday 2/1/2027",
    lastDay("2026-11-21", 40, { dates: new Set(["2026-12-31", "2027-01-01"]), approvedYears: new Set([2026, 2027]) }).last === "2027-01-02");
}
check("days left: from today to the last day", daysBetween("2026-10-20", "2026-11-29") === 40 && daysBetween("2026-11-29", "2026-11-29") === 0 && daysBetween("2026-11-30", "2026-11-29") === -1);
check("reminder dates: 7, 1 days before 29/11/2026 → 22/11 and 28/11", JSON.stringify(reminderDates("2026-11-29", [1, 7])) === JSON.stringify(["2026-11-22", "2026-11-28"]));
check("reminder dates drop duplicates and bad numbers", reminderDates("2026-11-29", [1, 1, 0, -2]).length === 1);

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
