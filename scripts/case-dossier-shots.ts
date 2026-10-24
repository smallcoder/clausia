// Screenshots + checks of the case dossier (PR 3 of the restructure) → screenshots/case-dossier/ (read only: no model call, no database write; the decision recorder is only opened).
//   <hearings|sides|facts|documents|memos>-1920-<light|dark>   each tab with the sidebar and the chat; hearings-next-1920 = a case with a next hearing; header-1920 = the 8-cell header
//   hearings|facts-1440-<t>, hearings-1280-light                other widths
//   m-<tab>-390-<t>, m-hearings-next-390-<t>, m-tabbar-390-<t>   the phone (the page is a sheet over the chat)
//   compare-hearings-1920-<t>, compare-m-hearings-390-<t>        the mockup (docs/design/ia/IACase*, MCase*, rendered to mockups/) next to the build
// Checks (printed): no horizontal scroll at 390 / 1280 / 1440 / 1600 / 1920 (all five tabs), AA contrast of the page's text, the old addresses (/brief, ?tab=details …),
// the tab links keep the chat session and the phone sheet, the header's 8 cells in order, the chat panel beside the page.
// Needs the app running and the mockups rendered (npx tsx scripts/mockup-shots-ia.ts screenshots/case-dossier/mockups Case).
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/case-dossier-shots.ts [baseUrl] [main case id] [case with a next hearing] [case with a document]
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3101";
// the demo cases: MAIN has the most to show (4 hearings, requests and defenses, facts, a judgment); NEXT_CASE has a hearing after today; DOC_CASE has a document
const MAIN = process.argv[3] ?? "72071d66-4ab3-4682-9c3d-1ff65cdc2369";
const NEXT_CASE = process.argv[4] ?? "535bebd3-742d-4352-9a27-97303d505b5c";
const DOC_CASE = process.argv[5] ?? "64386d44-1cca-4ecf-a9ae-f81c5abc998a";
const OUT = "screenshots/case-dossier";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const login = async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await page.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90_000 }), page.click('button:has-text("دخول")')]);
  const s = await ctx.storageState();
  await ctx.close();
  return s;
};
const state = await login();

