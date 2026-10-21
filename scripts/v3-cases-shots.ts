// Design v2 cases list screenshots: /cases at 1440×960 and 390×844, light and dark, plus /cases?review=1 (light desktop)
// → screenshots/v3/cases-<scheme>-<desktop|mobile>.png and cases-review-light-desktop.png.
// Logs in ONCE and reuses the storage state (Supabase rate-limits repeated logins); SHOT_REUSE=1 skips the login.
// Needs the app running. Run: npx tsx --env-file=.env.local scripts/v3-cases-shots.ts [baseUrl]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [BASE = "http://localhost:3305"] = process.argv.slice(2);
mkdirSync("screenshots/v3", { recursive: true });
const state = join(process.env.SHOT_STATE_DIR ?? tmpdir(), "clausia-v3-state.json");
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

const shots: { name: string; path: string; scheme: "light" | "dark"; mobile: boolean }[] = [];
for (const scheme of ["light", "dark"] as const) for (const mobile of [false, true]) shots.push({ name: `cases-${scheme}-${mobile ? "mobile" : "desktop"}`, path: "/cases", scheme, mobile });
shots.push({ name: "cases-review-light-desktop", path: "/cases?review=1", scheme: "light", mobile: false });

for (const s of shots) {
  const ctx = await browser.newContext({
    viewport: s.mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 }, deviceScaleFactor: s.mobile ? 2 : 1,
    locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: s.scheme, storageState: state,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${s.path}`, { waitUntil: "load" });
  if (page.url().includes("/login")) throw new Error("not logged in");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `screenshots/v3/${s.name}.png`, fullPage: process.env.SHOT_FULL === "1" });
  console.log(s.name);
  await ctx.close();
}
await browser.close();
