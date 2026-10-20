// Seeds ~10 realistic demo cases into the DEMO lawyer's office (office A).
// Signs in as the DEMO user with the publishable key, so office_id defaults and RLS are real.
// Idempotent: deletes previous seed clients (notes = 'seed') and their cases first; cascades do the rest.
// All names are clearly fake. Hearings are placed around TODAY (Africa/Cairo).
// Run: npm run seed
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/db/types";
import { todayIso, addDaysIso } from "../src/lib/dates";

type T = Database["public"]["Tables"];
type Prov = { review_status?: "suggested" | "confirmed"; created_by_kind?: "lawyer" | "model"; source_kind?: "chat" | "document" | "manual"; source_quote?: string | null };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const db = createClient<Database>(url, key, { auth: { persistSession: false } });

const { error: authErr } = await db.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
if (authErr) throw new Error(`sign-in failed: ${authErr.message}`);

const TODAY = todayIso();
const d = (n: number) => addDaysIso(TODAY, n);
const SUGGESTED: Prov = { review_status: "suggested", created_by_kind: "model", source_kind: "chat" };

/** Bulk inserts send the union of keys, so every row must carry the provenance columns explicitly. */
const P = (r: Prov) => ({ review_status: "confirmed" as const, created_by_kind: "lawyer" as const, source_kind: "manual" as const, source_quote: null, ...r });

function must<R extends { data: unknown; error: { message: string } | null }>(r: R, what: string): NonNullable<R["data"]> {
  if (r.error || r.data === null) throw new Error(`${what}: ${r.error?.message ?? "no data"}`);
  return r.data as NonNullable<R["data"]>;
}

// ---------- cleanup ----------
{
  const old = must(await db.from("clients").select("id").eq("notes", "seed"), "list seed clients");
  const ids = old.map((c) => c.id);
  if (ids.length) {
    const oldCases = must(await db.from("cases").select("id").in("client_id", ids), "list seed cases");
    const caseIds = oldCases.map((c) => c.id);
    if (caseIds.length) {
      // later-stage cases point at earlier ones (on delete set null) — fine to delete in one go
      must(await db.from("cases").delete().in("id", caseIds).select("id"), "delete seed cases");
    }
    must(await db.from("clients").delete().in("id", ids).select("id"), "delete seed clients");
    console.log(`cleanup: removed ${caseIds.length} cases, ${ids.length} clients`);
  }
}

// ---------- helpers ----------
async function client(name: string, kind: "person" | "company", phone: string | null, address: string | null) {
  return must(await db.from("clients").insert({ name, kind, phone, address, notes: "seed" }).select("id").single(), `client ${name}`).id;
}

async function kase(row: T["cases"]["Insert"]) {
  const c = must(await db.from("cases").insert(row).select("id, case_number, case_year, title").single(), `case ${row.title}`);
  const title = c.case_number ? `الدعوى ${c.case_number}${c.case_year ? ` لسنة ${c.case_year}` : ""}` : c.title ?? null;
  must(await db.from("chat_threads").insert({ case_id: c.id, title }).select("id").single(), "thread");
  return c.id;
}

async function parties(caseId: string, rows: (Omit<T["case_parties"]["Insert"], "case_id"> & Prov)[]) {
  must(await db.from("case_parties").insert(rows.map((r) => ({ ...P(r), ...r, case_id: caseId }))).select("id"), "parties");
}
async function facts(caseId: string, rows: (Omit<T["case_facts"]["Insert"], "case_id"> & Prov)[]) {
  must(await db.from("case_facts").insert(rows.map((r, i) => ({ ...P(r), sort_order: i + 1, ...r, case_id: caseId }))).select("id"), "facts");
}
async function requests(caseId: string, rows: (Omit<T["case_requests"]["Insert"], "case_id"> & Prov)[]) {
  must(await db.from("case_requests").insert(rows.map((r) => ({ ...P(r), ...r, case_id: caseId }))).select("id"), "requests");
}
async function args(caseId: string, rows: (Omit<T["case_arguments"]["Insert"], "case_id"> & Prov)[]) {
  must(await db.from("case_arguments").insert(rows.map((r) => ({ ...P(r), ...r, case_id: caseId }))).select("id"), "arguments");
}

