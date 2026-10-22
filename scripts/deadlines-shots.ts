// Item 5 in the real browser (the app started with NEXT_PUBLIC_FEATURE_DEADLINES=1; LawMill is called for real, a few tiny requests).
// Shots at 1920×1080 in screenshots/compare/next/:
//   DeadlineLight-1920.png / DeadlineDark-1920.png   the card (compare with screenshots/mockups/next/Deadline{Light,Dark}.png)
//   DeadlineNotPresent-1920.png                      the «الحكم مش حضوري» step (asks for the service date), then DeadlineNotPresentDate-1920.png (typed)
//   DeadlineSaved-1920.png                           after «حطهم في الرول»
//   DeadlineRoll-1920.png / DeadlineRollReminder-1920.png   the Roll on the last day (gold) and on a reminder day
//   DeadlineArticle-1920.png                         an article chip opened (the verbatim text), and the art. 18 chip (LawMill has no text)
//   HolidaysAdmin-1920.png / HolidaysOffice-1920.png the holidays page as admin (with a report) and as a non-admin
// Fixture (free): a temporary client + case + judgment through the real card path; one 2026 holiday is approved for the shots and put back as a
// draft at the end; everything made is removed. Run: npx tsx --conditions=react-server --env-file=.env.local scripts/deadlines-shots.ts [baseUrl]
import { chromium, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import type { Database } from "@/lib/db/types";
import { createProposal, decideProposal } from "@/lib/proposals";
import type { Db } from "@/lib/supabase/server";

process.env.NEXT_PUBLIC_FEATURE_DEADLINES = "1";
const BASE = process.argv.find((a, i) => i >= 2 && a.startsWith("http")) ?? "http://localhost:4300";
const OUT = "screenshots/compare/next";
mkdirSync(OUT, { recursive: true });
const failures: string[] = [];
const check = (ok: boolean, label: string) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failures.push(label); };
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const mk = async (who: "DEMO" | "OTHER") => {
  const c = createClient<Database>(url, key, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: process.env[`${who}_EMAIL`]!, password: process.env[`${who}_PASSWORD`]! });
  if (error) throw new Error(`${who} sign-in failed`);
  return c;
};

const A = await mk("DEMO");
const B = await mk("OTHER");
const D = A as unknown as Db;
const made = { client: "", caseId: "", report: "", holiday: { id: "", status: "" } };

async function login(browser: Browser, who: "DEMO" | "OTHER") {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', process.env[`${who}_EMAIL`]!);
  await page.fill('input[name="password"]', process.env[`${who}_PASSWORD`]!);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { waitUntil: "commit", timeout: 60_000 }), page.click('button:has-text("دخول")')]);
  const st = await ctx.storageState();
  await ctx.close();
  return st;
}
async function view(browser: Browser, st: Awaited<ReturnType<typeof login>>, dark: boolean) {
  const ctx = await browser.newContext({ storageState: st, viewport: { width: 1920, height: 1080 }, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light" });
  return { ctx, page: await ctx.newPage() };
}
async function go(page: Page, path: string, wait: string) {
  try { await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 90_000 }); } catch { await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 120_000 }); }
  await page.waitForSelector(wait, { timeout: 60_000 });
  await page.waitForTimeout(700);
}

