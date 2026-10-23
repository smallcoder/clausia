// Screenshots of the liquid-glass PR → screenshots/compare/glass/ (light and dark). NO model call, NO database write (reads only).
//   Glass-<Home|Case>-<1440|1920>-<light|dark>          the page at that width (case 772)
//   Glass-M-<Home|Case|Sheet>-<light|dark>               the phone (390): Home chat, a case's chat, the page sheet open
//   Glass-compare-<Home|Case>-1920-<light|dark>          the mockup (GlassSplit*) next to the real page
//   Glass-nav-dark / Glass-composer-modes-dark           close-ups: the active state of the nav tabs and the composer modes (dark)
//   Glass-focus-composer-mouse-<light|dark>, Glass-focus-composer-keyboard-<light|dark>, Glass-focus-input-keyboard-<light|dark>
//   Glass-bottom-page-<light|dark> / Glass-bottom-chat-<light|dark>   the end of a long page and of a long chat (the 42-message thread)
//   Glass-topbar-scrolled-<light|dark>                   the page scrolled under the top bar
// Needs the app running. Run: npx tsx --conditions=react-server --env-file=.env.local scripts/glass-shots.ts [baseUrl]
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5100";
const OUT = "screenshots/compare/glass";
mkdirSync(OUT, { recursive: true });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const { data: c } = await sb.from("cases").select("id").eq("case_number", "772").limit(1).single();
const caseId = c!.id as string;
// the longest general thread (read only)
const { data: threads } = await sb.from("chat_threads").select("id").is("case_id", null).limit(200);
let longThread = ""; let most = -1;
for (const t of threads ?? []) {
  const { count } = await sb.from("chat_messages").select("id", { count: "exact", head: true }).eq("thread_id", t.id);
  if ((count ?? 0) > most) { most = count ?? 0; longThread = t.id; }
}
console.log(`long thread: ${most} messages`);

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
  await page.waitForSelector('textarea[aria-label="رسالة لـ Clausia"]', { timeout: 30_000 });
  await page.waitForTimeout(1500);
}
const shot = (page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }) => page.screenshot({ path: `${OUT}/${name}.png`, clip });
async function boxOf(page: Page, sel: string, pad = 12) {
  const b = (await page.locator(sel).first().boundingBox())!;
  return { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + pad * 2, height: b.height + pad * 2 };
}

async function compare(app: string, mock: string, out: string, label: string, dark: boolean) {
  const html = `<html><body style="margin:0;background:${dark ? "#05070c" : "#dfe2e8"};font:600 14px -apple-system,sans-serif;color:${dark ? "#ccc" : "#333"}">
    <div style="display:flex;gap:24px;padding:16px;align-items:flex-start">
      <div><div style="padding:0 0 8px">Mockup · ${label} (1920px)</div><img src="data:image/png;base64,${readFileSync(mock).toString("base64")}" style="width:1920px;display:block;border-radius:12px"></div>
      <div><div style="padding:0 0 8px">App (1920px)</div><img src="data:image/png;base64,${readFileSync(app).toString("base64")}" style="width:1920px;display:block;border-radius:12px"></div>
    </div></body></html>`;
  const ctx = await browser.newContext({ viewport: { width: 3920, height: 800 } });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: out, fullPage: true });
  await ctx.close();
}

try {
  for (const dark of [false, true]) {
    const t = dark ? "dark" : "light";
    // the pages at 1440 / 1920
    for (const [w, h] of [[1440, 900], [1920, 1080]] as const) {
      for (const [name, path] of [["Home", "/"], ["Case", `/cases/${caseId}`]] as const) {
        const [ctx, page] = await ctxOf(w, h, dark);
        await go(page, path);
        await shot(page, `Glass-${name}-${w}-${t}`);
        if (w === 1920) await compare(`${OUT}/Glass-${name}-1920-${t}.png`, `screenshots/mockups/split/GlassSplit${dark ? "Dark" : "Light"}${name}.png`, `${OUT}/Glass-compare-${name}-1920-${t}.png`, `GlassSplit${dark ? "Dark" : "Light"}${name}`, dark);
        await ctx.close();
      }
    }
    // the phone
    for (const [name, path] of [["Home", "/"], ["Case", `/cases/${caseId}`], ["Sheet", `/cases/${caseId}?sheet=1`]] as const) {
      const [ctx, page] = await ctxOf(390, 844, dark);
      await go(page, path);
      await shot(page, `Glass-M-${name}-${t}`);
      await ctx.close();
    }

    // close-ups + focus (1440)
    {
      const [ctx, page] = await ctxOf(1440, 900, dark);
      await go(page, `/cases/${caseId}`);
      if (dark) {
        await shot(page, "Glass-nav-dark", await boxOf(page, 'nav[aria-label="الأقسام"]', 16));
        await shot(page, "Glass-composer-modes-dark", await boxOf(page, ".focus-host", 12));
      }
      // mouse: click into the composer
      await page.locator('textarea[aria-label="رسالة لـ Clausia"]').click();
      await page.waitForTimeout(400);
      await shot(page, `Glass-focus-composer-mouse-${t}`, await boxOf(page, ".focus-host", 16));
      // keyboard: leave, then Tab back in
      await page.locator("body").click({ position: { x: 700, y: 400 } });
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      for (let i = 0; i < 60; i++) {
        await page.keyboard.press("Tab");
        if (await page.evaluate(() => document.activeElement?.tagName === "TEXTAREA")) break;
      }
      await page.waitForTimeout(400);
      await shot(page, `Glass-focus-composer-keyboard-${t}`, await boxOf(page, ".focus-host", 16));
      await ctx.close();
    }
    // an input focused by keyboard: the add-hearing form's first input (Roll page), found by Tab
    {
      const [ctx, page] = await ctxOf(1440, 900, dark);
      await go(page, "/hearings");
      const has = await page.locator("main input:visible, main select:visible").count();
      if (has) {
        const el = page.locator("main input:visible, main select:visible").first();
        await el.scrollIntoViewIfNeeded();
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        for (let i = 0; i < 80; i++) {
          await page.keyboard.press("Tab");
          if (await page.evaluate(() => ["INPUT", "SELECT"].includes(document.activeElement?.tagName ?? "") && !!document.activeElement?.closest("main"))) break;
        }
        await page.waitForTimeout(400);
        const box = await page.evaluate(() => { const r = document.activeElement!.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
        await shot(page, `Glass-focus-input-keyboard-${t}`, { x: Math.max(0, box.x - 24), y: Math.max(0, box.y - 24), width: box.width + 48, height: box.height + 48 });
      } else console.log("no input on /hearings");
      await ctx.close();
    }
    // the page scrolled under the top bar
    {
      const [ctx, page] = await ctxOf(1440, 900, dark);
      await go(page, `/cases/${caseId}`);
      await page.evaluate(() => window.scrollBy(0, 330));
      await page.waitForTimeout(600);
      await shot(page, `Glass-topbar-scrolled-${t}`, { x: 0, y: 0, width: 1440, height: 260 });
      await ctx.close();
    }
    // the end of a long page and of a long chat
    {
      const [ctx, page] = await ctxOf(1440, 900, dark);
      await go(page, "/cases");
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(600);
      await shot(page, `Glass-bottom-page-${t}`);
      await go(page, `/?s=${longThread}`);
      await page.evaluate(() => { const l = document.querySelector("aside ol"); const s = l?.closest(".overflow-y-auto"); if (s) s.scrollTop = s.scrollHeight; });
      await page.waitForTimeout(600);
      await shot(page, `Glass-bottom-chat-${t}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
