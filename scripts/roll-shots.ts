// Roll (design v2) screenshots: /hearings at 1440×960 and 390×844, light and dark, plus ?filter=undecided and the
// open decision sheet → screenshots/v3/roll-*.png. Logs in ONCE and reuses the storage state.
// Needs the app running. Run: npx tsx --env-file=.env.local scripts/roll-shots.ts [baseUrl] [extraQuery]
// SHOT_REUSE=1 skips the login.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [BASE = "http://localhost:3304", extra = ""] = process.argv.slice(2);
mkdirSync("screenshots/v3", { recursive: true });
const state = join(process.env.SHOT_STATE_DIR ?? tmpdir(), "clausia-roll-state.json");
const browser = await chromium.launch();

if (!process.env.SHOT_REUSE) {
  const login = await browser.newContext({ locale: "ar-EG", timezoneId: "Africa/Cairo" });
  const page = await login.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await page.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 }), page.click('button:has-text("دخول")')]);
  await login.storageState({ path: state });
  await login.close();
}

const tag = process.env.SHOT_TAG ? `${process.env.SHOT_TAG}-` : "";
for (const scheme of ["light", "dark"] as const) for (const kind of ["desktop", "mobile"] as const) {
  const mobile = kind === "mobile";
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 }, deviceScaleFactor: mobile ? 2 : 1,
    locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: scheme, storageState: state,
  });
  const page = await ctx.newPage();
  const shot = async (name: string, path: string, full = true) => {
    await page.goto(`${BASE}${path}`, { waitUntil: "load" });
    if (page.url().includes("/login")) throw new Error("not logged in");
    await page.waitForTimeout(600);
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    if (sw > iw) console.log(`  OVERFLOW ${name} ${scheme} ${kind}: ${sw} > ${iw}`);
    await page.screenshot({ path: `screenshots/v3/roll-${tag}${name}-${scheme}-${kind}.png`, fullPage: full });
    console.log(name, scheme, kind);
  };
  await shot("day", `/hearings${extra}`);
  if (scheme === "light" || process.env.SHOT_ALL) {
    await shot("undecided", "/hearings?filter=undecided");
    await shot("week", `/hearings?view=week${extra ? `&${extra.slice(1)}` : ""}`);
    // the decision sheet, opened from the first undecided hearing
    await page.goto(`${BASE}/hearings?filter=undecided`, { waitUntil: "load" });
    await page.waitForTimeout(400);
    const row = page.locator('button[aria-haspopup="dialog"]').first();
    if (await row.count()) {
      await row.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `screenshots/v3/roll-${tag}sheet-${scheme}-${kind}.png` });
      console.log("sheet", scheme, kind);
    }
  }
  await ctx.close();
}
await browser.close();
