// Shots of the brief page (/brief) against the mockups, and of the bell after 20:00. → screenshots/compare/next/
//   BriefLight / BriefDark          mockup (1920×1080) next to the app at 1920×1080 (real data)
//   BriefMobileLight / BriefMobileDark   mockup (390×1320 @2x) next to the app at 390×1320 @2x (real data)
//   Brief3Light / Brief3Dark        the app at 1920 with the first card cloned to 3 (real data has fewer than 3 hearings on one
//                                   day, so this shows the 3-to-a-row layout; cloned in the browser only, nothing is saved)
//   BriefBellLight / BriefBellDark  the top bar at 21:00 Cairo (the clock is faked in the browser): dot + «تحضير جلسات بكرة جاهز»
//   BriefChipsLight                 the reminder chip tapped (toast with «تراجع»), then undone («اتلغى»): this one writes a
//                                   reminder row for DEMO and deletes it again.
// Needs the app running (dev server on 4400). Run: npx tsx --env-file=.env.local scripts/brief-shots.ts [baseUrl]
import { chromium, type Browser, type BrowserContext } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:4400";
const OUT = "screenshots/compare/next";
mkdirSync(OUT, { recursive: true });
mkdirSync("screenshots/app", { recursive: true });
const state = join(tmpdir(), "clausia-brief-state.json");

const b64 = (p: string) => readFileSync(p).toString("base64");
async function pair(browser: Browser, name: string, mock: string, app: string, w: number, dark: boolean) {
  const html = `<html><body style="margin:0;background:${dark ? "#05070c" : "#dfe2e8"};font:600 14px -apple-system,sans-serif;color:${dark ? "#ccc" : "#333"}">
    <div style="display:flex;gap:24px;padding:16px;align-items:flex-start">
      <div><div style="padding:0 0 8px">Mockup · ${name} (${w}px)</div><img src="data:image/png;base64,${b64(mock)}" style="width:${w}px;display:block;border-radius:12px"></div>
      <div><div style="padding:0 0 8px">App · /brief (${w}px, real data)</div><img src="data:image/png;base64,${b64(app)}" style="width:${w}px;display:block;border-radius:12px"></div>
    </div></body></html>`;
  const c = await browser.newContext({ viewport: { width: w * 2 + 56, height: 800 } });
  const p = await c.newPage();
  await p.setContent(html, { waitUntil: "load" });
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  await c.close();
  console.log("pair", name);
}

const browser = await chromium.launch();
if (!process.env.SHOT_REUSE) {
  const login = await browser.newContext({ locale: "ar-EG", timezoneId: "Africa/Cairo" });
  const page = await login.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await page.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.click('button:has-text("دخول")')]);
  await login.storageState({ path: state });
  await login.close();
}
const ctx = (o: { w: number; h: number; dark: boolean; mobile?: boolean }): Promise<BrowserContext> =>
  browser.newContext({ storageState: state, viewport: { width: o.w, height: o.h }, deviceScaleFactor: o.mobile ? 2 : 1, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: o.dark ? "dark" : "light" });

for (const dark of [false, true]) {
  const tone = dark ? "Dark" : "Light";
  // desktop and phone, against the mockups
  for (const mobile of [false, true]) {
    const name = `Brief${mobile ? "Mobile" : ""}${tone}`;
    const c = await ctx({ w: mobile ? 390 : 1920, h: mobile ? 1320 : 1080, dark, mobile });
    const page = await c.newPage();
    await page.goto(`${BASE}/brief`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForTimeout(1200);
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    if (sw > iw) console.log(`  OVERFLOW ${name}: ${sw} > ${iw}`);
    const app = resolve(`screenshots/app/next-${name}.png`);
    await page.screenshot({ path: app });
    await c.close();
    await pair(browser, name, resolve(`screenshots/mockups/next/${name}.png`), app, mobile ? 390 : 1920, dark);
  }
  // three cards in a row (the first card cloned in the browser)
  {
    const c = await ctx({ w: 1920, h: 1080, dark });
    const page = await c.newPage();
    await page.goto(`${BASE}/brief`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      const first = document.querySelector("article");
      if (first) for (let i = 0; i < 2; i++) first.parentElement!.appendChild(first.cloneNode(true));
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/Brief3${tone}.png` });
    await c.close();
    console.log("Brief3", tone);
  }
  // the bell at 21:00 Cairo (18:00Z, winter time is not yet: Cairo is UTC+3 on 23/10/2026)
  {
    const c = await ctx({ w: 1920, h: 400, dark });
    const page = await c.newPage();
    await page.clock.install({ time: new Date("2026-10-23T18:00:00Z") });
    await page.goto(`${BASE}/hearings`, { waitUntil: "load", timeout: 60_000 });
    await page.clock.runFor(1500);
    await page.waitForSelector("text=تحضير جلسات بكرة جاهز", { timeout: 15_000 });
    await page.screenshot({ path: `${OUT}/BriefBell${tone}.png`, clip: { x: 0, y: 0, width: 1920, height: 120 } });
    await c.close();
    console.log("BriefBell", tone);
  }
}

// the reminder chip: tap → toast with «تراجع» → undo → «اتلغى»
{
  const c = await ctx({ w: 1920, h: 1080, dark: false });
  const page = await c.newPage();
  await page.goto(`${BASE}/brief`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(800);
  await page.click('button:has-text("ذكّرني الصبح 7")');
  await page.waitForSelector("text=تراجع", { timeout: 15_000 });
  await page.screenshot({ path: `${OUT}/BriefReminderLight.png` });
  await page.click('button:has-text("تراجع")');
  await page.waitForSelector("text=اتلغى", { timeout: 15_000 });
  await page.screenshot({ path: `${OUT}/BriefReminderUndoneLight.png` });
  await c.close();
  console.log("BriefReminder");
}
await browser.close();
