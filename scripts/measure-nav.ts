// Click-to-skeleton and click-to-content times of the main navigations, on a PRODUCTION server (dev compiles on the first visit, so it lies).
// Read only: it logs in, navigates and reads. It never sends a chat message and never writes.
//   npx next build && npx next start -p 3417
//   npx tsx --env-file=.env.local scripts/measure-nav.ts 3417            (or a full URL; MEASURE_RUNS=3 is the default)
// Needs DEMO_EMAIL and DEMO_PASSWORD in .env.local (the demo office).
//   skeleton = the first frame after the click where the route's loading UI (role=status + aria-busy) or the new page is on screen
//   content  = the first frame where the address is the target's, no loading UI is left, and the page's main content is on screen
//   active   = the first frame where the clicked sidebar item / tab itself is marked current (aria-current), before the page has arrived (sidebar items and case tabs only)
// Each target: a fresh page load of its start page, a pause for the viewport prefetches, then one click. One warm-up pass first, then RUNS passes; the median is reported.
import { chromium, type Page } from "@playwright/test";

const arg = process.argv[2] ?? "3417";
const BASE = /^https?:/.test(arg) ? arg : `http://localhost:${arg}`;
const RUNS = Number(process.env.MEASURE_RUNS ?? 3);
const SETTLE_MS = Number(process.env.MEASURE_SETTLE_MS ?? 2500); // time for the viewport prefetches to finish before the click
const email = process.env.DEMO_EMAIL, password = process.env.DEMO_PASSWORD;
if (!email || !password) throw new Error("DEMO_EMAIL / DEMO_PASSWORD missing (run with --env-file=.env.local)");
if (new URL(BASE).port === "3000") throw new Error("port 3000 is the owner's dev server: measure a production server on another port");

interface Target {
  name: string;
  /** where the pass starts (a full page load) */
  start: (ctx: Ctx) => string;
  /** the element to click (Playwright selector) */
  click: (ctx: Ctx) => string;
  /** a function body run in the page: true when the address is this target's */
  at: string;
  /** a selector that must exist in <main> for the content to count as arrived */
  ready?: string;
  /** a CSS selector of the clicked item itself, when it turns "current" on click (a nav item, a tab): measured as `active` */
  activeSel?: string;
  /** steps before the click that are not measured (open a sidebar case) */
  prep?: (page: Page, ctx: Ctx) => Promise<void>;
}
interface Ctx { caseId: string; draftHref: string | null; caseHref: string }

const NAV = (label: string) => `nav[aria-label="القائمة"] a[title="${label}"]`;
const navT = (name: string, from: string, label: string, at: string, ready?: string): Target => ({ name, start: () => from, click: () => NAV(label), activeSel: NAV(label), at, ready });
const TAB = (label: string) => `nav[aria-label="أقسام القضية"] a:has-text("${label}")`;
const pathIs = (p: string) => `return location.pathname === ${JSON.stringify(p)};`;
const pathStarts = (p: string) => `return location.pathname.startsWith(${JSON.stringify(p)});`;

const targets: Target[] = [
  navT("sidebar: home", "/agenda", "الرئيسية", pathIs("/")),
  navT("sidebar: agenda", "/", "الأجندة", pathStarts("/agenda"), "main h1, main [role=tablist], main button"),
  navT("sidebar: clients", "/", "الموكلين", pathIs("/clients"), "main h1"),
  navT("sidebar: library", "/", "المكتبة", pathIs("/library"), "main h1, main input"),
  {
    name: "case (from the sidebar)", start: () => "/", at: pathStarts("/cases/"), ready: "main h1",
    prep: async (page) => { await page.locator('nav[aria-label="القائمة"] button[aria-expanded]').first().click(); },
    click: () => 'nav[aria-label="القائمة"] a:has-text("ملف القضية")',
  },
  ...[["الطلبات والدفوع", "sides"], ["الوقائع", "facts"], ["المستندات", "documents"], ["المذكرات والأحكام", "memos"]].map(([label, tab]): Target => ({
    name: `case tab: ${tab}`, start: (c) => c.caseHref, click: () => TAB(label), activeSel: `nav[aria-label="أقسام القضية"] a[href*="tab=${tab}"]`, at: `return location.search.includes("tab=${tab}");`, ready: "main h1",
  })),
  { name: "client", start: () => "/clients", click: () => 'main a[href^="/clients/"]', at: pathStarts("/clients/"), ready: "main h1" },
  { name: "case (from the list)", start: () => "/cases", click: () => 'main a[href^="/cases/"]', at: pathStarts("/cases/"), ready: "main h1" },
  { name: "draft", start: (c) => `/cases/${c.caseId}?tab=memos`, click: () => 'main a[href*="draft="]', at: `return location.search.includes("draft=");`, ready: "main h1, main [contenteditable]" },
];

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

