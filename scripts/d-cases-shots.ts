// Owner decisions, Cases list: /cases and /cases?decision=1 at 1440×960 and 390×844, light and dark
// → screenshots/d-cases/<page>-<View>.png, plus side by side with the mockup → screenshots/d-cases/compare-<View>.png.
// Prints the third stat, the ?decision=1 row count and markers, and the first capsule's box (decision 13 check).
// Logs in ONCE and reuses the storage state. Needs the app running.
// Run: npx tsx --env-file=.env.local scripts/d-cases-shots.ts [baseUrl]
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [BASE = "http://localhost:3502"] = process.argv.slice(2);
const OUT = "screenshots/d-cases";
mkdirSync(OUT, { recursive: true });
const state = join(process.env.SHOT_STATE_DIR ?? tmpdir(), "clausia-d-cases-state.json");
const browser = await chromium.launch();

const login = await browser.newContext({ locale: "ar-EG", timezoneId: "Africa/Cairo" });
const lp = await login.newPage();
await lp.goto(`${BASE}/login`);
await lp.fill('input[name="email"]', process.env.DEMO_EMAIL!);
await lp.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
await Promise.all([lp.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), lp.click('button:has-text("دخول")')]);
await login.storageState({ path: state });
await login.close();

const pages = [["cases", "/cases"], ["cases-decision", "/cases?decision=1"], ["cases-review", "/cases?review=1"]] as const;
for (const dark of [false, true]) for (const mobile of [false, true]) {
  const view = `${dark ? "Dark" : "Light"}${mobile ? "Mobile" : ""}Cases`;
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 }, deviceScaleFactor: mobile ? 2 : 1,
    locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light", storageState: state,
  });
  const page = await ctx.newPage();
  for (const [name, path] of pages) {
    if (name === "cases-review" && (dark || mobile)) continue; // URL check only
    await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 60_000 });
    if (page.url().includes("/login")) throw new Error("not logged in");
    await page.waitForTimeout(900);
    const info = await page.evaluate(() => {
      const stats = [...document.querySelectorAll("header a")].map((a) => (a.textContent ?? "").trim());
      const rows = [...document.querySelectorAll('section[aria-label="القضايا"] li')];
      const markers = rows.map((li) => [...li.querySelectorAll("span")].map((s) => s.textContent).find((t) => t === "محتاجة قرار" || t === "محتاجة مراجعة") ?? "-");
      const cap = document.querySelector('nav[aria-label="تصفية القضايا"] a > span')?.getBoundingClientRect();
      const nav = document.querySelector('nav[aria-label="تصفية القضايا"]') as HTMLElement | null;
      const capsules = [...(nav?.querySelectorAll("a") ?? [])].map((a) => (a.textContent ?? "").trim());
      return {
        stats, rows: rows.length, decisionMarkers: markers.filter((m) => m === "محتاجة قرار").length, markers,
        capsules, firstCapsule: cap && { top: Math.round(cap.top), h: Math.round(cap.height) },
        navScroll: nav && { sw: nav.scrollWidth, cw: nav.clientWidth, sh: nav.scrollHeight, ch: nav.clientHeight },
        summary: document.querySelector("p[aria-live]")?.textContent ?? null,
      };
    });
    console.log(view, path, JSON.stringify(info));
    await page.screenshot({ path: resolve(`${OUT}/${name}-${view}.png`) });
    if (name !== "cases-review") await page.screenshot({ path: resolve(`${OUT}/${name}-${view}-full.png`), fullPage: true });
  }
  await ctx.close();

  const mw = mobile ? 390 : 1440;
  const img = (p: string) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
  const html = `<html><body style="margin:0;background:${dark ? "#05070c" : "#dfe2e8"};font:600 14px -apple-system,sans-serif;color:${dark ? "#ccc" : "#333"}">
    <div style="display:flex;gap:24px;padding:16px;align-items:flex-start">
      <div><div style="padding:0 0 8px">Mockup · ${view}</div><img src="${img(resolve(`screenshots/mockups/${view}.png`))}" style="width:${mw}px;display:block"></div>
      <div><div style="padding:0 0 8px">App · /cases (${mw}px)</div><img src="${img(resolve(`${OUT}/cases-${view}.png`))}" style="width:${mw}px;display:block"></div>
      <div><div style="padding:0 0 8px">App · /cases?decision=1</div><img src="${img(resolve(`${OUT}/cases-decision-${view}.png`))}" style="width:${mw}px;display:block"></div>
    </div></body></html>`;
  const cmp = await browser.newContext({ viewport: { width: mw * 3 + 80, height: 800 } });
  const p = await cmp.newPage();
  await p.setContent(html, { waitUntil: "load" });
  await p.screenshot({ path: `${OUT}/compare-${view}.png`, fullPage: true });
  await cmp.close();
}
await browser.close();
