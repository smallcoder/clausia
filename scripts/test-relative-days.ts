// Relative days in the lawyer's words (src/lib/relative-days.ts) and the never-guess guard that accepts them.
// Fixed message instants, no clock, no LLM, no database: free.
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-relative-days.ts
import { notInSource } from "@/lib/assistant/turn";
import { cairoDateOf, resolveRelativeDays, type RelativeDay } from "@/lib/relative-days";

let fails = 0;
const check = (ok: boolean, what: string, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`); if (!ok) fails++; };
const show = (r: RelativeDay[]) => r.map((x) => `${x.word}=${x.iso}`).join(" | ") || "none";
/** one word in `text` resolves to `iso` (and only one word is found) */
function one(text: string, at: string, iso: string, what: string) {
  const r = resolveRelativeDays(text, at);
  check(r.length === 1 && r[0].iso === iso, what, show(r));
}

// Wednesday 21/10/2026, 10:00 Cairo (07:00 UTC; Egypt is on summer time, UTC+3, until late October)
const WED = "2026-10-21T07:00:00Z";
// Thursday 22/10/2026
const THU = "2026-10-22T09:00:00Z";

// --- the simple words
one("الجلسة النهارده", WED, "2026-10-21", "النهارده = the message day");
one("انهارده رحت المحكمة", WED, "2026-10-21", "انهارده = the message day");
one("النهاردة", WED, "2026-10-21", "النهاردة (with ة) = the message day");
one("الجلسة بكرة", WED, "2026-10-22", "بكرة = +1");
one("الجلسة بكره الصبح", WED, "2026-10-22", "بكره = +1");
one("الجلسة بعد بكرة", WED, "2026-10-23", "بعد بكرة = +2 (and «بكرة» inside it is not counted again)");
one("بعد بكره إن شاء الله", WED, "2026-10-23", "بعد بكره = +2");
one("اتفصل امبارح", WED, "2026-10-20", "امبارح = −1");
one("اتفصل إمبارح", WED, "2026-10-20", "إمبارح = −1");
one("اتأجلت لبكرة", WED, "2026-10-22", "«لبكرة» (with the clitic ل) = +1");
one("وبكرة عندنا جلسة", WED, "2026-10-22", "«وبكرة» = +1");
check(resolveRelativeDays("الجلسة بكرة", WED)[0].label === "الخميس 22/10/2026", "the label is «الخميس 22/10/2026»", resolveRelativeDays("الجلسة بكرة", WED)[0].label);
check(resolveRelativeDays("الجلسة بكرة", WED)[0].word === "بكرة", "the word keeps the lawyer's spelling «بكرة»", resolveRelativeDays("الجلسة بكرة", WED)[0].word);
check(resolveRelativeDays("لبكرة", WED)[0].word === "بكرة", "the clitic is not part of the word");

// --- «<day> الجاي» (said on Wednesday 21/10)
one("السبت الجاي", WED, "2026-10-24", "السبت الجاي = 24/10");
one("الحد الجاي", WED, "2026-10-25", "الحد الجاي = 25/10");
one("الأحد الجاي", WED, "2026-10-25", "الأحد الجاي = 25/10");
one("الاتنين الجاي", WED, "2026-10-26", "الاتنين الجاي = 26/10");
one("الاثنين الجاي", WED, "2026-10-26", "الاثنين الجاي = 26/10");
one("التلات الجاي", WED, "2026-10-27", "التلات الجاي = 27/10");
one("الثلاثاء الجاي", WED, "2026-10-27", "الثلاثاء الجاي = 27/10");
one("الأربع الجاي", WED, "2026-10-28", "الأربع الجاي said on a Wednesday = +7");
one("الأربعاء الجاي", WED, "2026-10-28", "الأربعاء الجاي said on a Wednesday = +7");
one("الخميس الجاي", WED, "2026-10-22", "الخميس الجاي said on a Wednesday = +1");
one("الجمعة الجاية", WED, "2026-10-23", "الجمعة الجاية = 23/10");
one("الجلسة يوم الخميس الجاي", WED, "2026-10-22", "«يوم الخميس الجاي» = 22/10");
one("اتأجلت للخميس الجاي", WED, "2026-10-22", "«للخميس الجاي» = 22/10");
one("اتأجلت ليوم الخميس اللي جاي", WED, "2026-10-22", "«ليوم الخميس اللي جاي» = 22/10");
one("الخميس الجاي", THU, "2026-10-29", "«الخميس الجاي» said on a Thursday = +7");
check(resolveRelativeDays("للخميس الجاي", WED)[0].word === "الخميس الجاي", "«للخميس» is shown as «الخميس الجاي»", resolveRelativeDays("للخميس الجاي", WED)[0].word);

// --- «<day> اللي فات» (said on Wednesday 21/10)
one("الجمعة اللي فات", WED, "2026-10-16", "الجمعة اللي فات = 16/10");
one("الجمعة اللي فاتت", WED, "2026-10-16", "الجمعة اللي فاتت = 16/10");
one("الحد اللي فات", WED, "2026-10-18", "الحد اللي فات = 18/10");
one("التلات اللي فات", WED, "2026-10-20", "التلات اللي فات = −1");
one("الأربع اللي فات", WED, "2026-10-14", "الأربع اللي فات said on a Wednesday = −7");
one("السبت الفات", WED, "2026-10-17", "«السبت الفات» = 17/10");

// --- month and year rollover
one("بكرة", "2026-10-31T10:00:00Z", "2026-11-01", "بكرة on 31/10 = 1/11");
one("امبارح", "2026-11-01T10:00:00Z", "2026-10-31", "امبارح on 1/11 = 31/10");
one("بعد بكرة", "2026-12-30T10:00:00Z", "2027-01-01", "بعد بكرة on 30/12/2026 = 1/1/2027");
one("امبارح", "2027-01-01T10:00:00Z", "2026-12-31", "امبارح on 1/1/2027 = 31/12/2026");
one("الاتنين الجاي", "2026-12-31T10:00:00Z", "2027-01-04", "الاتنين الجاي from Thursday 31/12/2026 = 4/1/2027");
one("الجمعة اللي فات", "2027-01-02T10:00:00Z", "2027-01-01", "الجمعة اللي فات from Saturday 2/1/2027 = 1/1/2027");
one("بكرة", "2028-02-28T10:00:00Z", "2028-02-29", "بكرة on 28/2/2028 (leap year) = 29/2");

// --- Cairo midnight: the Cairo date counts, not the UTC date
check(cairoDateOf("2026-10-21T22:30:00Z") === "2026-10-22", "22:30 UTC on 21/10 is 22/10 in Cairo", cairoDateOf("2026-10-21T22:30:00Z"));
one("النهارده", "2026-10-21T22:30:00Z", "2026-10-22", "النهارده at 22:30 UTC = the next Cairo day");
one("بكرة", "2026-10-21T22:30:00Z", "2026-10-23", "بكرة at 22:30 UTC = Cairo day + 1");
one("النهارده", "2026-12-15T21:59:00Z", "2026-12-15", "21:59 UTC in winter (UTC+2) is still the same Cairo day");
one("النهارده", "2026-12-15T22:01:00Z", "2026-12-16", "22:01 UTC in winter (UTC+2) is the next Cairo day");

// --- vague phrases: nothing is resolved
for (const v of ["الأسبوع الجاي", "الشهر الجاي", "أول الشهر", "آخر الأسبوع", "قريب", "كمان كام يوم", "يوم الخميس", "الخميس", "من يومين", "السنة اللي فاتت", "الأسبوع اللي فات", "مبكرة", "بكرية"]) {
  const r = resolveRelativeDays(`الجلسة ${v}`, WED);
  check(r.length === 0, `«${v}» is not resolved`, show(r));
}

// --- more than one word in a message, in order
{
  const r = resolveRelativeDays("اتفصل امبارح، والجلسة الخميس الجاي، ومش بكرة", WED);
  check(show(r) === "امبارح=2026-10-20 | الخميس الجاي=2026-10-22 | بكرة=2026-10-22", "three words, in order", show(r));
}

// --- the never-guess guard
const said = ["الجلسة بكرة في محكمة شمال القاهرة"];
const resolved = resolveRelativeDays(said[0], WED);
check(notInSource({ date: "22/10/2026" }, said).length === 1, "without the resolved list, «22/10/2026» for «بكرة» is refused (the old rule)");
check(notInSource({ date: "22/10/2026" }, said, resolved).length === 0, "a date equal to the resolved «بكرة» is accepted");
check(notInSource({ date: "23/10/2026" }, said, resolved).length === 1, "a different date (a guess) is still refused");
check(notInSource({ date: "10/2026" }, said, resolved).length === 1, "a month-only date is not backed by a resolved day");
check(notInSource({ next_date: "22/10/2026", case_number: "22" }, said, resolved).length === 1, "the resolved date does not back other values (case number «22»)");
{
  // the relative word is only in a paper: the paper's text is never resolved, so the guard refuses and Clausia asks
  const lawyer = "دي صحيفة الدعوى، سجّل الجلسة";
  const paper = "وحددت لنظرها جلسة بكرة أمام الدائرة 5";
  const r = resolveRelativeDays(lawyer, WED); // the turn resolves the lawyer's text only
  check(r.length === 0, "the lawyer's text has no relative word");
  check(notInSource({ date: "22/10/2026" }, [lawyer, paper], r).length === 1, "«بكرة» only in a paper: the date is refused");
}
check(notInSource({ appeal_deadline: "28/10/2026" }, ["آخر ميعاد للطعن الأربع الجاي"], resolveRelativeDays("آخر ميعاد للطعن الأربع الجاي", WED)).length === 0, "an appeal deadline the lawyer said as «الأربع الجاي» is accepted");

console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks passed");
process.exit(fails ? 1 : 0);
