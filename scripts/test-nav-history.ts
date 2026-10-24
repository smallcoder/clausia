// History check for the optimistic clicks (sidebar item, case tab): click -> land -> Back -> Forward. After EACH step the active sidebar item / tab must
// match the address, and no loading skeleton may be left in <main>. Read only (it navigates; every POST is aborted after the login).
//   npx next build && npx next start -p 3417
//   npx tsx --env-file=.env.local scripts/test-nav-history.ts 3417
import { chromium, type Page } from "@playwright/test";

const arg = process.argv[2] ?? "3417";
const BASE = /^https?:/.test(arg) ? arg : `http://localhost:${arg}`;
const email = process.env.DEMO_EMAIL, password = process.env.DEMO_PASSWORD;
if (!email || !password) throw new Error("DEMO_EMAIL / DEMO_PASSWORD missing (run with --env-file=.env.local)");
if (new URL(BASE).port === "3000") throw new Error("port 3000 is the owner's dev server");

const SKEL = "main [role=status][aria-busy=true]";
const TAB_LABEL: Record<string, string> = { hearings: "الجلسات", sides: "الطلبات والدفوع", facts: "الوقائع", documents: "المستندات", memos: "المذكرات والأحكام" };
let failures = 0;
const fail = (m: string) => { failures++; console.log(`  FAIL ${m}`); };

/** wait until the page has settled: no skeleton in <main>, and still none a moment later (a stuck one would stay) */
async function settled(page: Page) {
  await page.waitForFunction((s) => !document.querySelector(s), SKEL, { timeout: 15000 });
  await page.waitForTimeout(700);
}

async function checkNav(page: Page, step: string, wantTitle: string) {
  await settled(page);
  const on = await page.$$eval('nav[aria-label="القائمة"] ul:first-of-type a[aria-current="page"]', (as) => as.map((a) => a.getAttribute("title")));
  const skel = await page.locator(SKEL).count();
  const ok = on.length === 1 && on[0] === wantTitle && skel === 0;
  console.log(`${ok ? "ok  " : "FAIL"} ${step}: address ${new URL(page.url()).pathname} | active sidebar item: ${on.join(",") || "none"} (want ${wantTitle}) | skeletons: ${skel}`);
  if (!ok) failures++;
}

async function checkTab(page: Page, step: string, wantTab: string) {
  await settled(page);
  const on = await page.$$eval('nav[aria-label="أقسام القضية"] a[aria-current="page"]', (as) => as.map((a) => (a.textContent ?? "").trim()));
  const skel = await page.locator(SKEL).count();
  const ok = on.length === 1 && on[0].startsWith(TAB_LABEL[wantTab]) && skel === 0;
  console.log(`${ok ? "ok  " : "FAIL"} ${step}: address ${new URL(page.url()).pathname}${new URL(page.url()).search} | active tab: ${on.join(",") || "none"} (want ${TAB_LABEL[wantTab]}) | skeletons: ${skel}`);
  if (!ok) failures++;
}

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "ar-EG" })).newPage();
await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', password);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), page.click('button:has-text("دخول")')]);
await page.route("**/*", (r) => (r.request().method() === "POST" ? r.abort() : r.continue())); // reads only, from here on

console.log("sidebar: Home -> Agenda -> Back -> Forward");
await page.goto(`${BASE}/`);
await page.waitForSelector("main");
await settled(page);
await checkNav(page, "start", "الرئيسية");
await page.click('nav[aria-label="القائمة"] a[title="الأجندة"]');
await page.waitForURL((u) => u.pathname.startsWith("/agenda"));
await checkNav(page, "after click (landed)", "الأجندة");
await page.goBack();
await page.waitForURL((u) => u.pathname === "/");
await checkNav(page, "after Back", "الرئيسية");
await page.goForward();
await page.waitForURL((u) => u.pathname.startsWith("/agenda"));
await checkNav(page, "after Forward", "الأجندة");

console.log("case tabs: hearings -> facts -> Back -> Forward -> documents -> Back");
await page.goto(`${BASE}/cases`);
await page.waitForSelector("main a[href^='/cases/']");
const caseHref = (await page.locator("main a[href^='/cases/']").first().getAttribute("href"))!.split("?")[0];
await page.goto(`${BASE}${caseHref}`);
await page.waitForSelector('nav[aria-label="أقسام القضية"]');
await checkTab(page, "start", "hearings");
await page.click(`nav[aria-label="أقسام القضية"] a:has-text("${TAB_LABEL.facts}")`);
await page.waitForURL((u) => u.search.includes("tab=facts"));
await checkTab(page, "after click (landed)", "facts");
await page.goBack();
await page.waitForURL((u) => !u.search.includes("tab="));
await checkTab(page, "after Back", "hearings");
await page.goForward();
await page.waitForURL((u) => u.search.includes("tab=facts"));
await checkTab(page, "after Forward", "facts");
await page.click(`nav[aria-label="أقسام القضية"] a:has-text("${TAB_LABEL.documents}")`);
await page.waitForURL((u) => u.search.includes("tab=documents"));
await checkTab(page, "documents landed", "documents");
await page.goBack();
await page.waitForURL((u) => u.search.includes("tab=facts"));
await checkTab(page, "documents -> Back", "facts");

await browser.close();
console.log(failures ? `FAIL (${failures})` : "PASS");
process.exit(failures ? 1 : 0);
