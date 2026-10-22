// Free unit test of the span mapper (src/lib/quote-match.ts): where a verified quote sits in the page's ORIGINAL text.
// No database, no model. Run: npx tsx scripts/test-cite-span.ts
//
// The match is done on normalised text (digits, diacritics, tatweel, hamza and ة/ه forms, spacing, punctuation), so the
// mapper keeps, for each normalised character, the original range it came from. Every case below checks that
// page.slice(start, end) is EXACTLY the words of the page (as the page writes them), not the quote as the model wrote it.
//
// Two occurrences: the FIRST one on the stated page is taken. The extraction gives a page and a 4–25 word quote, and
// the match is already narrowed to that page, so a repeat of the same 4+ words on one page is rare; when it does
// happen the first is the better guess (a claim sheet states a fact before it repeats it) and a wrong guess still
// lands the lawyer on the right page with the sentence in view. No later occurrence is "the one the model meant":
// the model never says where in the page, and asking it again is not allowed. If the stated page does not hold the
// quote at all, the nearest page that does is used.
import { findSpan, findSpanInPages, normalizeForMatch, normalizeWithMap, spanMatches } from "@/lib/quote-match";

const failures: string[] = [];
const check = (ok: boolean, label: string) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failures.push(label); };

/** the quote is found, and the slice of the page is exactly `want` */
function sliceIs(label: string, page: string, quote: string, want: string) {
  const s = findSpan(page, quote);
  const got = s ? page.slice(s.start, s.end) : null;
  check(got === want, `${label}${got === want ? "" : `  (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
  if (s) check(spanMatches(page, s, quote), `${label}: the span still reads as the quote`);
}

const PLAIN = "حيث إن المدعية تمتلك الشقة رقم 12 بالعقار الكائن بمدينة نصر، وقد بموجب عقد إيجار مؤرخ 1/9/2022 استأجر المدعى عليه الشقة المذكورة لمدة سنة تتجدد تلقائيًا، نظير أجرة شهرية.";

console.log("— the map agrees with the matcher");
for (const t of [PLAIN, "", "  \n  ", "اَلْمُدَّعِي ـــ أَحْمَد ١٢٣", "a İ Σ ΑΣ b 😀 ثم", "ﻻ ﷲ"]) {
  const m = normalizeWithMap(t);
  check(!!m && m.norm === normalizeForMatch(t), `normalizeWithMap(${JSON.stringify(t.slice(0, 20))}) = normalizeForMatch`);
}

console.log("— exact text");
sliceIs("quote copied as written", PLAIN, "بموجب عقد إيجار مؤرخ 1/9/2022 استأجر المدعى عليه", "بموجب عقد إيجار مؤرخ 1/9/2022 استأجر المدعى عليه");
sliceIs("quote with its own punctuation/quote marks", PLAIN, "«بموجب عقد إيجار مؤرخ 1/9/2022»", "بموجب عقد إيجار مؤرخ 1/9/2022");

console.log("— diacritics and tatweel");
const DIAC = "قَرَّرَتِ المَحْكَمَةُ تَأْجِيلَ الدَّعْوَى لِجَلْسَةِ الْيَوْمِ التَّالِي";
sliceIs("page has diacritics, quote has none", DIAC, "تأجيل الدعوى لجلسة", "تَأْجِيلَ الدَّعْوَى لِجَلْسَةِ");
sliceIs("quote has diacritics, page has none", "قررت المحكمة تأجيل الدعوى لجلسة اليوم التالي", "تَأْجِيلَ الدَّعْوَى", "تأجيل الدعوى");
sliceIs("tatweel in the page", "حيث إن المـــدعـــي يطلـــب الحكـــم بالإخـــلاء", "المدعي يطلب الحكم", "المـــدعـــي يطلـــب الحكـــم");
sliceIs("tatweel in the quote", "حيث إن المدعي يطلب الحكم بالإخلاء", "المـدعـي يطلـب", "المدعي يطلب");

console.log("— ة/ه, hamza and alef forms, ى/ي");
sliceIs("ة in the page, ه in the quote", "تمتلك المدعية الشقة", "المدعيه الشقه", "المدعية الشقة");
sliceIs("أ/إ/آ in the page, ا in the quote", "أنذرت المدعية المدعى عليه إنذارًا رسميًا وآخر", "انذرت المدعيه المدعى عليه انذارا", "أنذرت المدعية المدعى عليه إنذارًا");
sliceIs("أ in the quote, ا in the page", "انذرت المدعيه المدعى عليه", "أنذرت المدعية", "انذرت المدعيه");
sliceIs("ى in the page, ي in the quote", "المدعى عليه امتنع عن السداد", "المدعي عليه امتنع", "المدعى عليه امتنع");

console.log("— Arabic-Indic vs Western digits");
const IND = "بموجب عقد إيجار مؤرخ ١/٩/٢٠٢٢ استأجر المدعى عليه الشقة رقم ١٢";
sliceIs("Arabic digits in the page, Western in the quote", IND, "عقد إيجار مؤرخ 1/9/2022 استأجر", "عقد إيجار مؤرخ ١/٩/٢٠٢٢ استأجر");
sliceIs("Western digits in the page, Arabic in the quote", "عقد إيجار مؤرخ 1/9/2022 استأجر المدعى عليه", "عقد إيجار مؤرخ ١/٩/٢٠٢٢ استأجر", "عقد إيجار مؤرخ 1/9/2022 استأجر");
sliceIs("Persian digits", "الشقة رقم ۱۲ بالعقار", "الشقة رقم 12", "الشقة رقم ۱۲");

console.log("— extra spaces and newlines in the page");
const SPACED = "حيث إن المدعية\n   تمتلك   الشقة\n\nرقم 12  بالعقار\tالكائن";
sliceIs("the quote runs across lines and runs of spaces", SPACED, "المدعية تمتلك الشقة رقم 12 بالعقار", "المدعية\n   تمتلك   الشقة\n\nرقم 12  بالعقار");
sliceIs("the page splits a word's neighbours with a table bar", "| الاسم | سامح التجريبي |\n| الصفة | مدعٍ |", "الاسم سامح التجريبي", "الاسم | سامح التجريبي");
sliceIs("the quote has extra spaces", "الشقة رقم 12 بالعقار", "الشقة    رقم\n12   بالعقار", "الشقة رقم 12 بالعقار");

console.log("— the page start and end");
sliceIs("quote at the very start", PLAIN, "حيث إن المدعية تمتلك الشقة", "حيث إن المدعية تمتلك الشقة");
const lastWords = "تتجدد تلقائيًا، نظير أجرة شهرية.";
const end = findSpan(PLAIN, "تتجدد تلقائيا نظير أجرة شهرية");
check(!!end && end.start === PLAIN.indexOf("تتجدد") && end.end === PLAIN.length - 1, "quote at the very end: ends before the final full stop (punctuation is not part of the match)");
check(!!end && PLAIN.slice(end.start, end.end) === lastWords.slice(0, -1), "quote at the very end: the slice is the words as the page writes them");
sliceIs("the whole page is the quote", "لا شيء", "لا شيء", "لا شيء");
sliceIs("leading and trailing space in the page", "  \n الشقة رقم 12 \n ", "الشقة رقم 12", "الشقة رقم 12");

console.log("— two occurrences: the first one");
const TWICE = "المدعى عليه امتنع عن السداد. ثم قال: المدعى عليه امتنع عن السداد مرة أخرى.";
const two = findSpan(TWICE, "المدعى عليه امتنع عن السداد");
check(!!two && two.start === 0 && TWICE.slice(two.start, two.end) === "المدعى عليه امتنع عن السداد", "first occurrence taken (start 0)");
check(!!two && TWICE.indexOf("المدعى عليه امتنع عن السداد", two.end) > two.end, "…and there is a second one that is not taken");

console.log("— the quote is not on the page");
check(findSpan(PLAIN, "جملة ليست في الصفحة أبدا") === null, "no span for a quote that is not there");
check(findSpan(PLAIN, "") === null && findSpan(PLAIN, null) === null && findSpan(PLAIN, undefined) === null, "no span for an empty quote");
check(findSpan(PLAIN, "ا") === null && findSpan(PLAIN, "،.") === null, "no span for a quote shorter than 2 letters, or with no letters");
check(findSpan("", "الشقة") === null, "no span in an empty page");
// the old matcher's known weak spot (verifyQuote strips «/»): 5/3/2024 is «532024» and sits inside 15/3/2024
check(findSpan("بتاريخ 15/3/2024", "5/3/2024") !== null, "(known) a numeric date inside a longer one matches, as verifyQuote already does");

console.log("— pages: the named page first, else the nearest that holds the quote");
const PAGES = ["الصفحة الأولى فيها بيانات القضية", "الصفحة الثانية فيها الوقائع: عقد إيجار مؤرخ 1/9/2022", "الصفحة الثالثة فيها الطلبات إخلاء العين", "الصفحة الرابعة عقد إيجار مؤرخ 1/9/2022 مرة ثانية"];
const p2 = findSpanInPages(PAGES, "عقد إيجار مؤرخ 1/9/2022", 2);
check(p2?.page === 2 && PAGES[1].slice(p2.start, p2.end) === "عقد إيجار مؤرخ 1/9/2022", "named page holds it: that page, not the later copy on page 4");
const p3 = findSpanInPages(PAGES, "عقد إيجار مؤرخ 1/9/2022", 3);
check(p3?.page === 2, "the model said page 3 but it is on 2 and 4: the nearer one (2) wins");
const p1 = findSpanInPages(PAGES, "إخلاء العين", 1);
check(p1?.page === 3 && PAGES[2].slice(p1.start, p1.end) === "إخلاء العين", "the model said page 1, it is on page 3: page 3");
check(findSpanInPages(PAGES, "ليست هنا أبدا", 2) === null, "not on any page: null");
check(findSpanInPages(PAGES, "الصفحة الأولى", 99)?.page === 1, "an out-of-range page number is ignored");

console.log("— a stored span is trusted only when it still reads as the quote");
check(!spanMatches(PLAIN, { start: 0, end: 10 }, "بموجب عقد إيجار"), "a span on other words is refused");
check(!spanMatches(PLAIN, { start: 5, end: 5 }, "حيث"), "an empty span is refused");
check(!spanMatches(PLAIN, { start: 0, end: 99999 }, "حيث"), "a span past the page end is refused");
check(!spanMatches(PLAIN, { start: -1, end: 4 }, "حيث"), "a negative start is refused");

console.log("— a long page is fast");
const big = (PLAIN + "\n").repeat(400);
const t0 = performance.now();
const bs = findSpan(big, "استأجر المدعى عليه الشقة المذكورة لمدة سنة");
const ms = performance.now() - t0;
check(!!bs && big.slice(bs.start, bs.end).startsWith("استأجر") && ms < 500, `${(big.length / 1000).toFixed(0)}K characters mapped in ${ms.toFixed(0)} ms`);

console.log(failures.length ? `\nFAILED ${failures.length}: ${failures.join(" | ")}` : "\nALL CHECKS PASSED");
process.exit(failures.length ? 1 : 0);