/** Installs the probe in the page: it stamps the click, then watches every DOM change for the skeleton and the content. */
const PROBE = (at: string, ready: string, activeSel: string) => `(() => {
  const w = window; w.__nav = { t0: null, skel: null, content: null, active: ${activeSel ? "null" : "0"} };
  const atTarget = new Function(${JSON.stringify(at)});
  const busy = () => document.querySelector('main [role=status][aria-busy=true]');
  const isReady = () => ${ready ? `!!document.querySelector(${JSON.stringify(ready)})` : "true"};
  const stamp = (k) => requestAnimationFrame(() => { if (w.__nav[k] === null) w.__nav[k] = performance.now(); });
  const check = () => {
    if (w.__nav.t0 === null) return;
    const loading = !!busy(), here = atTarget();
    if (w.__nav.active === null && document.querySelector(${JSON.stringify(activeSel)})?.hasAttribute("aria-current")) stamp("active");
    if (w.__nav.skel === null && (loading || (here && isReady()))) stamp("skel");
    if (w.__nav.content === null && here && !loading && isReady()) stamp("content");
  };
  document.addEventListener("click", () => { if (w.__nav.t0 === null) w.__nav.t0 = performance.now(); }, true);
  new MutationObserver(check).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  (function tick() { check(); requestAnimationFrame(tick); })();
})()`;

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email!);
  await page.fill('input[name="password"]', password!);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), page.click('button:has-text("دخول")')]);
}

async function once(page: Page, t: Target, ctx: Ctx) {
  await page.goto(`${BASE}${t.start(ctx)}`, { waitUntil: "load" });
  await page.waitForSelector("main", { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector("[role=status][aria-busy=true]"), null, { timeout: 30000 });
  if (t.prep) await t.prep(page, ctx);
  await page.waitForTimeout(SETTLE_MS);
  const sel = t.click(ctx);
  const el = page.locator(sel).first();
  await el.waitFor({ state: "visible", timeout: 15000 });
  await page.evaluate(PROBE(t.at, t.ready ?? "", t.activeSel ?? ""));
  await el.click();
  await page.waitForFunction(() => (window as unknown as { __nav: { content: number | null } }).__nav.content !== null, null, { timeout: 30000 });
  const r = await page.evaluate(() => (window as unknown as { __nav: { t0: number; skel: number; content: number; active: number | null } }).__nav);
  return { skel: r.skel - r.t0, content: r.content - r.t0, active: t.activeSel && r.active !== null ? r.active - r.t0 : NaN };
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "ar-EG" });
const page = await context.newPage();
await login(page); // (signing in is a server action too: the guard below starts after it)
// this script only navigates: a server action (the chat's sends are POSTs with a Next-Action header) must never go out, so any such request is aborted
await page.route("**/*", (r) => (r.request().method() === "POST" && r.request().headers()["next-action"] ? r.abort() : r.continue()));

// find a case (its address) and a draft, read only
await page.goto(`${BASE}/`);
await page.waitForSelector("main");
await page.locator('nav[aria-label="القائمة"] button[aria-expanded]').first().click();
const caseHref = (await page.locator('nav[aria-label="القائمة"] a:has-text("ملف القضية")').first().getAttribute("href")) ?? "";
const caseId = caseHref.split("/").pop() ?? "";
await page.goto(`${BASE}${caseHref}?tab=memos`);
await page.waitForSelector("main");
let draftHref: string | null = null;
let draftCase = caseId;
// a draft, read only: the memos tab of the first cases (up to 6) until one lists a draft
await page.goto(`${BASE}/cases`);
await page.waitForSelector("main");
const caseLinks = await page.evaluate(() => [...new Set([...document.querySelectorAll('main a[href^="/cases/"]')].map((a) => a.getAttribute("href")!.split("?")[0]))].slice(0, 6));
for (const href of [caseHref, ...caseLinks]) {
  await page.goto(`${BASE}${href}?tab=memos`);
  await page.waitForSelector("main");
  draftHref = await page.locator('main a[href*="draft="]').first().getAttribute("href").catch(() => null);
  if (draftHref) { draftCase = href.split("/").pop() ?? caseId; break; }
}
console.log(`base ${BASE} | case ${caseId} | draft ${draftHref ? "found" : "none in the first cases: draft skipped"}`);
const ctx: Ctx = { caseId: draftCase, draftHref, caseHref };

const only = process.env.MEASURE_ONLY; // e.g. MEASURE_ONLY="sidebar: home": measure the targets whose name contains this
const active = targets.filter((t) => (t.name !== "draft" || draftHref) && (!only || t.name.includes(only)));
const rows: { name: string; skel: number; content: number; act: number; skels: number[]; contents: number[] }[] = [];
for (const t of active) {
  const skels: number[] = [], contents: number[] = [], acts: number[] = [];
  try {
    await once(page, t, ctx); // warm-up (the first hit warms the server's caches)
    for (let i = 0; i < RUNS; i++) { const r = await once(page, t, ctx); skels.push(r.skel); contents.push(r.content); acts.push(r.active); }
    rows.push({ name: t.name, skel: median(skels), content: median(contents), act: median(acts.filter((x) => !Number.isNaN(x))), skels, contents });
  } catch (e) {
    console.log(`${t.name}: FAILED ${(e as Error).message.split("\n")[0]}`);
    rows.push({ name: t.name, skel: NaN, content: NaN, act: NaN, skels, contents });
  }
}
if (!draftHref) console.log("draft: SKIPPED (no draft in the demo office)");
console.log("\n| target | click-to-skeleton ms | click-to-content ms | clicked item active ms | runs (skeleton / content) |\n|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.name} | ${Math.round(r.skel)} | ${Math.round(r.content)} | ${Number.isNaN(r.act) ? "-" : Math.round(r.act)} | ${r.skels.map(Math.round).join(",")} / ${r.contents.map(Math.round).join(",")} |`);
await browser.close();
