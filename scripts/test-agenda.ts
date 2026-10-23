// The agenda in a browser (PR 2): rows by court and circuit, the day / week / month views and their URLs, back / forward, the slim line and the one-by-one flow
// (opened and walked through WITHOUT saving: no write request leaves the page and the undecided count is the same after), the old addresses, the sidebar link,
// the deadlines flag staying off. Read only. Needs the app running with the demo account in .env.local.
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-agenda.ts [baseUrl]
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/lib/supabase/server";
import { applyOp, MANUAL } from "@/lib/tools/apply";

const BASE = process.argv[2] ?? "http://localhost:3101";
let fails = 0;
const check = (ok: boolean, what: string, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`); if (!ok) fails++; };

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const undecidedNow = async () => (await sb.from("hearings").select("id", { count: "exact", head: true }).lt("hearing_date", today).is("decision_type", null).neq("review_status", "rejected")).count ?? -1;
const db = sb as unknown as Db;
const before = await undecidedNow();
const { data: busy } = await sb.from("hearings").select("hearing_date").lt("hearing_date", today).neq("review_status", "rejected");
const perDay = new Map<string, number>();
for (const h of busy ?? []) perDay.set(h.hearing_date, (perDay.get(h.hearing_date) ?? 0) + 1);
const [DAY, N] = [...perDay].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0];
const dmy = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d}/${m}/${y}`; };

const browser = await chromium.launch();
const login = await browser.newContext();
const lp = await login.newPage();
await lp.goto(`${BASE}/login`);
await lp.fill('input[name="email"]', process.env.DEMO_EMAIL!);
await lp.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
await Promise.all([lp.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90_000 }), lp.click('button:has-text("دخول")')]);
const ctx = await browser.newContext({ storageState: await login.storageState(), viewport: { width: 1920, height: 1080 }, locale: "ar-EG", timezoneId: "Africa/Cairo" });
const page = await ctx.newPage();
const writes: string[] = [];
page.on("request", (r) => { if (r.method() === "POST") writes.push(r.url()); });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const url = () => { const u = new URL(page.url()); return decodeURIComponent(u.pathname + u.search); };

