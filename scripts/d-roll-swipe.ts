// Swipe test for the roll's day strip (owner decision 15) at 390×844 with real touch events (CDP).
// RTL: dragging toward the RIGHT → next week, toward the LEFT → previous week; a short (20px) or vertical drag does nothing.
// Reuses the storage state saved by x-roll-shots.ts. Needs the app running.
// Run: SHOT_STATE_DIR=<dir> npx tsx --env-file=.env.local scripts/d-roll-swipe.ts [baseUrl]
import { chromium, type CDPSession, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [BASE = "http://localhost:3503"] = process.argv.slice(2);
const OUT = process.env.SHOT_OUT ?? "screenshots/d-roll";
mkdirSync(OUT, { recursive: true });
const state = join(process.env.SHOT_STATE_DIR ?? tmpdir(), "clausia-xroll-state.json");

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

async function drag(page: Page, cdp: CDPSession, dx: number, dy = 0) {
  const box = await page.locator('nav[aria-label="أيام الأسبوع"]').boundingBox();
  if (!box) throw new Error("no day strip");
  const x0 = box.x + box.width / 2 - dx / 2, y0 = box.y + box.height / 2;
  const pt = (x: number, y: number) => [{ x, y, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(x0, y0) });
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(x0 + (dx * i) / 8, y0 + (dy * i) / 8) });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
  locale: "ar-EG", timezoneId: "Africa/Cairo", storageState: state,
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const start = `${BASE}/hearings?view=day&date=21/10/2026`; // Wednesday; its week starts Saturday 17/10
await page.goto(start, { waitUntil: "load" });
if (page.url().includes("/login")) throw new Error("not logged in");
const date = () => new URL(page.url()).searchParams.get("date");

check("no mobile navigation row", (await page.locator('nav[aria-label="التنقل في الرول"]').count()) === 0);
check("desktop week buttons hidden on mobile", !(await page.getByRole("link", { name: "الأسبوع الجاي" }).isVisible()));

await drag(page, cdp, 20);
await page.waitForTimeout(800);
check("20px drag does not change the week", date() === "21/10/2026", String(date()));

await drag(page, cdp, 60, 120);
await page.waitForTimeout(800);
check("mostly vertical drag does not change the week", date() === "21/10/2026", String(date()));

await drag(page, cdp, 120);
await page.waitForURL((u) => u.searchParams.get("date") === "24/10/2026", { timeout: 10_000 }).catch(() => {});
check("drag toward the right → next week (24/10/2026)", date() === "24/10/2026", String(date()));
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/swipe-next-week-390.png` });

await drag(page, cdp, -120);
await page.waitForURL((u) => u.searchParams.get("date") === "17/10/2026", { timeout: 10_000 }).catch(() => {});
check("drag toward the left → previous week (back to 17/10/2026)", date() === "17/10/2026", String(date()));

await page.goto(`${BASE}/hearings?view=week&date=21/10/2026`, { waitUntil: "load" });
await drag(page, cdp, 120);
await page.waitForURL((u) => u.searchParams.get("date") === "24/10/2026", { timeout: 10_000 }).catch(() => {});
const u = new URL(page.url());
check("week view keeps ?view=week when swiping", u.searchParams.get("view") === "week" && date() === "24/10/2026", page.url());

await page.goto(`${BASE}/hearings?filter=undecided`, { waitUntil: "load" });
check("?filter=undecided still opens «محتاجة قرار»", (await page.locator("h1").innerText()).includes("محتاجة قرار"));

await browser.close();
console.log(failed ? `${failed} FAILED` : "ALL PASS");
process.exit(failed ? 1 : 0);
