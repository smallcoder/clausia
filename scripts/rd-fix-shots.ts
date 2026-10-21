// Fix-round screenshots: the case page (default, ?tab=hearings|documents|details) and a chat thread with a card,
// at 1440 and 390, light and dark → screenshots/rd/fix-<view>-<scheme>-<desktop|mobile>.png
// Logs in ONCE and reuses the storage state (Supabase rate-limits repeated logins).
// Needs the app running. Run: npx tsx --env-file=.env.local scripts/rd-fix-shots.ts <caseId> <threadId> [baseUrl]
// SHOT_ONLY=hearings,chat limits the views; SHOT_TAG=x names the files fix-x-<view>-…; SHOT_REUSE=1 skips the login.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [caseId, threadId, BASE = "http://localhost:3206"] = process.argv.slice(2);
const only = process.env.SHOT_ONLY?.split(",");
const views: [string, string][] = ([
  ["case", `/cases/${caseId}`],
  ["hearings", `/cases/${caseId}?tab=hearings`],
  ["documents", `/cases/${caseId}?tab=documents`],
  ["details", `/cases/${caseId}?tab=details`],
  ["chat", `/chat/${threadId}`],
] as [string, string][]).filter(([v]) => !only || only.includes(v));

mkdirSync("screenshots/rd", { recursive: true });
const state = join(process.env.SHOT_STATE_DIR ?? tmpdir(), "clausia-rd-fix-state.json");
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

for (const scheme of ["light", "dark"] as const) for (const kind of ["desktop", "mobile"] as const) {
  const mobile = kind === "mobile";
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 }, deviceScaleFactor: mobile ? 2 : 1,
    locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: scheme, storageState: state,
  });
  const page = await ctx.newPage();
  for (const [view, path] of views) {
    await page.goto(`${BASE}${path}`, { waitUntil: "load" });
    if (page.url().includes("/login")) throw new Error("not logged in");
    await page.waitForTimeout(600);
    await page.screenshot({ path: `screenshots/rd/fix-${process.env.SHOT_TAG ? `${process.env.SHOT_TAG}-` : ""}${view}-${scheme}-${kind}.png`, fullPage: true });
    console.log(view, scheme, kind);
  }
  await ctx.close();
}
await browser.close();
