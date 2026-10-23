// Screenshots + checks of the sidebar layout PR → screenshots/sidebar-layout/ (read only: no model call, no database write).
//   <home|case|full>-<1920|1440>-<light|dark>   the page with the sidebar and the chat (1440 = the icon sidebar); full = the full-screen chat
//   rail-1440-<light|dark>                      close-up of the icon sidebar
//   m-<home|case|drawer|sheet>-390-<light|dark> the phone: Home chat, a case's chat, the drawer open, the page sheet
//   case-1280-light                              the narrowest desktop (icon sidebar, page 688)
//   compare-<case|full>-1920-<light|dark>, compare-m-<drawer|chat>-390-<light|dark>   the mockup (docs/design/ia, rendered to mockups/) next to the real page
// Checks (printed): no horizontal scroll at 390 / 1280 / 1440 / 1920 on every page, the keyboard focus order, the sidebar's text contrast (AA).
// Needs the app running. Run: npx tsx --conditions=react-server --env-file=.env.local scripts/sidebar-shots.ts [baseUrl]
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3101";
const OUT = "screenshots/sidebar-layout";
mkdirSync(`${OUT}/mockups`, { recursive: true });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const { data: c } = await sb.from("cases").select("id").eq("case_number", "772").limit(1).single();
const caseId = c!.id as string;

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
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForSelector('textarea[aria-label="رسالة لـ Clausia"]', { timeout: 30_000 }).catch(() => null);
  await page.waitForTimeout(1800);
}
const shot = (page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }) => page.screenshot({ path: `${OUT}/${name}.png`, clip });
const theme = (d: boolean) => (d ? "dark" : "light");

const PAGES: [string, string][] = [["home", "/"], ["case", `/cases/${caseId}`], ["hearings", "/hearings"], ["cases", "/cases"], ["clients", "/clients"], ["library", "/library"]];
const problems: string[] = [];