/** A chain of hearings: every earlier one is "postponed" to the next; links previous/next both ways. */
async function hearingChain(
  caseId: string,
  chain: { date: string; purpose?: string | null; decision?: T["hearings"]["Insert"]["decision_type"]; decision_text?: string | null; next_requirements?: string | null }[],
) {
  const ids: string[] = [];
  for (const h of chain) {
    const row = must(
      await db.from("hearings").insert({
        case_id: caseId, hearing_date: h.date, purpose: h.purpose ?? null,
        decision_type: h.decision ?? null, decision_text: h.decision_text ?? null, next_requirements: h.next_requirements ?? null,
        decided_at: h.decision ? new Date(`${h.date}T12:00:00+02:00`).toISOString() : null,
        previous_hearing_id: ids.length ? ids[ids.length - 1] : null,
      }).select("id").single(),
      "hearing",
    );
    if (ids.length) must(await db.from("hearings").update({ next_hearing_id: row.id }).eq("id", ids[ids.length - 1]).select("id"), "link hearing");
    ids.push(row.id);
  }
  return ids;
}

// ---------- 1. civil: صحة ونفاذ عقد بيع (first instance) + its appeal ----------
const c1 = await client("سامح التجريبي", "person", "01000000001", "مدينة نصر، القاهرة");
const civil1 = await kase({
  client_id: c1, title: "صحة ونفاذ عقد بيع شقة — سامح التجريبي ضد كريم المثالي", case_number: "4512", case_year: 2024,
  court: "محكمة شمال القاهرة الابتدائية", circuit: "الدائرة 12 مدني", case_type: "مدني", stage: "first_instance", status: "judged",
  client_role: "plaintiff", facts_date: "2023-03-15", facts_date_precision: "day",
  summary: "دعوى صحة ونفاذ عقد بيع ابتدائي لشقة بمدينة نصر؛ امتنع البائع عن التوقيع على العقد النهائي رغم سداد كامل الثمن.",
});
await parties(civil1, [
  { name: "سامح التجريبي", role: "plaintiff", is_our_client: true, client_id: c1 },
  { name: "كريم المثالي", role: "defendant", is_our_client: false, representative: "أ. هشام الافتراضي المحامي" },
]);
await facts(civil1, [
  { fact_date: "2023-03-15", date_precision: "day", date_text: "15/3/2023", text: "تحرر عقد بيع ابتدائي بين الموكل والمدعى عليه عن شقة بالدور الرابع بعقار بمدينة نصر بثمن إجمالي 1,200,000 جنيه." },
  { fact_date: "2023-06-01", date_precision: "month", date_text: "يونيو 2023", text: "سدد الموكل باقي الثمن نقدًا وحرر المدعى عليه مخالصة بخط يده." },
  { fact_date: "2024-01-10", date_precision: "day", date_text: "10/1/2024", text: "أنذر الموكل المدعى عليه على يد محضر بالحضور للشهر العقاري للتوقيع على العقد النهائي، فلم يحضر." },
]);
await requests(civil1, [
  { text: "الحكم بصحة ونفاذ عقد البيع الابتدائي المؤرخ 15/3/2023.", kind: "primary" },
  { text: "إلزام المدعى عليه بالمصروفات ومقابل أتعاب المحاماة.", kind: "primary" },
]);
await args(civil1, [
  { side: "opponent", kind: "substantive_defense", text: "الدفع بعدم سداد كامل الثمن، والمنازعة في توقيعه على المخالصة." },
  { side: "ours", kind: "argument", text: "المخالصة صادرة بخط يد المدعى عليه ولم يطعن عليها بالتزوير." },
]);
const civil1H = await hearingChain(civil1, [
  { date: "2024-04-02", purpose: "أول جلسة", decision: "postponed", decision_text: "للإعلان", next_requirements: "إعلان المدعى عليه" },
  { date: "2024-05-14", decision: "postponed", decision_text: "للمستندات", next_requirements: "تقديم أصل المخالصة" },
  { date: "2024-06-25", decision: "reserved_for_judgment", decision_text: "حجز الدعوى للحكم لجلسة 10/9/2024" },
  { date: "2024-09-10", decision: "judgment", decision_text: "حكمت المحكمة بصحة ونفاذ العقد" },
]);
must(await db.from("judgments").insert({
  case_id: civil1, hearing_id: civil1H[3], judgment_date: "2024-09-10", kind: "final", outcome: "for_us",
  operative_text: "حكمت المحكمة بصحة ونفاذ عقد البيع الابتدائي المؤرخ 15/3/2023 المتضمن بيع المدعى عليه للمدعي الشقة المبينة الحدود والمعالم بصحيفة الدعوى لقاء ثمن مقداره 1,200,000 جنيه، وألزمت المدعى عليه المصروفات ومبلغ مائة جنيه مقابل أتعاب المحاماة.",
}).select("id"), "judgment civil1");

