// Exact-layout pass for the roll: shoots /hearings (default view = today) at 1440×960 and 390×844, light and dark,
// viewport + full page → screenshots/compare-x/app/, then puts each mockup render (left) next to the app shot at the
// mockup's frame size (1440×1120 / 390×1000, so the fixed composer sits where the mockup draws it) → <View>.png. Logs in ONCE and reuses the storage state (SHOT_REUSE=1 skips it).
// Needs the app running. Run: npx tsx --env-file=.env.local scripts/x-roll-shots.ts [baseUrl] [path]
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [BASE = "http://localhost:3404", PATH = "/hearings"] = process.argv.slice(2);
const OUT = process.env.SHOT_OUT ?? "screenshots/compare-x";
mkdirSync(`${OUT}/app`, { recursive: true });
const state = join(process.env.SHOT_STATE_DIR ?? tmpdir(), "clausia-xroll-state.json");
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

for (const dark of [false, true]) for (const mobile of [false, true]) {
  const view = `${dark ? "Dark" : "Light"}${mobile ? "Mobile" : ""}Roll`;
  const w = mobile ? 390 : 1440;
  const ctx = await browser.newContext({
    viewport: { width: w, height: mobile ? 844 : 960 }, deviceScaleFactor: mobile ? 2 : 1,
    locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light", storageState: state,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${PATH}`, { waitUntil: "load", timeout: 60_000 });
  if (page.url().includes("/login")) throw new Error("not logged in");
  await page.waitForTimeout(900);
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  if (sw > iw) console.log(`  OVERFLOW ${view}: ${sw} > ${iw}`);
  const vp = resolve(`${OUT}/app/${view}-viewport.png`);
  const full = resolve(`${OUT}/app/${view}-full.png`);
  await page.screenshot({ path: vp });
  await page.screenshot({ path: full, fullPage: true });
  const frame = resolve(`${OUT}/app/${view}-frame.png`);
  await page.setViewportSize({ width: w, height: mobile ? 1000 : 1120 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: frame, fullPage: true });
  await ctx.close();

  const mock = resolve(`screenshots/mockups/${view}.png`);
  const img = (p: string) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
  const html = `<html><body style="margin:0;background:${dark ? "#05070c" : "#dfe2e8"};font:600 14px -apple-system,sans-serif;color:${dark ? "#ccc" : "#333"}">
    <div style="display:flex;gap:24px;padding:16px;align-items:flex-start">
      <div><div style="padding:0 0 8px">Mockup · ${view}</div><img src="${img(mock)}" style="width:${w}px;display:block"></div>
      <div><div style="padding:0 0 8px">App · ${PATH} (${w}×${mobile ? 1000 : 1120}, real data)</div><img src="${img(frame)}" style="width:${w}px;display:block"></div>
    </div></body></html>`;
  const cmp = await browser.newContext({ viewport: { width: w * 2 + 56, height: 800 }, deviceScaleFactor: mobile ? 2 : 1 });
  const p2 = await cmp.newPage();
  await p2.setContent(html, { waitUntil: "load" });
  await p2.screenshot({ path: `${OUT}/${view}.png`, fullPage: true });
  await cmp.close();
  console.log(view);
}
await browser.close();
