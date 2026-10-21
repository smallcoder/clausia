// Renders docs/design/*.dc.html mockups to screenshots/mockups/<name>.png (desktop 1440, mobile 390).
// Run: npx tsx scripts/mockup-shots.ts
import { chromium } from "@playwright/test";
import { mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve("docs/design");
mkdirSync("screenshots/mockups", { recursive: true });
const browser = await chromium.launch();
for (const f of readdirSync(dir).filter((x) => x.endsWith(".dc.html"))) {
  const mobile = f.includes("Mobile");
  const ctx = await browser.newContext({ viewport: { width: mobile ? 390 : 1440, height: mobile ? 844 : 960 }, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage();
  await page.goto("file://" + resolve(dir, f), { waitUntil: "load" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `screenshots/mockups/${f.replace(".dc.html", "")}.png`, fullPage: true });
  await ctx.close();
  console.log(f);
}
await browser.close();