const civil2 = await kase({
  client_id: c1, title: "استئناف حكم صحة ونفاذ عقد البيع — كريم المثالي ضد سامح التجريبي", case_number: "8833", case_year: 2024,
  court: "محكمة استئناف القاهرة", circuit: "الدائرة 7 مدني مستأنف", case_type: "مدني", stage: "appeal", status: "active",
  previous_stage_case_id: civil1, client_role: "appellee", facts_date: "2023-03-15", facts_date_precision: "day",
  summary: "استأنف البائع حكم صحة ونفاذ العقد، ونحن المستأنف ضده.",
});
await parties(civil2, [
  { name: "كريم المثالي", role: "appellant", is_our_client: false, representative: "أ. هشام الافتراضي المحامي" },
  { name: "سامح التجريبي", role: "appellee", is_our_client: true, client_id: c1 },
]);
await args(civil2, [
  { side: "opponent", kind: "formal_defense", text: "الدفع ببطلان صحيفة افتتاح الدعوى لعدم إعلانها إعلانًا صحيحًا." },
  { side: "opponent", kind: "substantive_defense", text: "الحكم المستأنف أخطأ في تطبيق القانون إذ لم يحقق دفع عدم سداد الثمن.", ...SUGGESTED, source_quote: "الخصم قال إن الحكم ما حققش موضوع الثمن" },
]);
await requests(civil2, [{ text: "رفض الاستئناف وتأييد الحكم المستأنف.", kind: "primary" }]);
await hearingChain(civil2, [
  { date: d(-35), purpose: "أول جلسة", decision: "postponed", decision_text: "للاطلاع والمذكرات", next_requirements: "مذكرة بالرد على أسباب الاستئناف" },
  { date: d(0), purpose: "للاطلاع والمذكرات" },
]);

// ---------- 2. labour: فصل تعسفي ----------
const c2 = await client("منى الافتراضية", "person", "01000000002", "الجيزة");
const labour = await kase({
  client_id: c2, title: "تعويض عن الفصل التعسفي — منى الافتراضية ضد شركة النموذج للصناعات", case_number: "1290", case_year: 2025,
  court: "محكمة الجيزة الابتدائية", circuit: "الدائرة 5 عمال", case_type: "عمال", stage: "first_instance", status: "active",
  client_role: "plaintiff", facts_date: "2025-02-01", facts_date_precision: "month",
  summary: "فُصلت الموكلة من عملها كمحاسبة بعد ثماني سنوات دون تحقيق ودون سبب مشروع.",
});
await parties(labour, [
  { name: "منى الافتراضية", role: "plaintiff", is_our_client: true, client_id: c2 },
  { name: "شركة النموذج للصناعات", role: "defendant", is_our_client: false, representative: "الإدارة القانونية للشركة" },
  { name: "خبير وزارة العدل (اختباري)", role: "expert", is_our_client: false },
]);
await facts(labour, [
  { fact_date: "2017-01-01", date_precision: "year", date_text: "2017", text: "التحقت الموكلة بالعمل لدى الشركة بوظيفة محاسبة بعقد غير محدد المدة." },
  { fact_date: "2025-02-01", date_precision: "month", date_text: "فبراير 2025", text: "أُخطرت الموكلة شفويًا بإنهاء خدمتها ومُنعت من دخول مقر العمل." },
  { fact_date: null, date_precision: "unknown", date_text: "قبل الفصل بفترة", text: "تقدمت الموكلة بشكوى لمكتب العمل بشأن تأخر صرف الأجور.", ...SUGGESTED, source_quote: "كانت اشتكت في مكتب العمل قبلها" },
]);
await requests(labour, [
  { text: "إلزام الشركة بتعويض لا يقل عن أجر شهرين عن كل سنة من سنوات الخدمة عن الفصل التعسفي.", kind: "primary" },
  { text: "صرف المستحقات المتأخرة ومقابل رصيد الإجازات.", kind: "primary" },
  { text: "احتياطيًا: ندب خبير لحساب المستحقات.", kind: "alternative" },
]);
await args(labour, [{ side: "opponent", kind: "substantive_defense", text: "الموكلة تغيبت عشرين يومًا متصلة دون إذن مما يبرر الفصل." }]);
await hearingChain(labour, [
  { date: d(-28), purpose: "أول جلسة", decision: "referred_to_expert", decision_text: "ندب خبير لبيان مدة الخدمة والأجر والمستحقات", next_requirements: "سداد أمانة الخبير" },
  { date: d(0), purpose: "ورود تقرير الخبير" },
]);