// ---- contrast of the sidebar's text: the text colour against the real background behind it (glass over the ambient shapes, so it is measured from pixels) ----
const lum = (c: number[]) => { const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const SIDE = "nav[aria-label='القائمة']";
async function sidebarContrast(page: Page, tag: string) {
  const items = await page.evaluate((sel) => {
    const nav = document.querySelector(sel)!;
    const out: { text: string; x: number; y: number; w: number; h: number; color: string; size: number; weight: number }[] = [];
    nav.querySelectorAll("*").forEach((el) => {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent!.trim()).map((n) => n.textContent!.trim()).join(" ");
      if (!own) return;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width < 2 || r.height < 2 || cs.visibility === "hidden" || cs.display === "none" || el.closest(".sr-only")) return;
      // only what is on screen: inside the viewport and inside the list that scrolls
      const box = el.closest(".overflow-y-auto")?.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight || r.left < 0 || r.right > window.innerWidth) return;
      if (box && (r.top < box.top || r.bottom > box.bottom)) return;
      out.push({ text: own.slice(0, 24), x: r.x, y: r.y, w: r.width, h: r.height, color: cs.color, size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight) });
    });
    return out;
  }, SIDE);
  await page.addStyleTag({ content: `${SIDE} *, ${SIDE} *::before { color: transparent !important; text-shadow: none !important; }` });
  const buf = await page.screenshot();
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
    const m = it.color.match(/[\d.]+/g)!.map(Number);
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
  // ---- screenshots ----
  for (const dark of [false, true]) {
    const t = theme(dark);
    for (const [w, h] of [[1920, 1080], [1440, 900]] as const) {
      for (const [name, path] of [["home", "/"], ["case", `/cases/${caseId}`]] as const) {
        const [ctx, page] = await ctxOf(w, h, dark);
        await go(page, path);
        await shot(page, `${name}-${w}-${t}`);
        if (name === "case") {
          await sidebarContrast(page, `${w} ${t}`);
          await page.reload();
          await page.waitForSelector('textarea[aria-label="رسالة لـ Clausia"]');
          await page.waitForTimeout(800);
          await page.click('button[aria-label="كبّر الشات"]');
          await page.waitForTimeout(500);
          await shot(page, `full-${w}-${t}`);
          if (w === 1440) await shot(page, `rail-1440-${t}`, { x: 1440 - 20 - 72 - 480 - 24, y: 0, width: 72 + 480 + 44, height: 900 });
        }
        await ctx.close();
      }
    }
    // phone
    for (const [name, path] of [["home", "/"], ["case", `/cases/${caseId}`]] as const) {
      const [ctx, page] = await ctxOf(390, 844, dark);
      await go(page, path);
      await shot(page, `m-${name}-390-${t}`);
      if (name === "case") {
        await page.click('button[aria-label="القائمة"]');
        await page.waitForTimeout(500);
        await shot(page, `m-drawer-390-${t}`);
        await sidebarContrast(page, `drawer 390 ${t}`);
        await page.keyboard.press("Escape");
        await page.goto(`${BASE}/cases/${caseId}?sheet=1`, { waitUntil: "load" });
        await page.waitForTimeout(1500);
        await shot(page, `m-sheet-390-${t}`);
      }
      await ctx.close();
    }
  }

  // ---- compare: the mockup next to the build (each shown at `dw` px wide) ----
  const mock = await browser.newContext();
  const cmp = async (name: string, mockup: string, build: string, dw: number, dh: number) => {
    const m = readFileSync(`${OUT}/mockups/${mockup}.png`).toString("base64");
    const b = readFileSync(`${OUT}/${build}.png`).toString("base64");
    const p = await mock.newPage();
    await p.setViewportSize({ width: dw * 2 + 90, height: dh + 90 });
    await p.setContent(`<body style="margin:0;background:#777;font:16px sans-serif;color:#fff"><div style="display:flex;gap:30px;padding:30px"><div><div style="padding:0 0 6px">mockup (${mockup})</div><img src="data:image/png;base64,${m}" style="width:${dw}px;display:block"></div><div><div style="padding:0 0 6px">build (${build})</div><img src="data:image/png;base64,${b}" style="width:${dw}px;display:block"></div></div></body>`);
    await p.screenshot({ path: `${OUT}/compare-${name}.png`, fullPage: true });
    await p.close();
  };
  for (const t of ["light", "dark"]) {
    const T = t === "light" ? "Light" : "Dark";
    await cmp(`case-1920-${t}`, `SBC${T}`, `case-1920-${t}`, 1100, 620);
    await cmp(`full-1920-${t}`, `SBF${T}`, `full-1920-${t}`, 1100, 620);
    await cmp(`m-drawer-390-${t}`, `MDrawer${T}`, `m-drawer-390-${t}`, 390, 844);
    await cmp(`m-chat-390-${t}`, `MChat${T}`, `m-case-390-${t}`, 390, 844);
  }
  await mock.close();

  // ---- no horizontal scroll ----
  for (const w of [390, 1280, 1440, 1920]) {
    const [ctx, page] = await ctxOf(w, w < 600 ? 844 : 900, false);
    for (const [name, path] of PAGES) {
      await go(page, path);
      const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      if (r.sw > r.iw) problems.push(`horizontal scroll at ${w} on ${name}: ${r.sw} > ${r.iw}`);
      if (w === 1280 && name === "case") await shot(page, "case-1280-light");
    }
    if (w < 1280) {
      await page.click('button[aria-label="القائمة"]').catch(() => null);
      const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      if (r.sw > r.iw) problems.push(`horizontal scroll at ${w} with the drawer open: ${r.sw} > ${r.iw}`);
    } else {
      await go(page, `/cases/${caseId}`);
      await page.click('button[aria-label="كبّر الشات"]');
      const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      if (r.sw > r.iw) problems.push(`horizontal scroll at ${w} in the full-screen chat: ${r.sw} > ${r.iw}`);
    }
    console.log(`overflow check at ${w}: done`);
    await ctx.close();
  }

  // ---- keyboard focus order (1920, case page): the first 24 stops ----
  {
    const [ctx, page] = await ctxOf(1920, 1080, false);
    await go(page, `/cases/${caseId}`);
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    const stops: string[] = [];
    for (let i = 0; i < 24; i++) {
      await page.keyboard.press("Tab");
      stops.push(await page.evaluate(() => { const e = document.activeElement as HTMLElement; const where = e.closest("nav") ? "sidebar" : e.closest("aside") ? "chat" : e.closest("main") ? "page" : "other"; return `${where}: ${(e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 28)}`; }));
    }
    console.log("focus order:\n  " + stops.join("\n  "));
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(problems.length ? `PROBLEMS:\n  ${problems.join("\n  ")}` : "checks: no problems");
