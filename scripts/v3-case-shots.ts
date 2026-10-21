// Case page screenshots for design v2 (redesign v3): 1440×960 and 390×844, light and dark (viewport + full page), plus one mobile shot with
// another tab selected → screenshots/v3/case-<scheme>-<desktop|mobile>[-tab].png. Logs in once and reuses the session.
// Needs the app running. Run: npx tsx --env-file=.env.local scripts/v3-case-shots.ts <caseId> [baseUrl] [statePath]
// SHOT_PATH appends to the case URL (e.g. "?tab=hearings"); SHOT_SUFFIX names the file variant; SHOT_TAP=1 also shoots the first fact's sheet; SHOT_BANNER=1 taps the mobile review banner.
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";

const [caseId, BASE = "http://localhost:3303", STATE = "/tmp/clausia-v3-state.json"] = process.argv.slice(2);
const suffix = process.env.SHOT_SUFFIX ?? "";
mkdirSync("screenshots/v3", { recursive: true });
const browser = await chromium.launch();

if (!existsSync(STATE)) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await page.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 }), page.click('button:has-text("دخول")')]);
  await ctx.storageState({ path: STATE });
  await ctx.close();
}

for (const scheme of ["light", "dark"] as const) for (const kind of ["desktop", "mobile"] as const) {
  const mobile = kind === "mobile";
  const ctx = await browser.newContext({
    storageState: STATE,
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 }, deviceScaleFactor: mobile ? 2 : 1,
    locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: scheme,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/cases/${caseId}${process.env.SHOT_PATH ?? ""}`, { waitUntil: "load" });
  await page.waitForTimeout(700);
  // the viewport as the lawyer sees it (fixed composer at the bottom), then the whole page
  await page.screenshot({ path: `screenshots/v3/case-${scheme}-${kind}${suffix}.png` });
  // full page: pin the fixed composer dock to the document's end (over its spacer) instead of the first viewport
  const pin = await page.addStyleTag({ content: "html{position:relative} .bg-fade.fixed{position:absolute}" });
  await page.screenshot({ path: `screenshots/v3/case-${scheme}-${kind}${suffix}-full.png`, fullPage: true });
  await pin.evaluate((n) => (n as Element).remove());
  if (process.env.SHOT_TAP) {
    // tap the first fact: its actions open in the sheet (mobile) / side panel (desktop)
    await page.locator('#facts button[aria-haspopup="dialog"]').first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `screenshots/v3/case-${scheme}-${kind}-sheet${suffix}.png` });
    await page.keyboard.press("Escape");
  }
  if (mobile && process.env.SHOT_BANNER) {
    // the review banner's same-page link must open the suggested item's sheet
    await page.locator('a[href*="#item-"]:visible').first().click();
    await page.waitForTimeout(600);
    console.log("sheet open after banner:", await page.locator("dialog[open]").count());
    await page.screenshot({ path: `screenshots/v3/case-${scheme}-${kind}-banner${suffix}.png` });
    await page.keyboard.press("Escape");
  }
  if (mobile && !process.env.SHOT_PATH) {
    await page.getByRole("tab", { name: /المستندات/ }).click();
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo(0, 420));
    await page.waitForTimeout(200);
    await page.screenshot({ path: `screenshots/v3/case-${scheme}-${kind}-tab${suffix}.png` });
  }
  await ctx.close();
  console.log(scheme, kind);
}
await browser.close();