// ---------- 3. rent: إخلاء ----------
const c3 = await client("عادل النموذجي", "person", "01000000003", "شبرا، القاهرة");
const rent = await kase({
  client_id: c3, title: "إخلاء لعدم سداد الأجرة — عادل النموذجي ضد وليد التجريبي", case_number: "772", case_year: 2025,
  court: "محكمة شمال القاهرة الابتدائية", circuit: "الدائرة 3 إيجارات", case_type: "إيجارات", stage: "first_instance", status: "active",
  client_role: "plaintiff", facts_date: "2024-11-01", facts_date_precision: "month",
  summary: "المستأجر امتنع عن سداد الأجرة منذ نوفمبر 2024 رغم التكليف بالوفاء.",
});
await parties(rent, [
  { name: "عادل النموذجي", role: "plaintiff", is_our_client: true, client_id: c3 },
  { name: "وليد التجريبي", role: "defendant", is_our_client: false },
]);
await facts(rent, [
  { fact_date: "2019-07-01", date_precision: "day", date_text: "1/7/2019", text: "عقد إيجار محل تجاري بأجرة شهرية 3,000 جنيه." },
  { fact_date: "2024-11-01", date_precision: "month", date_text: "نوفمبر 2024", text: "توقف المستأجر عن سداد الأجرة." },
  { fact_date: "2025-03-20", date_precision: "day", date_text: "20/3/2025", text: "تكليف بالوفاء على يد محضر." },
]);
await requests(rent, [{ text: "إخلاء المستأجر من العين المؤجرة وتسليمها خالية.", kind: "primary" }, { text: "إلزامه بالأجرة المتأخرة.", kind: "primary" }]);
await hearingChain(rent, [
  { date: d(-49), purpose: "أول جلسة", decision: "postponed", decision_text: "لإعلان المدعى عليه", next_requirements: "إعادة الإعلان" },
  { date: d(-21), decision: "postponed", decision_text: "للمستندات", next_requirements: "أصل عقد الإيجار وإنذار التكليف" },
  { date: d(0), purpose: "للمستندات" },
]);

// ---------- 4. family: نفقة ----------
const c4 = await client("هالة الافتراضية", "person", "01000000004", "مصر الجديدة");
const family = await kase({
  client_id: c4, title: "نفقة زوجية وصغار — هالة الافتراضية ضد مجدي المثالي", case_number: "315", case_year: 2025,
  court: "محكمة الأسرة بمصر الجديدة", circuit: "الدائرة 2 أسرة", case_type: "أسرة", stage: "first_instance", status: "active",
  client_role: "plaintiff", facts_date: "2025-01-01", facts_date_precision: "year",
  summary: "دعوى نفقة زوجية ونفقة صغيرين بعد امتناع الزوج عن الإنفاق.",
});
await parties(family, [
  { name: "هالة الافتراضية", role: "plaintiff", is_our_client: true, client_id: c4 },
  { name: "مجدي المثالي", role: "defendant", is_our_client: false },
]);
await facts(family, [
  { fact_date: "2025-01-01", date_precision: "year", date_text: "منذ بداية 2025", text: "امتنع الزوج عن الإنفاق على الزوجة والصغيرين وترك منزل الزوجية." },
  { fact_date: "2025-04-01", date_precision: "month", date_text: "أبريل 2025", text: "تقدمت الموكلة بطلب لمكتب تسوية المنازعات الأسرية ولم تتم التسوية." },
]);
await requests(family, [{ text: "فرض نفقة زوجية بأنواعها ونفقة للصغيرين.", kind: "primary" }, { text: "أجر مسكن حضانة.", kind: "primary", ...SUGGESTED, source_quote: "وكمان عايزين أجر مسكن" }]);
await hearingChain(family, [
  { date: d(-14), purpose: "أول جلسة", decision: "postponed", decision_text: "لتحريات الدخل", next_requirements: "ورود تحريات المباحث عن دخل المدعى عليه" },
  { date: d(1), purpose: "تحريات الدخل" },
]);

