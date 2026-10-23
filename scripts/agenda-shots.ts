// Screenshots + checks of the agenda (PR 2 of the restructure) → screenshots/agenda/ (read only: no model call, no database write; the decision flow is only opened).
//   <day|week|month|flow>-<1920|1440>-<light|dark>   the page with the sidebar and the chat
//   m-<day|week|month|flow>-390-<light|dark>          the phone (the page is a sheet over the chat)
//   compare-day-1920-<t>, compare-m-day-390-<t>        the mockup (docs/design/ia/IAAgenda*, MAgenda*, rendered to mockups/) next to the build
// Checks (printed): no horizontal scroll at 390 / 1280 / 1440 / 1600 / 1920 (day, week, month, flow open), AA contrast of the agenda's text (and the flow's),
// the redirects of the old addresses, the chat panel beside the page.
// Needs the app running and the mockups rendered (npx tsx scripts/mockup-shots-ia.ts screenshots/agenda/mockups Agenda).
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/agenda-shots.ts [baseUrl] [dd/mm/yyyy of the day to shoot]
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3101";
const DAY = process.argv[3] ?? "20/10/2026";
const OUT = "screenshots/agenda";
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

const VIEWS: [string, string][] = [["day", `/agenda?view=day&date=${DAY}`], ["week", `/agenda?view=week&date=${DAY}`], ["month", `/agenda?view=month&date=${DAY}`], ["flow", `/agenda?decide=1&date=${DAY}`]];

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
  for (const dark of [false, true]) {
    const t = theme(dark);
    for (const [w, h] of [[1920, 1080], [1440, 900]] as const) {
      for (const [name, path] of VIEWS) {
        const [ctx, page] = await ctxOf(w, h, dark);
        await go(page, path);
        await shot(page, `${name}-${w}-${t}`);
        if (w === 1920) await contrast(page, name === "flow" ? "[role='dialog']" : "main#page", `${name} ${w} ${t}`);
        await ctx.close();
      }
    }
    for (const [name, path] of VIEWS) {
      const [ctx, page] = await ctxOf(390, 844, dark);
      await go(page, path);
      await shot(page, `m-${name}-390-${t}`);
      await contrast(page, name === "flow" ? "[role='dialog']" : "main#page", `m-${name} 390 ${t}`);
      await ctx.close();
    }
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
    await cmp(`day-1920-${t}`, `IAAgenda${T}`, `day-1920-${t}`, 1100);
    await cmp(`m-day-390-${t}`, `MAgenda${T}`, `m-day-390-${t}`, 390);
  }
  await mock.close();

  // ---- no horizontal scroll ----
  for (const w of [390, 1280, 1440, 1600, 1920]) {
    const [ctx, page] = await ctxOf(w, w < 600 ? 844 : 900, false);
    for (const [name, path] of VIEWS) {
      await go(page, path);
      const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      if (r.sw > r.iw) problems.push(`horizontal scroll at ${w} on the ${name} view: ${r.sw} > ${r.iw}`);
      if (w === 1280 && name === "day") await shot(page, "day-1280-light");
    }
    console.log(`overflow check at ${w}: done`);
    await ctx.close();
  }

  // ---- the old addresses go to the agenda, and the chat panel is beside it ----
  {
    const [ctx, page] = await ctxOf(1440, 900, false);
    for (const [from, want] of [["/hearings", /^\/agenda$/], ["/hearings?view=week&date=20/10/2026", /^\/agenda\?view=week&date=20\/10\/2026$/], ["/hearings?filter=undecided", /^\/agenda\?decide=1$/]] as const) {
      await page.goto(`${BASE}${from}`, { waitUntil: "load", timeout: 120_000 });
      const u = new URL(page.url());
      const got = decodeURIComponent(u.pathname + u.search);
      console.log(`${from} → ${got}`);
      if (!want.test(got)) problems.push(`redirect of ${from} went to ${got}`);
    }
    await go(page, `/agenda?view=day&date=${DAY}`);
    const chat = await page.locator('textarea[aria-label="رسالة لـ Clausia"]').count();
    if (!chat) problems.push("no chat input beside the agenda");
    console.log(`chat input beside the agenda: ${chat}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(problems.length ? `PROBLEMS:\n  ${problems.join("\n  ")}` : "checks: no problems");