try {
  // ---- the day: groups, columns, rows ----
  await page.goto(`${BASE}/agenda?view=day&date=${dmy(DAY)}`, { waitUntil: "load", timeout: 120_000 });
  await page.waitForSelector("main section[aria-label] a[href*='tab=hearings']", { timeout: 60_000 });
  const links = await page.locator("main section[aria-label] a[href*='tab=hearings']").all();
  check(links.length === N, `the day shows its ${N} hearings as rows`, String(links.length));
  const href = await links[0].getAttribute("href");
  check(/^\/cases\/[0-9a-f-]{36}\?tab=hearings&hearing=[0-9a-f-]{36}$/.test(href ?? ""), "a row opens the case's hearings tab", href ?? "");
  const cols = await page.locator("main").innerText();
  check(["الدائرة", "رقم الدعوى", "الموكل ضد الخصم", "المطلوب"].every((c) => cols.includes(c)), "the four column names are on the page");
  check(/ لسنة \d{4}/.test(cols), "the case number reads «772 لسنة 2025»");
  check(/ضد/.test(cols), "client «ضد» the opponent");
  const courts = await page.locator("main section[aria-label] h3").allInnerTexts();
  check(courts.length > 0 && new Set(courts).size === courts.length, "one group per court (no location saved)", courts.join(" | "));
  check(!(await page.locator('[aria-label="مواعيد الطعن"]').count()), "no deadline rows with the flag off");
  const nav = await page.locator("nav[aria-label='القائمة'] a", { hasText: "الأجندة" }).first();
  check((await nav.getAttribute("href"))?.startsWith("/agenda") === true && (await nav.getAttribute("aria-current")) === "page", "the sidebar «الأجندة» link goes to /agenda and is the current one");
  check((await page.locator('textarea[aria-label="رسالة لـ Clausia"]').count()) > 0, "the chat panel is beside the agenda");

  // ---- views and URLs ----
  await page.getByRole("link", { name: "أسبوع", exact: true }).click();
  await page.waitForFunction(() => decodeURIComponent(location.search).includes("view=week"));
  check(url().includes("view=week") && url().includes(`date=${dmy(DAY)}`), "«أسبوع» → ?view=week, the day is kept", url());
  check((await page.locator("main section[aria-label] h2").count()) >= 1, "the week shows its days");
  await page.getByRole("link", { name: "شهر", exact: true }).click();
  await page.waitForFunction(() => decodeURIComponent(location.search).includes("view=month"));
  await page.waitForSelector(`a[href*="date=${dmy(DAY)}"]`);
  check(url().includes("view=month"), "«شهر» → ?view=month", url());
  const dayCell = page.locator(`main a[href*="view=day&date=${dmy(DAY)}"]:visible`).last();
  check((await dayCell.innerText()).includes(String(Number(DAY.slice(8)))), "the month grid has the day");
  await dayCell.click();
  await page.waitForFunction(() => decodeURIComponent(location.search).includes("view=day"));
  check(url().includes("view=day") && url().includes(`date=${dmy(DAY)}`), "a month cell opens its day", url());
  check((await page.locator("main section[aria-label] a[href*='tab=hearings']").count()) === N, "…with its hearings");

  // month arrows keep the view and move a month
  await page.getByRole("link", { name: "شهر", exact: true }).click();
  await page.waitForFunction(() => decodeURIComponent(location.search).includes("view=month"));
  await page.getByRole("link", { name: "الشهر اللي فات" }).click();
  await page.waitForFunction((d) => !decodeURIComponent(location.search).includes(d), dmy(DAY));
  const [dd, mm, yy] = dmy(DAY).split("/").map(Number);
  const prevMonth = new Date(Date.UTC(yy, mm - 2, 1));
  check(url().includes("view=month") && url().includes(`/${prevMonth.getUTCMonth() + 1}/${prevMonth.getUTCFullYear()}`), "«الشهر اللي فات» keeps the month view and goes back a month", url());
  void dd;
  await page.goBack();
  await page.waitForFunction((d) => decodeURIComponent(location.search).includes(d), dmy(DAY));
  check(url().includes(dmy(DAY)), "back restores the earlier month", url());
  await page.getByRole("link", { name: "النهارده", exact: true }).first().click();
  await page.waitForFunction((d) => decodeURIComponent(location.search).includes(d), dmy(today));
  check(url().includes(dmy(today)), "«النهارده» goes to today in the same view", url());

  // ---- the slim line and the flow: opened and walked, nothing saved ----
  await page.goto(`${BASE}/agenda?view=day&date=${dmy(DAY)}`, { waitUntil: "load" });
  const slim = page.getByRole("button", { name: /فاتت لسه قرارها متسجلش/ });
  await slim.waitFor({ timeout: 60_000 });
  const slimText = await slim.innerText();
  check(slimText.includes(String(before)) && slimText.includes("سجّلها واحدة واحدة"), "the slim line says the count and «سجّلها واحدة واحدة»", slimText.replace(/\s+/g, " "));
  check((await page.locator("main input[name='decision_text']").count()) === 0, "no decision inputs in the agenda list");
  await page.waitForTimeout(3000); // the strip finishes its own reads first
  const mark = writes.length; // the strip reads weeks with server actions (POST): those are reads; the flow itself must send none
  await slim.click();
  const dlg = page.getByRole("dialog");
  await dlg.waitFor();
  const first = await dlg.innerText();
  check(first.includes(`جلسة 1 من ${before}`) || first.replace(/\s+/g, " ").includes(`جلسة 1 من ${before}`), `the flow starts at «جلسة 1 من ${before}»`);
  check((await dlg.locator("input[name='decision_text']").count()) === 1 && (await dlg.getByRole("button", { name: "حفظ القرار" }).count()) === 1, "it is the same decision form");
  await dlg.getByRole("button", { name: "بعدين" }).click();
  await page.waitForFunction(() => /جلسة\s*2\s*من/.test(document.querySelector("[role=dialog]")?.textContent ?? ""));
  check(true, "«بعدين» moves to the next hearing without saving");
  await page.keyboard.press("Escape");
  await dlg.waitFor({ state: "detached" });
  check(true, "Escape closes the flow");
  check(writes.length === mark, "no request left the page while the flow was opened and walked (nothing saved)", writes.slice(mark).join(", "));
  await page.goto(`${BASE}/agenda?decide=1`, { waitUntil: "load" });
  await page.getByRole("dialog").waitFor({ timeout: 60_000 });
  check(true, "?decide=1 opens the flow on load");
  await page.getByRole("button", { name: "إغلاق" }).first().click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  check(!url().includes("decide"), "closing it drops ?decide=1 from the address", url());
  check((await undecidedNow()) === before, "the undecided count is the same after", `${before} → ${await undecidedNow()}`);

  // ---- the one write the flow needs checked: a decision SAVED through it, on a temporary case that is deleted again ----
  // (demo account, RLS client, the same applyOp the app uses; dated 2019 so its hearings come first in the flow)
  let caseId: string | null = null;
  let clientId: string | null = null;
  try {
    clientId = (await applyOp(db, "create_client", { name: "اختبار-أجندة موكل", quote: "اختبار" }, MANUAL)).id;
    caseId = (await applyOp(db, "create_case", { client: clientId, title: "اختبار-أجندة", court: "محكمة اختبار الأجندة", circuit: "الدائرة 3 اختبار", case_number: "9999", case_year: 2019, client_role: "plaintiff", quote: "اختبار" }, MANUAL)).id;
    await applyOp(db, "add_party", { case: caseId, name: "اختبار-أجندة خصم", role: "defendant", is_our_client: false, quote: "اختبار" }, MANUAL);
    const hA = (await applyOp(db, "add_hearing", { case: caseId, date: "1/5/2019", purpose: "مطلوب-اختبار", location: "الدور 4 · قاعة 12", quote: "اختبار" }, MANUAL)).id;
    await applyOp(db, "add_hearing", { case: caseId, date: "1/5/2019", location: "الدور 4 · قاعة 12", quote: "اختبار" }, MANUAL);

    // the agenda day of the temporary hearings: the floor and hall beside the court, the party names, «المطلوب»
    await page.goto(`${BASE}/agenda?view=day&date=1/5/2019`, { waitUntil: "load", timeout: 120_000 });
    await page.waitForSelector("main section[aria-label='محكمة اختبار الأجندة']", { timeout: 60_000 });
    const grp = await page.locator("main section[aria-label='محكمة اختبار الأجندة']").innerText();
    check(grp.includes("الدور 4 · قاعة 12"), "the court's group shows the floor and hall (hearings.location)");
    check(grp.includes("اختبار-أجندة موكل") && grp.includes("ضد") && grp.includes("اختبار-أجندة خصم"), "«client ضد opponent» from the case's parties");
    check(grp.includes("9999 لسنة 2019") && grp.includes("مطلوب-اختبار"), "the case number and «المطلوب»");
    await page.screenshot({ path: "screenshots/agenda/day-location-1920-light.png" });

    // the flow: the two 2019 hearings are the oldest, so they come first; save the first one with «قرار آخر»
    await page.goto(`${BASE}/agenda?decide=1`, { waitUntil: "load", timeout: 120_000 });
    const d2 = page.getByRole("dialog");
    await d2.waitFor({ timeout: 60_000 });
    await d2.getByRole("radio", { name: "قرار آخر" }).click();
    await d2.locator("input[name='decision_text']").fill("قرار-اختبار");
    await page.screenshot({ path: "screenshots/agenda/flow-filled-1920-light.png" });
    await d2.getByRole("button", { name: "حفظ القرار" }).click();
    await d2.getByRole("status").waitFor({ timeout: 30_000 });
    check((await d2.innerText()).includes("اتسجّل القرار"), "the save confirms inside the flow");
    const { data: saved } = await sb.from("hearings").select("decision_type, decision_text, source_kind").eq("case_id", caseId!).not("decision_type", "is", null);
    check(saved?.length === 1 && saved[0].decision_type === "other" && saved[0].decision_text === "قرار-اختبار" && saved[0].source_kind === "manual", "one decision saved, with manual provenance", JSON.stringify(saved));
    await page.screenshot({ path: "screenshots/agenda/flow-saved-1920-light.png" });
    await d2.getByRole("button", { name: "الجلسة اللي بعدها" }).click();
    await page.waitForFunction(() => /جلسة\s*2\s*من/.test(document.querySelector("[role=dialog]")?.textContent ?? ""));
    check(true, "«الجلسة اللي بعدها» goes on to the next one, and the list did not jump after the refresh");
    check(!(await d2.getByText("اتسجّل القرار").count()), "the next hearing shows an empty form again");
    void hA;
  } finally {
    if (caseId) { await db.from("hearings").delete().eq("case_id", caseId); await db.from("cases").delete().eq("id", caseId); }
    if (clientId) await db.from("clients").delete().eq("id", clientId);
  }
  check((await undecidedNow()) === before, "cleanup: the demo account is as before (the undecided count is the same)", `${before} → ${await undecidedNow()}`);
  const { data: left } = await sb.from("cases").select("id").eq("title", "اختبار-أجندة");
  check(!left?.length, "cleanup: the temporary case is gone");

  // ---- the old addresses ----
  for (const [from, want] of [["/hearings", "/agenda"], [`/hearings?view=week&date=${dmy(DAY)}`, `/agenda?view=week&date=${dmy(DAY)}`], ["/hearings?filter=undecided", "/agenda?decide=1"]] as const) {
    await page.goto(`${BASE}${from}`, { waitUntil: "load", timeout: 120_000 });
    check(url() === want, `${from} → ${want}`, url());
  }
  check(errors.length === 0, "no page errors", errors.join(" | "));
} finally {
  await browser.close();
}
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
