// Home's composer in its two states, 1920 wide: short content (a 1080 high screen: the composer sits right under the
// content) and long content (a 640 high screen, so the page is taller than the screen: the composer sticks to the bottom).
// Needs the app running. Run: npx tsx --env-file=.env.local scripts/home-states-shots.ts [baseUrl]
// Writes screenshots/compare/next/{Light,Dark}Home-{short,long}-content.png and prints where the composer is.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
mkdirSync("screenshots/compare/next", { recursive: true });

async function main() {
  const browser = await chromium.launch();
  const login = await browser.newContext();
  const lp = await login.newPage();
  await lp.goto(`${BASE}/login`);
  await lp.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await lp.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([lp.waitForURL((u) => !u.pathname.startsWith("/login"), { waitUntil: "commit", timeout: 60_000 }), lp.click('button:has-text("دخول")')]);
  const state = await login.storageState();
  await login.close();
  for (const dark of [false, true]) for (const [name, height] of [["short-content", 1080], ["long-content", 640]] as const) {
    const ctx = await browser.newContext({ storageState: state, viewport: { width: 1920, height }, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light" });
    const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 60_000 });
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => {
      const box = document.querySelector('textarea[aria-label="اكتب لـ Clausia"]')!.closest(".glass")!.getBoundingClientRect();
      const cards = [...document.querySelectorAll("main a")].map((a) => a.getBoundingClientRect().bottom);
      return { composerTop: Math.round(box.top), composerBottom: Math.round(box.bottom), lastCardBottom: Math.round(Math.max(...cards)), pageHeight: document.documentElement.scrollHeight, screen: innerHeight };
    });
    console.log(dark ? "dark" : "light", name, JSON.stringify(m));
    await page.screenshot({ path: `screenshots/compare/next/${dark ? "Dark" : "Light"}Home-${name}.png` });
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
