// Screenshots of the flip PR (chat on the right) → screenshots/compare/flip/. NO model call, NO database write (reads only).
//   Flip-<Home|Case>-<1440|1920>-<light|dark>      the page at that width (case 772)
//   Flip-compare-<Home|Case>-1920-<light|dark>     the mockup (Flip*) next to the real page
//   Flip-sessions-<light|dark>                     the sessions list opened from the header title (1440, case 772)
//   Flip-M-Home-<light|dark>                       the phone (390): unchanged
// It also checks (prints PASS / FAIL): no horizontal scroll at 1280 / 1440 / 1920, the chat panel's right edge = the logo's right edge,
// the page's left edge = the account icons' left edge, no brand in the panel header, the header title opens the list, Tab order.
// Log in once with DEMO_EMAIL / DEMO_PASSWORD (from .env.local; never printed) into a storageState.
// Needs the app running. Run: npx tsx --conditions=react-server --env-file=.env.local scripts/flip-shots.ts [baseUrl]
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5100";
const OUT = "screenshots/compare/flip";
mkdirSync(OUT, { recursive: true });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const { data: c } = await sb.from("cases").select("id").eq("case_number", "772").limit(1).single();
const caseId = c!.id as string;

const failures: string[] = [];
const check = (ok: boolean, label: string) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failures.push(label); };

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
  await page.addInitScript("window.__name = (f) => f"); // tsx wraps named functions with __name; page.evaluate bodies need it in the page
  await page.addInitScript(() => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s)); });
  return [ctx, page];
}
async function go(page: Page, path: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForSelector('textarea[aria-label="رسالة لـ Clausia"]', { timeout: 30_000 });
  await page.waitForTimeout(1500);
}
const shot = (page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }) => page.screenshot({ path: `${OUT}/${name}.png`, clip });

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

const ASIDE = 'aside[aria-label="محادثة Clausia"]';

try {
  for (const dark of [false, true]) {
    const t = dark ? "dark" : "light";
    const M = dark ? "Dark" : "Light";
    for (const [w, h] of [[1440, 900], [1920, 1080]] as const) {
      for (const [name, path] of [["Home", "/"], ["Case", `/cases/${caseId}`]] as const) {
        const [ctx, page] = await ctxOf(w, h, dark);
        await go(page, path);
        await shot(page, `Flip-${name}-${w}-${t}`);
        if (w === 1920) await compare(`${OUT}/Flip-${name}-1920-${t}.png`, `screenshots/mockups/split/Flip${M}${name}.png`, `${OUT}/Flip-compare-${name}-1920-${t}.png`, `Flip${M}${name}`, dark);
        await ctx.close();
      }
    }
    // the phone: unchanged
    {
      const [ctx, page] = await ctxOf(390, 844, dark);
      await go(page, "/");
      await shot(page, `Flip-M-Home-${t}`);
      await ctx.close();
    }
    // the sessions list opened from the header title (1440, case 772)
    {
      const [ctx, page] = await ctxOf(1440, 900, dark);
      await go(page, `/cases/${caseId}`);
      await page.locator(`${ASIDE} button[aria-haspopup="true"]`).first().click();
      await page.waitForTimeout(500);
      const aside = (await page.locator(ASIDE).boundingBox())!;
      await shot(page, `Flip-sessions-${t}`, { x: aside.x - 16, y: aside.y - 16, width: aside.width + 32, height: Math.min(560, aside.height) + 32 });
      await ctx.close();
    }
  }

  // geometry, scroll, brand (light is enough: the layout is the same)
  for (const [w, h] of [[1280, 800], [1440, 900], [1920, 1080]] as const) {
    for (const [name, path] of [["Home", "/"], ["Case", `/cases/${caseId}`]] as const) {
      const [ctx, page] = await ctxOf(w, h, false);
      await go(page, path);
      const m = await page.evaluate((sel) => {
        const r = (el: Element | null) => (el ? el.getBoundingClientRect() : null);
        const aside = document.querySelector(sel) as HTMLElement;
        return {
          aside: r(aside), logo: r(document.querySelector('header a[href="/"]')), main: r(document.querySelector("main")), icons: r(document.querySelector("header > div:last-child")),
          head: aside.innerText.split("\n").slice(0, 3).join(" | "),
          sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        };
      }, ASIDE);
      console.log(`  header ${name} ${w}: ${m.head}`);
      check(m.sw <= m.cw, `${name} ${w}: no horizontal scroll (${m.sw} <= ${m.cw})`);
      check(Math.abs(m.aside!.right - m.logo!.right) <= 1, `${name} ${w}: chat right edge ${m.aside!.right.toFixed(0)} = logo right edge ${m.logo!.right.toFixed(0)}`);
      check(Math.abs(m.main!.left - m.icons!.left) <= 1, `${name} ${w}: page left edge ${m.main!.left.toFixed(0)} = account icons left edge ${m.icons!.left.toFixed(0)}`);
      check(m.main!.right < m.aside!.left, `${name} ${w}: the page is left of the chat`);
      check(!/Clausia/.test(m.head), `${name} ${w}: no brand in the panel header`);
      await ctx.close();
    }
  }

  // the header title, Tab order, the cite panel's anchor
  {
    const [ctx, page] = await ctxOf(1440, 900, false);
    await go(page, `/cases/${caseId}`);
    const list = page.locator(`${ASIDE} a:has-text("محادثة جديدة")`);
    await page.locator(`${ASIDE} button[aria-haspopup="true"]`).first().click();
    check(await list.isVisible(), "the title opens the sessions list");
    await page.keyboard.press("Escape");
    check(!(await list.isVisible()), "Esc closes it");
    await go(page, `/cases/${caseId}`); // a fresh load: Tab starts at the top of the page
    const seen: string[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      seen.push(await page.evaluate((sel) => {
        const e = document.activeElement as HTMLElement;
        return e.closest("header") ? "H" : e.closest(sel) ? "C" : "P";
      }, ASIDE));
    }
    console.log("  tab zones (H header, P page, C chat):", seen.join(""));
    const firstP = seen.indexOf("P"), firstC = seen.indexOf("C");
    check(firstP >= 0 && firstC > firstP && seen.slice(0, firstP).every((z) => z === "H"), "Tab order: header, then the page, then the chat");
    // the cite panel's classes (desktop): end-10 = 40px from the left edge in RTL, over the page column
    const left = await page.evaluate(() => { const d = document.createElement("div"); d.className = "fixed bottom-6 end-10 top-25 w-160"; document.body.appendChild(d); const r = d.getBoundingClientRect(); d.remove(); return r.left; });
    check(left === 40, `cite panel anchors on the page side (left ${left})`);
    // an item's side sheet (a modal) keeps covering the chat side: its right edge is the screen's right edge
    const id = await page.locator('[id^="item-"]').first().getAttribute("id");
    if (id) {
      await page.evaluate((h) => { window.location.hash = h; }, `#${id}`);
      await page.waitForTimeout(600);
      const b = await page.locator("dialog[open]").first().boundingBox();
      check(!!b && Math.abs(b.x + b.width - 1440) <= 1, `item sheet opens on the chat side (right edge ${b ? (b.x + b.width).toFixed(0) : "none"})`);
    } else console.log("  (no item on this case page: item sheet not checked)");
    await ctx.close();
  }
} finally {
  await browser.close();
}
if (failures.length) { console.log(`\n${failures.length} FAILED`); process.exit(1); }
console.log("\nall checks passed");