// ---------- 5. commercial: شيكات / مديونية ----------
const c5 = await client("شركة المثال للتجارة", "company", "0220000005", "العاشر من رمضان");
const commercial = await kase({
  client_id: c5, title: "مطالبة بمديونية توريدات — شركة المثال للتجارة ضد مؤسسة الافتراض للمقاولات", case_number: "2207", case_year: 2025,
  court: "المحكمة الاقتصادية بالقاهرة", circuit: "الدائرة 4 اقتصادي", case_type: "تجاري", stage: "first_instance", status: "active",
  client_role: "plaintiff", facts_date: "2024-08-01", facts_date_precision: "month",
  summary: "مطالبة بمبلغ 850,000 جنيه قيمة توريدات حديد لم يُسدد ثمنها، وثلاثة شيكات مرتدة.",
});
await parties(commercial, [
  { name: "شركة المثال للتجارة", role: "plaintiff", is_our_client: true, client_id: c5, representative: "مكتبنا" },
  { name: "مؤسسة الافتراض للمقاولات", role: "defendant", is_our_client: false },
  { name: "رامي التجريبي", role: "guarantor", is_our_client: false, notes: "ضامن متضامن بموجب إقرار" },
]);
await facts(commercial, [
  { fact_date: "2024-08-01", date_precision: "month", date_text: "أغسطس 2024", text: "وردت الموكلة حديد تسليح بقيمة 850,000 جنيه بموجب فواتير موقعة بالاستلام." },
  { fact_date: "2024-12-05", date_precision: "day", date_text: "5/12/2024", text: "ارتداد ثلاثة شيكات من البنك لعدم كفاية الرصيد." },
]);
await requests(commercial, [{ text: "إلزام المدعى عليهما متضامنين بأداء مبلغ 850,000 جنيه والفوائد القانونية.", kind: "primary" }]);
await args(commercial, [{ side: "opponent", kind: "substantive_defense", text: "المنازعة في جودة الحديد الموَرَّد وطلب ندب خبير." }]);
await hearingChain(commercial, [
  { date: d(-20), purpose: "أول جلسة", decision: "postponed", decision_text: "لتقديم أصول الفواتير", next_requirements: "أصول الفواتير والشيكات" },
  { date: d(1), purpose: "تقديم المستندات" },
]);

// ---------- 6. misdemeanour: شيك بدون رصيد ----------
const misd = await kase({
  client_id: c5, title: "جنحة إعطاء شيك بدون رصيد — شركة المثال للتجارة ضد رامي التجريبي", case_number: "15540", case_year: 2025,
  court: "محكمة جنح مدينة نصر", circuit: "الدائرة 9 جنح", case_type: "جنح", stage: "first_instance", status: "active",
  client_role: "plaintiff", facts_date: "2024-12-05", facts_date_precision: "day",
  summary: "جنحة مباشرة عن شيك بمبلغ 200,000 جنيه ارتد لعدم كفاية الرصيد، مع الادعاء مدنيًا.",
});
await parties(misd, [
  { name: "شركة المثال للتجارة", role: "plaintiff", is_our_client: true, client_id: c5, notes: "مدعٍ بالحق المدني" },
  { name: "رامي التجريبي", role: "defendant", is_our_client: false, notes: "متهم" },
]);
await facts(misd, [{ fact_date: "2024-12-05", date_precision: "day", date_text: "5/12/2024", text: "قُدم الشيك للصرف فارتد لعدم وجود رصيد قائم وقابل للسحب." }]);
await hearingChain(misd, [
  { date: d(-7), purpose: "أول جلسة", decision: "postponed", decision_text: "لحضور المتهم", next_requirements: "إعلان المتهم" },
  { date: d(3), purpose: "نظر الجنحة" },
]);