async function ctxOf(w: number, h: number, dark: boolean): Promise<[BrowserContext, Page]> {
  const touch = w < 600;
  const ctx = await browser.newContext({ storageState: state, viewport: { width: w, height: h }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light" });
  await ctx.addInitScript((d) => { try { localStorage.setItem("clausia-theme", d ? "dark" : "light"); } catch { /* none */ } }, dark);
  const page = await ctx.newPage();
  await page.addInitScript(() => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s)); });
  return [ctx, page];
}
async function go(page: Page, path: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 120_000 });
  await page.waitForSelector("main#page h1", { timeout: 60_000 }).catch(() => null);
  await page.waitForTimeout(1800);
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` });
const theme = (d: boolean) => (d ? "dark" : "light");
const problems: string[] = [];

// ---- contrast: the text colour against the pixels behind it (the text is made transparent, the page shot again, the median colour under each text box) ----
const lum = (c: number[]) => { const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
async function contrast(page: Page, root: string, tag: string) {
  const items = await page.evaluate((sel) => {
    const el0 = document.querySelector(sel);
    if (!el0) return [];
    const out: { text: string; x: number; y: number; w: number; h: number; color: number[]; size: number; weight: number }[] = [];
    // any CSS colour (srgb, oklab, color-mix …) → sRGB rgba, through a canvas
    const g = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    el0.querySelectorAll("*").forEach((el) => {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent!.trim()).map((n) => n.textContent!.trim()).join(" ");
      if (!own) return;
      // the box of the text itself (not the element, which can be wider and run under a neighbour)
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width < 2 || r.height < 2 || cs.visibility === "hidden" || cs.display === "none" || el.closest(".sr-only") || el.closest("[aria-hidden='true']") && !el.closest("[role='dialog']")) return;
      if (r.top < 0 || r.bottom > window.innerHeight || r.left < 0 || r.right > window.innerWidth) return;
      // only what can be seen: the text is the topmost thing at its centre (not clipped by a scroller, not under another panel)
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (!top || !el.contains(top)) return;
      out.push({ text: own.slice(0, 28), x: r.x, y: r.y, w: r.width, h: r.height, color: ((): number[] => { g.canvas.width = g.canvas.height = 1; g.clearRect(0, 0, 1, 1); g.fillStyle = cs.color; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; })(), size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight) });
    });
    return out;
  }, root);
  if (!items.length) return;
  const style = await page.addStyleTag({ content: `${root} *, ${root} *::before { color: transparent !important; text-shadow: none !important; }` });
  const buf = await page.screenshot();
  await style.evaluate((n) => (n as Element).remove());
  const data = await page.evaluate(async ({ b64, rects }) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const k = img.naturalWidth / window.innerWidth;
    const cv = document.createElement("canvas"); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const g = cv.getContext("2d")!; g.drawImage(img, 0, 0);
    return rects.map((r) => {
      const d = g.getImageData(Math.max(0, Math.round(r.x * k)), Math.max(0, Math.round(r.y * k)), Math.max(1, Math.round(r.w * k)), Math.max(1, Math.round(r.h * k))).data;
      const ch: number[][] = [[], [], []];
      for (let i = 0; i < d.length; i += 4) { ch[0].push(d[i]); ch[1].push(d[i + 1]); ch[2].push(d[i + 2]); }
      return ch.map((a) => { a.sort((m, n) => m - n); return a[Math.floor(a.length / 2)]; });
    });
  }, { b64: buf.toString("base64"), rects: items });
  let worst = 99;
  items.forEach((it, i) => {
    const m = it.color;
    const bg = data[i];
    const a = m[3] ?? 1;
    const fg = [0, 1, 2].map((j) => Math.round(m[j] * a + bg[j] * (1 - a)));
    const large = it.size >= 24 || (it.size >= 18.66 && it.weight >= 700);
    const r = ratio(fg, bg);
    worst = Math.min(worst, r);
    if (r < (large ? 3 : 4.5)) problems.push(`contrast ${tag}: «${it.text}» ${r.toFixed(2)}:1 (${it.size}px, text ${fg}, behind ${bg})`);
  });
  console.log(`contrast ${tag}: ${items.length} texts, lowest ${worst.toFixed(2)}:1`);
}

try {
  // ---- screenshots and contrast ----
  const TABS = ["hearings", "sides", "facts", "documents", "memos"] as const;
  for (const dark of [false, true]) {
    const t = theme(dark);
    // the five tabs, desktop (1920 on the case with the most to show; 1440 the hearings tab with a next hearing)
    for (const tab of TABS) {
      const [ctx, page] = await ctxOf(1920, 1080, dark);
      await go(page, `/cases/${tab === "documents" ? DOC_CASE : MAIN}?tab=${tab}`);
      await shot(page, `${tab}-1920-${t}`);
      await contrast(page, "main#page", `${tab} 1920 ${t}`);
      if (tab === "hearings") await page.locator("main#page header").first().screenshot({ path: `${OUT}/header-1920-${t}.png` });
      await ctx.close();
    }
    {
      const [ctx, page] = await ctxOf(1920, 1080, dark);
      await go(page, `/cases/${NEXT_CASE}?tab=hearings`);
      await shot(page, `hearings-next-1920-${t}`);
      await contrast(page, "main#page", `hearings (next hearing) 1920 ${t}`);
      await ctx.close();
    }
    for (const tab of ["hearings", "facts"] as const) {
      const [ctx, page] = await ctxOf(1440, 900, dark);
      await go(page, `/cases/${MAIN}?tab=${tab}`);
      await shot(page, `${tab}-1440-${t}`);
      await ctx.close();
    }
    // the phone: the page is a sheet over the chat; all five tabs, the tab bar, the next hearing
    for (const tab of TABS) {
      const [ctx, page] = await ctxOf(390, 844, dark);
      await go(page, `/cases/${tab === "documents" ? DOC_CASE : MAIN}?tab=${tab}`);
      await shot(page, `m-${tab}-390-${t}`);
      await contrast(page, "main#page", `m-${tab} 390 ${t}`);
      if (tab === "hearings") await page.locator("nav[aria-label='أقسام القضية']").screenshot({ path: `${OUT}/m-tabbar-390-${t}.png` });
      await ctx.close();
    }
    {
      const [ctx, page] = await ctxOf(390, 844, dark);
      await go(page, `/cases/${NEXT_CASE}?tab=hearings`);
      await shot(page, `m-hearings-next-390-${t}`);
      await ctx.close();
    }
  }

  // ---- «سجّله» is a link to the agenda's «محتاجة قرار» tab (the decision is recorded there); only the link is checked: nothing is opened or saved ----
  {
    const [ctx, page] = await ctxOf(1920, 1080, false);
    await go(page, `/cases/${NEXT_CASE}?tab=hearings`);
    const link = page.getByRole("link", { name: /القرار متسجلش/ }).first();
    if (await link.count()) {
      const href = await link.getAttribute("href");
      console.log(`«سجّله» links to ${href}: ${href === "/agenda?tab=decide" ? "ok" : "WRONG"}`);
    } else console.log("no hearing without a decision on the next-hearing case: the link was not checked");
    await ctx.close();
  }

  // ---- compare: the mockup next to the build (each shown at `dw` px wide) ----
  const mock = await browser.newContext();
  const cmp = async (name: string, mockup: string, build: string, dw: number) => {
    const m = readFileSync(`${OUT}/mockups/${mockup}.png`).toString("base64");
    const b = readFileSync(`${OUT}/${build}.png`).toString("base64");
    const p = await mock.newPage();
    await p.setViewportSize({ width: dw * 2 + 90, height: 700 });
    await p.setContent(`<body style="margin:0;background:#777;font:16px sans-serif;color:#fff"><div style="display:flex;gap:30px;padding:30px"><div><div style="padding:0 0 6px">mockup (${mockup})</div><img src="data:image/png;base64,${m}" style="width:${dw}px;display:block"></div><div><div style="padding:0 0 6px">build (${build})</div><img src="data:image/png;base64,${b}" style="width:${dw}px;display:block"></div></div></body>`);
    await p.screenshot({ path: `${OUT}/compare-${name}.png`, fullPage: true });
    await p.close();
  };
  for (const t of ["light", "dark"]) {
    const T = t === "light" ? "Light" : "Dark";
    await cmp(`hearings-1920-${t}`, `IACase${T}`, `hearings-next-1920-${t}`, 1100);
    await cmp(`m-hearings-390-${t}`, `MCase${T}`, `m-hearings-next-390-${t}`, 390);
  }
  await mock.close();

  // ---- no horizontal scroll (every tab), and the phone's tab bar scrolls sideways by itself ----
  for (const w of [390, 1280, 1440, 1600, 1920]) {
    const [ctx, page] = await ctxOf(w, w < 600 ? 844 : 900, false);
    for (const tab of TABS) {
      await go(page, `/cases/${tab === "documents" ? DOC_CASE : MAIN}?tab=${tab}`);
      const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      if (r.sw > r.iw) problems.push(`horizontal scroll at ${w} on the ${tab} tab: ${r.sw} > ${r.iw}`);
      if (w === 390 && tab === "hearings") {
        const bar = await page.locator("nav[aria-label='أقسام القضية']").evaluate((n) => ({ sw: n.scrollWidth, cw: n.clientWidth }));
        console.log(`tab bar at 390: content ${bar.sw}px in ${bar.cw}px (${bar.sw > bar.cw ? "scrolls sideways" : "fits"})`);
      }
      if (w === 1280 && tab === "hearings") await shot(page, "hearings-1280-light");
    }
    console.log(`overflow check at ${w}: done`);
    await ctx.close();
  }

  // ---- old addresses, and tab links keep the chat session and the phone sheet ----
  {
    const [ctx, page] = await ctxOf(1440, 900, false);
    const at = async (from: string) => { await page.goto(`${BASE}${from}`, { waitUntil: "load", timeout: 120_000 }); await page.waitForTimeout(3000); /* the case page streams: its redirect lands a moment after load */ const u = new URL(page.url()); return decodeURIComponent(u.pathname + u.search); };
    const want: [string, RegExp][] = [
      ["/brief", /^\/$/],
      ["/brief?date=2026-10-24", /^\/(\?date=2026-10-24)?$/],
      [`/cases/${MAIN}?tab=details`, new RegExp(`^/cases/${MAIN}\\?tab=hearings$`)],
      [`/cases/${MAIN}?tab=parties`, new RegExp(`^/cases/${MAIN}\\?tab=facts$`)],
      [`/cases/${MAIN}?tab=judgments&s=abc`, new RegExp(`^/cases/${MAIN}\\?s=abc&tab=memos$`)],
      [`/cases/${MAIN}?tab=requests&sheet=1`, new RegExp(`^/cases/${MAIN}\\?sheet=1&tab=sides$`)],
      [`/cases/${MAIN}?tab=chat`, new RegExp(`^/cases/${MAIN}$`)],
      [`/cases/${MAIN}?tab=hearings&hearing=11111111-1111-1111-1111-111111111111`, /tab=hearings&hearing=1111/],
      [`/cases/${MAIN}`, new RegExp(`^/cases/${MAIN}$`)],
    ];
    for (const [from, re] of want) {
      const got = await at(from);
      console.log(`${from} → ${got}`);
      if (!re.test(got)) problems.push(`address ${from} went to ${got}`);
    }
    // the tab links
    await go(page, `/cases/${MAIN}?tab=facts&s=abc&hearing=h1&sheet=1&q=zzz`);
    const hrefs = await page.locator("nav[aria-label='أقسام القضية'] a").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
    console.log("tab links:", hrefs.join("  "));
    if (hrefs.length !== 5 || !hrefs.every((h) => h.includes("s=abc") && h.includes("hearing=h1") && h.includes("sheet=1") && !h.includes("q=zzz") && h.includes("tab="))) problems.push(`tab links lose the chat session or the sheet: ${hrefs.join(" ")}`);
    const chat = await page.locator('textarea[aria-label="رسالة لـ Clausia"]').count();
    if (!chat) problems.push("no chat input beside the case page");
    console.log(`chat input beside the case page: ${chat}`);
    // the header: 8 cells, in the owner's order
    const labels = await page.locator("main#page header dl dt").allInnerTexts();
    const order = ["رقم الدعوى", "المحكمة", "الدائرة", "الجلسة الجاية", "الموكل", "الخصم", "محامي الخصم", "آخر قرار"];
    console.log("header cells:", labels.join(" | "));
    if (labels.length !== 8 || order.some((o, i) => !labels[i]?.startsWith(o))) problems.push(`header cells are not the 8 in order: ${labels.join(" | ")}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(problems.length ? `PROBLEMS:\n  ${problems.join("\n  ")}` : "checks: no problems");
