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
check(notInSource({ court: "المحكمة الاقتصادية بالقاهرة" }, ["الدعوى قدام المحكمة الاقتصادية بالقاهرة الدائرة 4"]).length === 0, "a court that starts with «المحكمة» passes");
check(notInSource({ court: "محكمة الاقتصادية بالقاهرة" }, ["أمام المحكمة الاقتصادية بالقاهرة"]).length === 0, "«محكمة» vs «المحكمة» is the same court");
check(notInSource({ court: "محكمة استئناف القاهرة" }, ["الدعوى في استئناف القاهرة"]).length === 0, "a court said without the word «محكمة» passes when it names its kind");
check(notInSource({ court: "محكمة استئناف" }, ["هنطعن بالاستئناف"]).length === 1, "one kind word alone is not a court");
check(notInSource({ date: "5/11/2026" }, ["تاريخ الجلسة: 2026-11-05"]).length === 0, "an ISO date in a paper passes");
check(notInSource({ circuit: "الدائرة 3" }, ["عقد مؤرخ 3/1/2024"]).length === 1, "a circuit number that is only part of a date is refused");
check(notInSource({ circuit: "الدائرة 4" }, ["الدائرة 4 تجاري"]).length === 0, "a stated circuit number passes");
check(notInSource({ circuit: "4" }, ["دائرة رقم 4"]).length === 0, "«دائرة رقم 4» passes");
console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks passed");
process.exit(fails ? 1 : 0);
