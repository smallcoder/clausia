// Exact-layout pass, Cases list: /cases at 1440×960 and 390×844, light and dark, viewport + full page
// → screenshots/x/cases-<View>.png and cases-<View>-full.png, plus side by side (mockup left, app right)
// → screenshots/compare-x/<View>.png. Logs in ONCE and reuses the storage state; SHOT_REUSE=1 skips the login.
// Needs the app running. Run: npx tsx --env-file=.env.local scripts/x-cases-shots.ts [baseUrl] [path]
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [BASE = "http://localhost:3405", PATH = "/cases"] = process.argv.slice(2);
mkdirSync("screenshots/x", { recursive: true });
mkdirSync("screenshots/compare-x", { recursive: true });
const state = join(process.env.SHOT_STATE_DIR ?? tmpdir(), "clausia-x-cases-state.json");
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

const tag = process.env.SHOT_TAG ? `-${process.env.SHOT_TAG}` : "";
for (const dark of [false, true]) for (const mobile of [false, true]) {
  const view = `${dark ? "Dark" : "Light"}${mobile ? "Mobile" : ""}Cases`;
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 }, deviceScaleFactor: mobile ? 2 : 1,
    locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light", storageState: state,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${PATH}`, { waitUntil: "load", timeout: 60_000 });
  if (page.url().includes("/login")) throw new Error("not logged in");
  await page.waitForTimeout(900);
  const vp = resolve(`screenshots/x/cases-${view}${tag}.png`);
  await page.screenshot({ path: vp });
  await page.screenshot({ path: resolve(`screenshots/x/cases-${view}${tag}-full.png`), fullPage: true });
  await ctx.close();
  if (tag) { console.log(view); continue; }

  const mw = mobile ? 390 : 1440;
  const img = (p: string) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
  const html = `<html><body style="margin:0;background:${dark ? "#05070c" : "#dfe2e8"};font:600 14px -apple-system,sans-serif;color:${dark ? "#ccc" : "#333"}">
    <div style="display:flex;gap:24px;padding:16px;align-items:flex-start">
      <div><div style="padding:0 0 8px">Mockup · ${view}</div><img src="${img(resolve(`screenshots/mockups/${view}.png`))}" style="width:${mw}px;display:block"></div>
      <div><div style="padding:0 0 8px">App · ${PATH} (${mw}px, viewport)</div><img src="${img(vp)}" style="width:${mw}px;display:block"></div>
    </div></body></html>`;
  const cmp = await browser.newContext({ viewport: { width: mw * 2 + 56, height: 800 } });
  const p = await cmp.newPage();
  await p.setContent(html, { waitUntil: "load" });
  await p.screenshot({ path: `screenshots/compare-x/${view}.png`, fullPage: true });
  await cmp.close();
  console.log(view);
}
await browser.close();
