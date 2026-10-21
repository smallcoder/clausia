// Owner decisions pass, Case screen: shoots /cases/<772/2025> at 1440×960 and 390×844, light and dark (viewport +
// full page), the open «…» menu, and the hearings view with judgments (4521/2026) → screenshots/d-case/*.png, plus
// side-by-side images (mockup left, app full page right) → screenshots/d-case/compare-<View>.png.
// Logs in once and reuses the session (storageState). Needs the app running.
// Run: npx tsx --env-file=.env.local scripts/d-case-shots.ts [baseUrl] [statePath]
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const [BASE = "http://localhost:3501", STATE = "/tmp/clausia-d-case-state.json"] = process.argv.slice(2);
const OUT = "screenshots/d-case";
mkdirSync(OUT, { recursive: true });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await db.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const caseId = async (n: string, y: number) => (await db.from("cases").select("id").eq("case_number", n).eq("case_year", y).limit(1).maybeSingle()).data?.id as string;
const c772 = await caseId("772", 2025);
const c4521 = await caseId("4521", 2026);
if (!c772 || !c4521) throw new Error(`case not found: 772=${c772} 4521=${c4521}`);

const browser = await chromium.launch();
if (!existsSync(STATE)) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await page.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.click('button:has-text("دخول")')]);
  await ctx.storageState({ path: STATE });
  await ctx.close();
}

const pin = "html{position:relative} .bg-fade.fixed{position:absolute}";
for (const dark of [false, true]) for (const mobile of [false, true]) {
  const view = `${dark ? "Dark" : "Light"}${mobile ? "Mobile" : ""}Case`;
  const ctx = await browser.newContext({
    storageState: STATE, viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 }, deviceScaleFactor: mobile ? 2 : 1,
    locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light",
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/cases/${c772}`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${view}.png` });

  // the «…» menu, open (the visible button: mobile floating one, desktop next to back)
  await page.locator('button[aria-label="المزيد"]:visible').first().click();
  await page.waitForSelector('[role="menu"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${view}-menu.png` });
  await page.keyboard.press("Escape");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  // full page: pin the fixed composer dock to the document's end (over its spacer)
  await page.addStyleTag({ content: pin });
  const full = resolve(`${OUT}/${view}-full.png`);
  await page.screenshot({ path: full, fullPage: true });

  // hearings view with the judgments (4521/2026 has one)
  await page.goto(`${BASE}/cases/${c4521}?tab=hearings`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(900);
  await page.addStyleTag({ content: pin });
  await page.screenshot({ path: `${OUT}/${view}-hearings-4521-full.png`, fullPage: true });
  await ctx.close();
  console.log(view);

  const mw = mobile ? 390 : 1440;
  const html = `<html><body style="margin:0;background:${dark ? "#05070c" : "#dfe2e8"};font:600 14px -apple-system,sans-serif;color:${dark ? "#ccc" : "#333"}">
    <div style="display:flex;gap:24px;padding:16px;align-items:flex-start">
      <div><div style="padding:0 0 8px">Mockup · ${view}</div><img src="data:image/png;base64,${readFileSync(`screenshots/mockups/${view}.png`).toString("base64")}" style="width:${mw}px;display:block"></div>
      <div><div style="padding:0 0 8px">App · /cases/772 (${mw}px)</div><img src="data:image/png;base64,${readFileSync(full).toString("base64")}" style="width:${mw}px;display:block"></div>
    </div></body></html>`;
  const c2 = await browser.newContext({ viewport: { width: mw * 2 + 56, height: 800 } });
  const p2 = await c2.newPage();
  await p2.setContent(html, { waitUntil: "load" });
  await p2.screenshot({ path: `${OUT}/compare-${view}.png`, fullPage: true });
  await c2.close();
}
await browser.close();