// ---------- 7. administrative ----------
const c7 = await client("طارق الاختباري", "person", "01000000007", "الإسكندرية");
const admin = await kase({
  client_id: c7, title: "إلغاء قرار إداري بالنقل — طارق الاختباري ضد جهة الإدارة", case_number: "6610", case_year: 2025,
  court: "محكمة القضاء الإداري بالقاهرة", circuit: "الدائرة 1 أفراد", case_type: "إداري", stage: "first_instance", status: "active",
  client_role: "plaintiff", facts_date: "2025-05-12", facts_date_precision: "day",
  summary: "طعن على قرار نقل تعسفي صادر دون مقتضى من مصلحة العمل.",
});
await parties(admin, [
  { name: "طارق الاختباري", role: "plaintiff", is_our_client: true, client_id: c7 },
  { name: "رئيس الجهة الإدارية (بصفته)", role: "defendant", is_our_client: false, representative: "هيئة قضايا الدولة" },
]);
await facts(admin, [{ fact_date: "2025-05-12", date_precision: "day", date_text: "12/5/2025", text: "صدر قرار بنقل الموكل إلى فرع بعيد عن محل إقامته دون طلب منه." }]);
await requests(admin, [{ text: "وقف تنفيذ ثم إلغاء القرار المطعون فيه مع ما يترتب على ذلك من آثار.", kind: "primary" }]);
await args(admin, [{ side: "opponent", kind: "formal_defense", text: "الدفع بعدم قبول الدعوى لرفعها بعد الميعاد." }]);
await hearingChain(admin, [
  { date: d(-12), purpose: "أول جلسة" }, // past hearing WITHOUT a decision
]);

// ---------- 8. cassation ----------
const c8 = await client("نادية التجريبية", "person", "01000000008", "طنطا");
const cass = await kase({
  client_id: c8, title: "طعن بالنقض في حكم ريع — نادية التجريبية ضد ورثة المثالي", case_number: "11873", case_year: 2023,
  court: "محكمة النقض", circuit: "الدائرة المدنية", case_type: "مدني", stage: "cassation", status: "reserved_for_judgment",
  client_role: "cassation_appellant", facts_date: "2018-01-01", facts_date_precision: "year",
  summary: "طعن بالنقض في حكم استئنافي قضى برفض طلب الريع عن أرض زراعية.",
});
await parties(cass, [
  { name: "نادية التجريبية", role: "cassation_appellant", is_our_client: true, client_id: c8 },
  { name: "ورثة المرحوم سعيد المثالي", role: "cassation_appellee", is_our_client: false },
]);
await facts(cass, [{ fact_date: "2018-01-01", date_precision: "year", date_text: "2018", text: "وضع المطعون ضدهم اليد على حصة الموكلة في الأرض الزراعية ميراثًا." }]);
await hearingChain(cass, [
  { date: d(-60), purpose: "غرفة المشورة", decision: "reserved_for_judgment", decision_text: "حجز الطعن للحكم" },
  { date: d(5), purpose: "النطق بالحكم" },
]);

