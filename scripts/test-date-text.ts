// Dates in Arabic text: the per-value decision (src/lib/dates.ts) and the rendered markup (DateText in src/components/ui.tsx).
//   a pure number / date / time → numbers font + dir="ltr"; anything with a word → Arabic font + dir="rtl", numbers in <bdi>.
// No network, no database. Prints PASS/FAIL per check; exits 1 on any FAIL.
// Run: npx tsx scripts/test-date-text.ts   (no react-server condition: ui.tsx pulls in client components)
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { formatDayLabel, isNumericDate, splitNumbers } from "../src/lib/dates";
import { DateText } from "../src/components/ui";
import { upcomingDay } from "../src/components/home/text";
import { untilLabel } from "../src/components/cases/case-view";
import { arDate } from "../src/components/hearings/roll-text";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  (${detail})` : ""}`);
}
const html = (props: Parameters<typeof DateText>[0]) => renderToStaticMarkup(createElement(DateText, props));

// ---------- the decision ----------
for (const v of ["22/10/2026", "5/11", "9:00", "2026", "٢٢/١٠/٢٠٢٦", " 22/10/2026 ", "7:40"]) check(`numeric: «${v}»`, isNumericDate(v));
for (const v of ["النهارده", "بكرة", "الأحد 25", "جلسة 22/10", "يناير 2026", "الثلاثاء 20/10/2026", "9:00 صباحًا", "بعد 5 أيام", "تاريخ غير محدد", "—", "", "22/10 - بكرة"])
  check(`Arabic text: «${v}»`, !isNumericDate(v));

// ---------- the number runs ----------
const runs = (v: string) => splitNumbers(v).filter((p) => p.num).map((p) => p.text);
check("«الأحد 25» → 25", JSON.stringify(runs("الأحد 25")) === JSON.stringify(["25"]));
check("«جلسة 22/10» → 22/10 (one run, the slash stays inside)", JSON.stringify(runs("جلسة 22/10")) === JSON.stringify(["22/10"]));
check("«الثلاثاء 20/10/2026» → 20/10/2026", JSON.stringify(runs("الثلاثاء 20/10/2026")) === JSON.stringify(["20/10/2026"]));
check("«من 22/10 إلى 25/10» → two runs", JSON.stringify(runs("من 22/10 إلى 25/10")) === JSON.stringify(["22/10", "25/10"]));
check("«النهارده 9:00» → 9:00", JSON.stringify(runs("النهارده 9:00")) === JSON.stringify(["9:00"]));
check("«آخر يوم: 5/12» → 5/12 (the colon before a space is not part of it)", JSON.stringify(runs("آخر يوم: 5/12")) === JSON.stringify(["5/12"]));
check("pieces join back to the text", splitNumbers("جلسة 22/10 فاتت").map((p) => p.text).join("") === "جلسة 22/10 فاتت");
check("no digits → no runs", runs("النهارده").length === 0);

// ---------- the markup ----------
const num = html({ value: "22/10/2026" });
check("«22/10/2026» → dir=ltr + font-num, no bdi", num.includes('dir="ltr"') && num.includes("font-num") && !num.includes("<bdi"), num);
const time = html({ value: "9:00" });
check("«9:00» → dir=ltr + font-num", time.includes('dir="ltr"') && time.includes("font-num"), time);
for (const w of ["النهارده", "بكرة"]) {
  const h = html({ value: w });
  check(`«${w}» → dir=rtl, Arabic font, no font-num, no bdi`, h.includes('dir="rtl"') && h.includes("font-sans") && !h.includes("font-num") && !h.includes("<bdi"), h);
}
const sun = html({ value: "الأحد 25" });
check("«الأحد 25» → dir=rtl, 25 in <bdi>, no font-num", sun.includes('dir="rtl"') && sun.includes("<bdi>25</bdi>") && !sun.includes("font-num"), sun);
const ses = html({ value: "جلسة 22/10" });
check("«جلسة 22/10» → dir=rtl, 22/10 in <bdi>", ses.includes('dir="rtl"') && ses.includes("<bdi>22/10</bdi>"), ses);
const lbl = html({ value: formatDayLabel("2026-10-20") });
check("formatDayLabel («الثلاثاء 20/10/2026») → rtl + bdi", lbl.includes('dir="rtl"') && lbl.includes("<bdi>20/10/2026</bdi>") && lbl.includes("الثلاثاء"), lbl);
const iso = html({ iso: "2026-10-22" });
check("iso → «22/10/2026» numeric", iso.includes('dir="ltr"') && iso.includes(">22/10/2026<"), iso);
const unknown = html({ iso: "2026-10-22", precision: "unknown" });
check("an unknown date («تاريخ غير محدد») → Arabic text", unknown.includes('dir="rtl"') && !unknown.includes("font-num"), unknown);
check("className is kept", html({ value: "بكرة", className: "text-gold" }).includes("text-gold") && html({ value: "5/11", className: "text-gold" }).includes("text-gold"));

// ---------- the real labels the app makes ----------
const today = "2026-10-23";
for (const [iso, want] of [["2026-10-23", false], ["2026-10-24", false], ["2026-10-25", false], ["2026-11-12", true]] as const) {
  const l = upcomingDay(iso, today).label;
  check(`Home day «${l}» is ${want ? "numeric" : "Arabic text"}`, isNumericDate(l) === want);
}
check("untilLabel(5) «بعد 5 أيام» is Arabic text", !isNumericDate(untilLabel(5)));
check("arDate «الثلاثاء 20 أكتوبر 2026» is Arabic text", !isNumericDate(arDate("2026-10-20")));

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log("\nall passed");
