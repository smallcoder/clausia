// Screenshots of the two-gold-tokens PR → screenshots/gold-tokens/ (read only, no model call, no database write).
//   <TAG>-<home|case|hearings>-<1440|390>-light.png   TAG = before (origin/main) | after
//   after-case-1440-dark.png                          dark is unchanged (gold stays #D6C08F)
// Needs the app running. Run: TAG=after npx tsx --conditions=react-server --env-file=.env.local scripts/gold-shots.ts [baseUrl]
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5210";
const TAG = process.env.TAG ?? "after";
const OUT = "screenshots/gold-tokens";
mkdirSync(OUT, { recursive: true });

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
  await page.waitForSelector('textarea[aria-label="رسالة لـ Clausia"]', { timeout: 30_000 });
  await page.waitForTimeout(1800);
}

try {
  const pages: [string, string][] = [["home", "/"], ["case", `/cases/${caseId}`], ["hearings", "/hearings"]];
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    for (const [name, path] of pages) {
      const [ctx, page] = await ctxOf(w, h, false);
      await go(page, path);
      if (name === "home" && w === 1440) console.log(`${TAG}: --gold = ${await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--gold").trim())}`);
      await page.screenshot({ path: `${OUT}/${TAG}-${name}-${w}-light.png` });
      await ctx.close();
    }
  }
  if (TAG === "after") {
    const [ctx, page] = await ctxOf(1440, 900, true);
    await go(page, `/cases/${caseId}`);
    await page.screenshot({ path: `${OUT}/after-case-1440-dark.png` });
    await ctx.close();
  }
  console.log(`shots saved to ${OUT}/${TAG}-*.png`);
} finally {
  await browser.close();
}
