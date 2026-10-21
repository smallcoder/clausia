// Renders docs/design/next/*.dc.html (the next batch) to screenshots/mockups/next/<name>.png. Run: npx tsx scripts/mockup-shots-next.ts
import { chromium } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
mkdirSync("screenshots/mockups/next", { recursive: true });
const dir = resolve("docs/design/next");
const browser = await chromium.launch();
for (const f of readdirSync(dir).filter((x) => x.endsWith(".dc.html"))) {
  const mobile = f.includes("Mobile");
  const ctx = await browser.newContext({ viewport: { width: mobile ? 390 : 1440, height: mobile ? 844 : 960 }, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage();
  await page.route("**/support.js", (r) => r.fulfill({ body: readFileSync(resolve("docs/design/support.js")), contentType: "text/javascript" }));
  await page.goto("file://" + resolve(dir, f), { waitUntil: "load" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `screenshots/mockups/next/${f.replace(".dc.html", "")}.png`, fullPage: true });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(f, h);
  await ctx.close();
}
await browser.close();
