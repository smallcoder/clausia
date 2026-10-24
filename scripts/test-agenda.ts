// The agenda in a browser: rows by court and circuit with the column names INSIDE each court card (no shared header), the day / week / month views and their
// URLs, back / forward, the «محتاجة قرار» tab (its tab and gold count, the rows oldest first, «سجّل القرار» opening the inline form and its rules, the empty
// state when nothing waits, the links that open it: the sidebar's count and the case page), the old addresses, the widths (sidebar, chat, no horizontal scroll at
// 1440 and 1920, the case header), the thin scrollbars, the deadlines flag staying off.
// READ ONLY: nothing is saved. The form is opened and its choices clicked, but «حفظ القرار» is never tapped, and the check below counts the write requests.
// (The save itself, with a fake database, is scripts/test-agenda-decide.ts.) Needs the app running with the demo account in .env.local.
// Run: npx tsx --env-file=.env.local scripts/test-agenda.ts [baseUrl]
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] ?? "http://localhost:3101";
let fails = 0;
const check = (ok: boolean, what: string, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`); if (!ok) fails++; };

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const undecidedNow = async () => (await sb.from("hearings").select("id", { count: "exact", head: true }).lt("hearing_date", today).is("decision_type", null).neq("review_status", "rejected")).count ?? -1;
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
  // inside each court card: the court's line, then the column names, then the rows; nothing shared above the cards
  const layout = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("main section[aria-label]")].filter((x) => x.querySelector("h3"));
    const names = ["الدائرة", "رقم الدعوى", "الموكل ضد الخصم", "المطلوب"];
    const inCard = cards.map((c) => {
      const kids = [...c.children];
      const hdr = kids[1]?.textContent?.replace(/\s+/g, "");
      return { head: !!kids[0]?.querySelector("h3"), header: hdr === names.join("").replace(/\s+/g, ""), list: kids[2]?.tagName === "UL" };
    });
    const loose = [...document.querySelectorAll("main span")].filter((x) => x.textContent === "رقم الدعوى" && !x.closest("section[aria-label]")).length;
    return { n: cards.length, inCard, loose };
  });
  check(layout.n > 0 && layout.inCard.every((c) => c.head && c.header && c.list), "every court card reads: court line → column names → rows", JSON.stringify(layout.inCard));
  check(layout.loose === 0, "no shared header row above the cards");
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

  // ---- the «محتاجة قرار» tab: read only (the form is opened, never saved) ----
  const pageSize = (w: number, h: number) => page.setViewportSize({ width: w, height: h });
  await pageSize(1920, 1080);
  await page.goto(`${BASE}/agenda?view=day&date=${dmy(DAY)}`, { waitUntil: "load" });
  const tabNav = page.getByRole("navigation", { name: "أقسام الأجندة" });
  await tabNav.waitFor({ timeout: 60_000 });
  check((await tabNav.getByRole("link").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").replace(/العدد \d+|\d+/g, "").trim()).join("|") === "الأجندة|محتاجة قرار", "two tabs: «الأجندة» and «محتاجة قرار»");
  check((await tabNav.getByRole("link", { name: /الأجندة/ }).first().getAttribute("aria-current")) === "page", "«الأجندة» is the current tab");
  check((await page.locator("main").innerText()).includes("سجّلها واحدة واحدة") === false && (await page.getByRole("dialog").count()) === 0, "no banner and no one-by-one flow");
  const pill = tabNav.getByRole("link", { name: /محتاجة قرار/ }).locator("span.font-num");
  if (before > 0) check((await pill.innerText()).replace(/\D/g, "") === String(before), `the gold pill on the tab says ${before}`, await pill.innerText());
  else check((await pill.count()) === 0, "no pill when nothing waits");
  await page.waitForTimeout(3000); // the strip finishes its own reads first
  const mark = writes.length; // the strip reads weeks with server actions (POST): those are reads; the tab and its form must send none

  await tabNav.getByRole("link", { name: /محتاجة قرار/ }).click();
  await page.waitForFunction(() => decodeURIComponent(location.search).includes("tab=decide"));
  check(url() === "/agenda?tab=decide", "the tab opens /agenda?tab=decide", url());
  check((await page.locator('[aria-label="طريقة العرض"]').count()) === 0 && (await page.locator("[data-roll-content]").count()) === 0, "the day strip, the view switch and the day are not shown on this tab");
  const rowsOnPage = page.locator('main section[aria-label="جلسات محتاجة قرار"] > ul > li');
  if (before > 0) {
    await rowsOnPage.first().waitFor({ timeout: 30_000 });
    check((await rowsOnPage.count()) === Math.min(before, 200), `${Math.min(before, 200)} rows: every past hearing with no decision`, String(await rowsOnPage.count()));
    const { data: oldest } = await sb.from("hearings").select("hearing_date").lt("hearing_date", today).is("decision_type", null).neq("review_status", "rejected").order("hearing_date", { ascending: true }).limit(1);
    const firstText = (await rowsOnPage.first().innerText()).replace(/\s+/g, " ");
    check(firstText.startsWith(dmy(oldest![0].hearing_date)), "the first row is the oldest (d/m/yyyy)", firstText.slice(0, 40));
    const dates = await rowsOnPage.evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim().match(/^\d{1,2}\/\d{1,2}\/\d{4}/)?.[0] ?? ""));
    const iso = (d: string) => { const [dd, mm, yy] = d.split("/").map(Number); return yy * 10000 + mm * 100 + dd; };
    check(dates.every((d, i) => d && (i === 0 || iso(dates[i - 1]) <= iso(d))), "oldest first all the way down");
    check(/لسنة \d{4}|بلا رقم/.test(firstText) && firstText.includes(" · ") && firstText.includes("سجّل القرار"), "a row has the date, court · circuit, the case number, the names and «سجّل القرار»", firstText.slice(0, 200));
    const allText = (await rowsOnPage.allInnerTexts()).join(" ");
    if (/ ضد /.test(allText)) check(true, "a row with an opponent reads «client ضد opponent»"); else console.log("SKIP  no row with both a client and an opponent in this data");
    const link = await rowsOnPage.first().locator("a").first().getAttribute("href");
    check(/^\/cases\/[0-9a-f-]{36}\?tab=hearings&hearing=[0-9a-f-]{36}$/.test(link ?? ""), "the row's names open the case's hearings tab", link ?? "");

    // the inline form: opened and its choices clicked, never saved
    await rowsOnPage.first().getByRole("button", { name: /سجّل القرار/ }).click();
    const form = rowsOnPage.first().locator("form");
    await form.waitFor();
    const radios = await form.getByRole("radio").allInnerTexts();
    check(radios.join("|") === "تأجيل|حجز للحكم|حكم|شطب|غير ذلك", "the form offers تأجيل / حجز للحكم / حكم / شطب / غير ذلك", radios.join("|"));
    check((await form.locator("input[name='next_date']").count()) === 0 && (await form.locator("input[name='next_requirements']").count()) === 1, "no date field until a decision that needs one; «المطلوب للجلسة القادمة» is there");
    await form.getByRole("radio", { name: "تأجيل", exact: true }).click();
    check((await form.locator("input[name='next_date']").count()) === 1 && (await form.innerText()).includes("الجلسة القادمة (مطلوب)"), "تأجيل asks for the next date (required)");
    await form.getByRole("radio", { name: "حكم", exact: true }).click();
    check((await form.locator("input[name='next_date']").count()) === 0, "حكم does not");
    await form.getByRole("radio", { name: "حجز للحكم" }).click();
    check((await form.locator("input[name='next_date']").count()) === 1, "حجز للحكم asks for it too");
    await form.getByRole("radio", { name: "غير ذلك" }).click();
    check((await form.locator("input[name='next_date']").count()) === 0 && (await form.locator("input[name='decision_text']").count()) === 1, "غير ذلك: no date, an optional decision text");
    check((await form.getByRole("button", { name: "حفظ القرار" }).count()) === 1 && (await form.getByRole("button", { name: "إلغاء" }).count()) === 1, "Save and Cancel");
    await form.getByRole("button", { name: "إلغاء" }).click();
    await form.waitFor({ state: "detached" });
    check(true, "Cancel closes the form");
  } else {
    check((await page.locator("main").innerText()).includes("كل القرارات متسجلة ✓"), "nothing waits: «كل القرارات متسجلة ✓»");
  }
  check(writes.length === mark, "no request left the page while the tab and its form were used (nothing saved)", writes.slice(mark).join(", "));
  check((await undecidedNow()) === before, "the undecided count is the same after", `${before} → ${await undecidedNow()}`);

  // the tabs are history entries: the day tab and back
  await tabNav.getByRole("link", { name: /^الأجندة/ }).click();
  await page.waitForFunction(() => !decodeURIComponent(location.search).includes("tab=decide"));
  check(url().startsWith("/agenda?view=day&date="), "«الأجندة» goes back to the days", url());
  await page.goBack();
  await page.waitForFunction(() => decodeURIComponent(location.search).includes("tab=decide"));
  check((await tabNav.getByRole("link", { name: /محتاجة قرار/ }).getAttribute("aria-current")) === "page", "back restores the «محتاجة قرار» tab");
  await page.goto(`${BASE}/agenda?decide=1`, { waitUntil: "load" });
  check((await page.getByRole("navigation", { name: "أقسام الأجندة" }).getByRole("link", { name: /محتاجة قرار/ }).getAttribute("aria-current")) === "page", "the old ?decide=1 still opens the tab");

  // the links that open it
  if (before > 0) {
    await page.goto(`${BASE}/agenda?view=day&date=${dmy(DAY)}`, { waitUntil: "load" });
    const badge = page.locator("nav[aria-label='القائمة'] a[href='/agenda?tab=decide']");
    await badge.first().waitFor({ timeout: 30_000 });
    check((await badge.first().innerText()).trim() === String(before), "the sidebar's count links to /agenda?tab=decide", await badge.first().innerText());
    const { data: oc } = await sb.from("hearings").select("case_id").lt("hearing_date", today).is("decision_type", null).neq("review_status", "rejected").order("hearing_date", { ascending: true }).limit(1);
    await page.goto(`${BASE}/cases/${oc![0].case_id}?tab=hearings`, { waitUntil: "load", timeout: 120_000 });
    const gold = page.getByRole("link", { name: /القرار متسجلش · سجّله/ }).first();
    await gold.waitFor({ timeout: 60_000 });
    check((await gold.getAttribute("href")) === "/agenda?tab=decide", "the case page's «القرار متسجلش · سجّله» opens the tab");
  }

  // ---- widths: the sidebar, the chat, no horizontal scroll (the case header and the agenda fit) ----
  // the page does not scroll sideways, and no card clips its content (the cards are overflow-hidden, so a too-wide row would be cut, not scrolled; a long name
  // inside a row may still end in «…», that is its own truncation)
  const noScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && ![...document.querySelectorAll("main section[aria-label], main dl")].some((e) => e.scrollWidth > e.clientWidth + 1));
  const { data: caseRow } = await sb.from("cases").select("id").limit(1);
  for (const [w, sideW, chatW] of [[1920, 288, 560], [1440, 72, 480]] as const) {
    await pageSize(w, 1000);
    await page.goto(`${BASE}/agenda?view=week&date=${dmy(DAY)}`, { waitUntil: "load" });
    await page.waitForSelector("main section[aria-label] a[href*='tab=hearings']", { timeout: 60_000 });
    const cw = await page.locator('aside[aria-label="محادثة Clausia"]').evaluate((e) => Math.round(e.getBoundingClientRect().width));
    const sideEl = await page.locator("nav[aria-label='القائمة']").evaluate((e) => Math.round(e.getBoundingClientRect().width));
    check(cw === chatW, `${w}: the chat is ${chatW} wide`, String(cw));
    check(sideEl === sideW, `${w}: the sidebar is ${sideW} wide`, String(sideEl));
    check(await noScroll(), `${w}: the agenda (week) has no horizontal scroll`);
    await page.goto(`${BASE}/agenda?tab=decide`, { waitUntil: "load" });
    await page.getByRole("navigation", { name: "أقسام الأجندة" }).waitFor({ timeout: 60_000 });
    check(await noScroll(), `${w}: «محتاجة قرار» has no horizontal scroll`);
    if (caseRow?.[0]) {
      await page.goto(`${BASE}/cases/${caseRow[0].id}`, { waitUntil: "load", timeout: 120_000 });
      const cells = page.locator("main dl > div");
      await cells.first().waitFor({ timeout: 60_000 });
      const fit = await page.locator("main dl").evaluate((dl) => { const r = dl.getBoundingClientRect(); return { cells: dl.children.length, fits: dl.scrollWidth <= dl.clientWidth + 1 && [...dl.children].every((c) => { const b = c.getBoundingClientRect(); return b.left >= r.left - 1 && b.right <= r.right + 1; }) }; });
      check(fit.cells === 8 && fit.fits && (await noScroll()), `${w}: the case header (8 cells) fits, no horizontal scroll`, JSON.stringify(fit));
    }
  }
  await pageSize(1920, 1080);

  // ---- thin scrollbars: a class while something scrolls, gone about 800ms after ----
  await page.goto(`${BASE}/agenda?tab=decide`, { waitUntil: "load" });
  await page.getByRole("navigation", { name: "أقسام الأجندة" }).waitFor({ timeout: 60_000 });
  const scrolled = await page.evaluate(async () => {
    const el = [...document.querySelectorAll("*")].find((e) => { const o = getComputedStyle(e).overflowY; return (o === "auto" || o === "scroll") && e.scrollHeight > e.clientHeight + 40; });
    const target = el ?? document.documentElement;
    if (target === document.documentElement && document.documentElement.scrollHeight <= window.innerHeight + 40) return null;
    if (el) el.scrollTop += 30; else window.scrollBy(0, 30);
    await new Promise((r) => setTimeout(r, 150));
    const during = target.classList.contains("is-scrolling");
    await new Promise((r) => setTimeout(r, 1200));
    return { during, after: target.classList.contains("is-scrolling") };
  });
  if (!scrolled) console.log("SKIP  scrollbars: nothing on this page scrolls at 1920x1080");
  else check(scrolled.during && !scrolled.after, "scrolling puts .is-scrolling on the box, and it is gone ~800ms after", JSON.stringify(scrolled));

  // ---- the old addresses ----
  for (const [from, want] of [["/hearings", "/agenda"], [`/hearings?view=week&date=${dmy(DAY)}`, `/agenda?view=week&date=${dmy(DAY)}`], ["/hearings?filter=undecided", "/agenda?tab=decide"]] as const) {
    await page.goto(`${BASE}${from}`, { waitUntil: "load", timeout: 120_000 });
    check(url() === want, `${from} → ${want}`, url());
  }
  check(errors.length === 0, "no page errors", errors.join(" | "));
} finally {
  await browser.close();
}
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
