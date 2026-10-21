// Case page screenshots for the redesign: 1440×960 and 390×844, light and dark → screenshots/rd/case-<scheme>-<desktop|mobile>.png
// Needs the app running. Run: npx tsx --env-file=.env.local scripts/rd-case-shots.ts <caseId> [baseUrl]
// SHOT_TAP=1 opens the first fact's sheet (viewport shot); SHOT_SUFFIX names the file variant.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [caseId, BASE = "http://localhost:3203"] = process.argv.slice(2);
const suffix = process.env.SHOT_SUFFIX ?? "";
mkdirSync("screenshots/rd", { recursive: true });
const browser = await chromium.launch();
for (const scheme of ["light", "dark"] as const) for (const kind of ["desktop", "mobile"] as const) {
  const mobile = kind === "mobile";
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 }, deviceScaleFactor: mobile ? 2 : 1,
    locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: scheme,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await page.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 }), page.click('button:has-text("دخول")')]);
  await page.goto(`${BASE}/cases/${caseId}${process.env.SHOT_PATH ?? ""}`, { waitUntil: "load" });
  await page.waitForTimeout(700);
  if (process.env.SHOT_TAP) {
    await page.locator('#facts button[aria-haspopup="dialog"]').first().click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: `screenshots/rd/case-${scheme}-${kind}${suffix}.png`, fullPage: !process.env.SHOT_TAP });
  await ctx.close();
  console.log(scheme, kind);
}
await browser.close();
