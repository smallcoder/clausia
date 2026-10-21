// PR media for the roll's continuous day strip → screenshots/roll-strip/
// before-*.png from BEFORE_BASE (a server on main), after-*.png and a short recording (webm → GIF with ffmpeg) from the
// base URL. Logged in as the demo user. Run: BEFORE_BASE=http://localhost:3000 npx tsx --env-file=.env.local scripts/roll-strip-media.ts http://localhost:3100
import { chromium, type Browser } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

const AFTER = process.argv[2] ?? "http://localhost:3100";
const BEFORE = process.env.BEFORE_BASE;
const OUT = "screenshots/roll-strip";
mkdirSync(OUT, { recursive: true });

async function login(browser: Browser, base: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${base}/login`);
  await page.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await page.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { waitUntil: "commit", timeout: 60_000 }), page.click('button:has-text("دخول")')]);
  const s = await ctx.storageState();
  await ctx.close();
  return s;
}

const browser = await chromium.launch();
const sizes = [{ name: "1440", viewport: { width: 1440, height: 760 }, mobile: false }, { name: "390", viewport: { width: 390, height: 640 }, mobile: true }];

for (const [label, base] of [["before", BEFORE], ["after", AFTER]] as const) {
  if (!base) continue;
  const state = await login(browser, base);
  for (const s of sizes) {
    const ctx = await browser.newContext({ storageState: state, viewport: s.viewport, deviceScaleFactor: s.mobile ? 2 : 1, isMobile: s.mobile, hasTouch: s.mobile, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: "light" });
    const page = await ctx.newPage();
    await page.goto(`${base}/hearings`, { waitUntil: "load" });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${label}-${s.name}.png` });
    await ctx.close();
  }
}

// the recording: tap a day, next week ×2, the «النهارده» chip, arrow keys, a mouse drag
{
  const state = await login(browser, AFTER);
  const tmp = join(OUT, "_video");
  const ctx = await browser.newContext({ storageState: state, viewport: { width: 1120, height: 620 }, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: "light", recordVideo: { dir: tmp, size: { width: 1120, height: 620 } } });
  const page = await ctx.newPage();
  await page.goto(`${AFTER}/hearings`, { waitUntil: "load" });
  await page.waitForTimeout(1200);
  const days = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-day]")].map((e) => e.dataset.day!));
  const sel = await page.evaluate(() => document.querySelector<HTMLElement>('[data-day][aria-current="date"]')!.dataset.day!);
  const i = days.indexOf(sel);
  for (const d of [days[i - 1], days[i - 2], days[i + 1]]) { if (!d) continue; await page.locator(`[data-day="${d}"]`).click(); await page.waitForTimeout(900); }
  for (let k = 0; k < 2; k++) { await page.getByRole("button", { name: "الأسبوع الجاي" }).click(); await page.waitForTimeout(900); }
  await page.getByRole("button", { name: "النهارده", exact: true }).click();
  await page.waitForTimeout(1000);
  await page.keyboard.press("Tab").catch(() => {});
  await page.locator(`[data-day][aria-current="date"]`).focus();
  for (const key of ["ArrowLeft", "ArrowLeft", "ArrowRight"]) { await page.keyboard.press(key); await page.waitForTimeout(700); }
  const box = (await page.locator("[data-roll-scroller]").boundingBox())!;
  await page.mouse.move(box.x + 300, box.y + box.height / 2);
  await page.mouse.down();
  for (let k = 1; k <= 20; k++) { await page.mouse.move(box.x + 300 + k * 22, box.y + box.height / 2); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(1200);
  await ctx.close();
  const webm = join(tmp, readdirSync(tmp).find((f) => f.endsWith(".webm"))!);
  try {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "1.2", "-i", webm, "-vf", "fps=12,scale=760:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", `${OUT}/roll-strip.gif`]);
  } catch {
    renameSync(webm, `${OUT}/roll-strip.webm`);
  }
  rmSync(tmp, { recursive: true, force: true });
}
await browser.close();
console.log("done", readdirSync(OUT));
