// Server-side "never guess" check (src/lib/assistant/turn.ts notInSource): proposed dates, years, case numbers,
// courts and circuits must be in the lawyer's words or an attached paper. Free (no LLM).
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-no-guess.ts
import { notInSource } from "@/lib/assistant/turn";

let fails = 0;
const check = (ok: boolean, what: string, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`); if (!ok) fails++; };
const t1 = ["المستأجر في شقتها بمدينة نصر مش بيدفع من يناير، وعايزين نرفع دعوى إخلاء"];
check(notInSource({ facts_date: "1/2026" }, t1).length === 1, "a year the lawyer didn't say is refused");
check(notInSource({ court: "محكمة مدينة نصر" }, t1).length === 1, "a place is not a court");
const t2 = ["رفعنا له دعوى رقم 4521 لسنة 2026 مدني كلي أمام محكمة جنوب الجيزة الابتدائية الدائرة 7", "عقد بيع مؤرخ 12/3/2024", "الجلسة اتأجلت لـ 5 نوفمبر 2026"];
check(notInSource({ case_number: "4521", case_year: 2026, court: "محكمة جنوب الجيزة الابتدائية", circuit: "الدائرة 7" }, t2).length === 0, "stated number, year, court and circuit pass");
check(notInSource({ date: "12/3/2024" }, t2).length === 0, "a stated numeric date passes");
check(notInSource({ next_date: "5/11/2026" }, t2).length === 0, "a stated date with a month name passes");
check(notInSource({ date: "13/3/2024" }, t2).length === 1, "a changed day is refused");
check(notInSource({ case_number: "4522" }, t2).length === 1, "a changed case number is refused");
check(notInSource({ court: "محكمة جنوب الجيزة الابتدائية" }, ["أمام محكمة جنوب الجيزة"]).length === 0, "adding «الابتدائية» to a named court passes");
check(notInSource({ date: "2025" }, ["في أوائل 2025"]).length === 0, "a stated year passes");
console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks passed");
process.exit(fails ? 1 : 0);
