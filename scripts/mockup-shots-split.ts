// Renders docs/design/split/*.dc.html (the chat-first split layout) to screenshots/mockups/split/<name>.png,
// at each mockup's own $preview size. Run: npx tsx scripts/mockup-shots-split.ts
import { chromium } from "@playwright/test";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const dir = resolve("docs/design/split");
mkdirSync("screenshots/mockups/split", { recursive: true });
const browser = await chromium.launch();
for (const f of readdirSync(dir).filter((x) => x.endsWith(".dc.html"))) {
  const html = readFileSync(resolve(dir, f), "utf8");
  const m = html.match(/"\$preview":\{"width":(\d+),"height":(\d+)\}/);
  const [w, h] = m ? [Number(m[1]), Number(m[2])] : [1920, 1080];
  const mobile = w < 600;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage();
  await page.route("**/support.js", (r) => r.fulfill({ body: readFileSync(resolve("docs/design/support.js")), contentType: "text/javascript" }));
  await page.goto("file://" + resolve(dir, f), { waitUntil: "load" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `screenshots/mockups/split/${f.replace(".dc.html", "")}.png`, fullPage: true });
  console.log(f, w, h);
  await ctx.close();
}
await browser.close();