// ---------- 9. civil: تعويض (first instance, judgment with appeal deadline as the lawyer stated it) ----------
const c9 = await client("حسام الافتراضي", "person", "01000000009", "المعادي");
const tort = await kase({
  client_id: c9, title: "تعويض عن حادث سيارة — حسام الافتراضي ضد شركة التأمين النموذجية", case_number: "3021", case_year: 2025,
  court: "محكمة جنوب القاهرة الابتدائية", circuit: "الدائرة 21 مدني", case_type: "مدني", stage: "first_instance", status: "judged",
  client_role: "plaintiff", facts_date: "2024-09-18", facts_date_precision: "day",
  summary: "تعويض عن أضرار مادية وأدبية نتيجة حادث سيارة مؤمن عليها.",
});
await parties(tort, [
  { name: "حسام الافتراضي", role: "plaintiff", is_our_client: true, client_id: c9 },
  { name: "شركة التأمين النموذجية", role: "defendant", is_our_client: false },
]);
await facts(tort, [{ fact_date: "2024-09-18", date_precision: "day", date_text: "18/9/2024", text: "اصطدمت سيارة مؤمن عليها لدى المدعى عليها بسيارة الموكل وأصيب بكسر في الساق." }]);
const tortH = await hearingChain(tort, [
  { date: d(-40), purpose: "أول جلسة", decision: "reserved_for_judgment", decision_text: "حجز للحكم" },
  { date: d(-10), decision: "judgment", decision_text: "حكم بالتعويض" },
]);
must(await db.from("judgments").insert({
  case_id: tort, hearing_id: tortH[1], judgment_date: d(-10), kind: "final", outcome: "partial",
  operative_text: "حكمت المحكمة بإلزام الشركة المدعى عليها بأن تؤدي للمدعي مبلغ 150,000 جنيه تعويضًا ماديًا وأدبيًا، ورفضت ما عدا ذلك من طلبات، وألزمتها المصروفات.",
  appeal_deadline: d(30), appeal_deadline_note: "ذكره المحامي: أربعون يومًا من تاريخ النطق — نراجعه مع الإعلان",
}).select("id"), "judgment tort");

// ---------- 10. civil (partial court): a past hearing without a decision ----------
const c10 = await client("ياسر النموذجي", "person", "01000000010", "حلوان");
const partition = await kase({
  client_id: c10, title: "فرز وتجنيب — ياسر النموذجي ضد أشقائه", case_number: "98", case_year: 2026,
  court: "محكمة حلوان الجزئية", circuit: "الدائرة 2 مدني جزئي", case_type: "مدني", stage: "first_instance", status: "active",
  client_role: "plaintiff", facts_date: null, facts_date_precision: "unknown",
  summary: "دعوى فرز وتجنيب حصة ميراثية في عقار.",
});
await parties(partition, [
  { name: "ياسر النموذجي", role: "plaintiff", is_our_client: true, client_id: c10 },
  { name: "سعاد النموذجية", role: "defendant", is_our_client: false },
  { name: "إيهاب النموذجي", role: "defendant", is_our_client: false, ...SUGGESTED, source_quote: "وأخوه إيهاب كمان طرف" },
]);
await hearingChain(partition, [
  { date: d(-5), purpose: "أول جلسة" }, // past, no decision recorded yet
]);

// ---------- 11. commercial, our client is the defendant; past hearing without decision + one later this week
const c11 = await client("شركة الافتراض للاستيراد", "company", "0220000011", "بورسعيد");
const lease2 = await kase({
  client_id: c11, title: "فسخ عقد توريد — شركة الافتراض للاستيراد ضد مصنع المثال", case_number: "4410", case_year: 2025,
  court: "محكمة شمال القاهرة الابتدائية", circuit: "الدائرة 8 تجاري", case_type: "تجاري", stage: "first_instance", status: "active",
  client_role: "defendant", facts_date: "2025-03-01", facts_date_precision: "month",
  summary: "الموكلة مدعى عليها في دعوى فسخ عقد توريد مع طلب تعويض.",
});
await parties(lease2, [
  { name: "مصنع المثال", role: "plaintiff", is_our_client: false },
  { name: "شركة الافتراض للاستيراد", role: "defendant", is_our_client: true, client_id: c11 },
]);
await args(lease2, [
  { side: "opponent", kind: "argument", text: "التأخر في السداد يبرر فسخ العقد." },
  { side: "ours", kind: "formal_defense", text: "الدفع بعدم الاختصاص لوجود شرط تحكيم في العقد." },
]);
await hearingChain(lease2, [
  { date: d(-18), purpose: "أول جلسة" }, // past, no decision
  { date: d(4), purpose: "للرد" },
]);

// ---------- counts ----------
const tables = ["clients", "cases", "case_parties", "case_facts", "case_requests", "case_arguments", "hearings", "judgments", "chat_threads"] as const;
for (const t of tables) {
  const { count } = await db.from(t).select("id", { count: "exact", head: true });
  console.log(`${t}: ${count}`);
}
console.log(`today (Cairo) = ${TODAY}`);