let browser: Browser | undefined;
try {
  // ---- fixture through the real path: a judgment confirmed on a card → the deadlines card is proposed ----
  const { data: cl } = await A.from("clients").insert({ name: "كريم المثالي", source_kind: "manual" }).select("id").single();
  made.client = cl!.id;
  const { data: c } = await A.from("cases").insert({ client_id: cl!.id, title: "صحة ونفاذ عقد بيع", case_number: "8833", case_year: 2024, court: "محكمة جنوب القاهرة الابتدائية", stage: "first_instance", source_kind: "manual" }).select("id").single();
  made.caseId = c!.id;
  const { data: t } = await A.from("chat_threads").insert({ case_id: c!.id, title: "كريم المثالي" }).select("id").single();
  await A.from("chat_messages").insert({ thread_id: t!.id, role: "user", content: "قضية كريم المثالي اتحكم فيها حضوري، رفض الدعوى. عاوزين نستأنف." });
  const jp = await createProposal(D, { threadId: t!.id, caseId: c!.id, sourceTexts: ["رفض الدعوى"], ops: [{ tool: "add_judgment", args: { case: c!.id, date: "20/10/2026", kind: "final", operative_text: "حكمت المحكمة برفض الدعوى", quote: "رفض الدعوى" }, source: { kind: "chat", quote: "رفض الدعوى" } }] });
  await decideProposal(D, jp.id, { mode: "confirm" });
  const { data: cards } = await A.from("proposals").select("id, ops").eq("thread_id", t!.id);
  check((cards ?? []).some((p) => (p.ops as unknown as { tool: string }[]).some((o) => o.tool === "add_deadline")), "the deadlines card is proposed after the judgment");

  // one approved holiday in 2026 so the card does not say «راجع الإجازات» (put back as a draft at the end)
  const { data: h } = await A.from("holidays").select("id, status").eq("holiday_date", "2026-10-06").single();
  made.holiday = { id: h!.id, status: h!.status };
  await A.from("holidays").update({ status: "approved" }).eq("id", h!.id);
  // a report from the other office, for the admin's page
  const { data: rep } = await B.from("holiday_reports").insert({ holiday_date: "2026-12-25", name: "إجازة رسمية ناقصة (اختبار)", note: "قرار رئيس الوزراء" }).select("id").single();
  made.report = rep!.id;

  browser = await chromium.launch();
  const stA = await login(browser, "DEMO");
  const stB = await login(browser, "OTHER");
  const cardSel = '[aria-label="مواعيد الطعن"]';
  const thread = `/chat/${t!.id}`;

  for (const dark of [true, false]) {
    const { ctx, page } = await view(browser, stA, dark);
    await go(page, thread, cardSel);
    const txt = await page.locator(cardSel).innerText();
    if (!dark) {
      check(txt.includes("40") && txt.includes("29/11/2026") && txt.includes("مرافعات · م 227") && txt.includes("مرافعات · م 252") && txt.includes("مرافعات · م 18"), "the card shows 40 days, 29/11/2026 and the three article chips");
      check(txt.includes("بعد الاستئناف") && txt.includes("حطهم في الرول") && txt.includes("الحكم مش حضوري") && txt.includes("الحكم في مادة مستعجلة؟"), "…«بعد الاستئناف», the two buttons and the visible «مستعجل» question");
    }
    await page.screenshot({ path: `${OUT}/Deadline${dark ? "Dark" : "Light"}-1920.png` });
    if (!dark) {
      // an article chip opens the verbatim text; art. 18 says LawMill has no text
      await page.getByRole("button", { name: "افتح مرافعات · م 227" }).click();
      await page.waitForSelector("dialog[open]");
      const art = await page.locator("dialog[open]").innerText();
      check(art.includes("ميعاد الاستئناف أربعون يوما"), "the م 227 chip opens the verbatim article text");
      await page.screenshot({ path: `${OUT}/DeadlineArticle-1920.png` });
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "افتح مرافعات · م 18" }).click();
      await page.waitForSelector("dialog[open]");
      check((await page.locator("dialog[open]").innerText()).includes("مش متاح"), "the م 18 chip says the text is not available from LawMill");
      await page.keyboard.press("Escape");

      // not حضوري: asks for the service date; nothing is guessed
      await page.getByRole("button", { name: "الحكم مش حضوري" }).click();
      await page.waitForSelector("input[inputmode='numeric']");
      await page.waitForFunction(() => document.body.innerText.includes("محتاج تاريخ إعلان الحكم"), null, { timeout: 30_000 });
      await page.waitForTimeout(300);
      check((await page.locator(cardSel).innerText()).includes("محتاج تاريخ إعلان الحكم") && await page.getByRole("button", { name: "حطهم في الرول" }).isDisabled(), "not حضوري: the card asks for the service date and cannot be saved yet");
      await page.screenshot({ path: `${OUT}/DeadlineNotPresent-1920.png` });
      await page.fill("input[inputmode='numeric']", "21/10/2026");
      await page.getByRole("button", { name: "احسب" }).click();
      await page.waitForFunction(() => document.body.innerText.includes("30/11/2026"), null, { timeout: 30_000 });
      check(true, "a typed service date 21/10/2026 gives the last day 30/11/2026");
      await page.screenshot({ path: `${OUT}/DeadlineNotPresentDate-1920.png` });
      // back to حضوري and save: the tap
      await page.getByRole("button", { name: "الحكم حضوري" }).click();
      await page.waitForFunction(() => document.body.innerText.includes("29/11/2026"), null, { timeout: 30_000 });
      const { count: before } = await A.from("case_deadlines").select("id", { count: "exact", head: true }).eq("case_id", c!.id);
      check(before === 0, "nothing is saved before «حطهم في الرول»");
      await page.getByRole("button", { name: "حطهم في الرول" }).click();
      await page.waitForSelector("text=اتحطت في الرول", { timeout: 60_000 });
      const { data: saved } = await A.from("case_deadlines").select("days, last_day, reminders").eq("case_id", c!.id);
      check(saved?.length === 1 && saved[0].days === 40 && saved[0].last_day === "2026-11-29" && JSON.stringify(saved[0].reminders) === "[7,1]", "the tap saves 40 days, 29/11/2026 and reminders 7 and 1");
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/DeadlineSaved-1920.png` });
    }
    await ctx.close();
  }

  // ---- the Roll ----
  {
    const { ctx, page } = await view(browser, stA, false);
    await go(page, "/hearings?view=day&date=29/11/2026", '[aria-label="مواعيد الطعن"]');
    check((await page.locator('[aria-label="مواعيد الطعن"]').innerText()).includes("آخر يوم لميعاد الاستئناف"), "the Roll shows the last day on 29/11/2026");
    await page.screenshot({ path: `${OUT}/DeadlineRoll-1920.png` });
    await go(page, "/hearings?view=day&date=22/11/2026", '[aria-label="مواعيد الطعن"]');
    check((await page.locator('[aria-label="مواعيد الطعن"]').innerText()).includes("تنبيه: فاضل 7 أيام"), "…and the reminder a week before, on 22/11/2026");
    await page.screenshot({ path: `${OUT}/DeadlineRollReminder-1920.png` });
    await ctx.close();
  }

  // ---- holidays ----
  {
    const { ctx, page } = await view(browser, stA, false);
    await go(page, "/settings/holidays", '[aria-label="قايمة الإجازات"]');
    const txt = await page.locator("main").innerText();
    check(txt.includes("ضيف إجازة") && txt.includes("بلاغات عن إجازات ناقصة") && txt.includes("اعتمد"), "the admin sees add, the reports and the approve buttons");
    await page.screenshot({ path: `${OUT}/HolidaysAdmin-1920.png` });
    await ctx.close();
    const o = await view(browser, stB, false);
    await go(o.page, "/settings/holidays", '[aria-label="قايمة الإجازات"]');
    const t2 = await o.page.locator("main").innerText();
    check(t2.includes("بلّغ عن إجازة ناقصة") && !t2.includes("ضيف إجازة") && !t2.includes("اعتمد") && !t2.includes("امسح"), "a non-admin sees the read-only list and «بلّغ عن إجازة ناقصة», no admin buttons");
    await o.page.screenshot({ path: `${OUT}/HolidaysOffice-1920.png` });
    await o.ctx.close();
  }
} finally {
  await browser?.close();
  if (made.holiday.id) await A.from("holidays").update({ status: made.holiday.status }).eq("id", made.holiday.id);
  if (made.report) await B.from("holiday_reports").delete().eq("id", made.report);
  if (made.caseId) { await A.from("proposals").delete().eq("case_id", made.caseId); await A.from("cases").delete().eq("id", made.caseId); }
  if (made.client) await A.from("clients").delete().eq("id", made.client);
  console.log("cleanup done");
}
console.log(failures.length ? `\n${failures.length} check(s) FAILED` : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
