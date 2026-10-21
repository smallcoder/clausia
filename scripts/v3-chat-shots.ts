// Design v2 (redesign v3) Chat screenshots: the /chat list, a thread with a pending card + a paper, and a thread with
// a saved (collapsed) card, and (optional) a thread whose last line is Clausia's question with options (quick-answer
// chips), at 1440×960 and 390×844, light and dark → screenshots/v3/chat-<view>-<scheme>-<desktop|mobile>.png
// Logs in ONCE and reuses the storage state (Supabase rate-limits repeated logins).
// Needs the app running (SHOT_BASE, default http://localhost:3302).
// Run: npx tsx --env-file=.env.local scripts/v3-chat-shots.ts <pendingThreadId> <savedThreadId> [questionThreadId]
// Threads also get a -top shot (the top of the page). SHOT_ONLY=list,pending limits the views; SHOT_REUSE=1 skips the login.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [pendingId, savedId, questionId] = process.argv.slice(2);
const BASE = process.env.SHOT_BASE ?? "http://localhost:3302";
const only = process.env.SHOT_ONLY?.split(",");
const views: [string, string][] = ([
  ["list", "/chat"],
  ["pending", `/chat/${pendingId}`],
  ["saved", `/chat/${savedId}`],
  ...(questionId ? [["question", `/chat/${questionId}`]] : []),
] as [string, string][]).filter(([v]) => !only || only.includes(v));

mkdirSync("screenshots/v3", { recursive: true });
const state = join(process.env.SHOT_STATE_DIR ?? tmpdir(), "clausia-v3-chat-state.json");
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
    await page.waitForTimeout(700);
    // a thread scrolls itself to its latest message, under the fixed top bar and composer: shoot the viewport there,
    // then the top of the page (the header); the list page is shot full length
    const thread = view !== "list";
    await page.screenshot({ path: `screenshots/v3/chat-${view}-${scheme}-${kind}.png`, fullPage: !thread });
    if (thread) {
      await page.evaluate(() => window.scrollTo({ top: 0 }));
      await page.waitForTimeout(300);
      await page.screenshot({ path: `screenshots/v3/chat-${view}-top-${scheme}-${kind}.png` });
    }
    console.log(view, scheme, kind);
  }
  await ctx.close();
}
await browser.close();
