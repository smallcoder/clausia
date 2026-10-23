// Renders docs/design/ia/*.dc.html (the sidebar layout, PR 1 of the restructure) to screenshots/sidebar-layout/mockups/<name>.png,
// at each mockup's own $preview size. Run: npx tsx scripts/mockup-shots-ia.ts [outDir] [name filter]
// PR 2 (the agenda): npx tsx scripts/mockup-shots-ia.ts screenshots/agenda/mockups Agenda   (matches IAAgenda* and MAgenda*)
import { chromium } from "@playwright/test";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const dir = resolve("docs/design/ia");
const [OUT = "screenshots/sidebar-layout/mockups", ONLY = ""] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const f of readdirSync(dir).filter((x) => x.endsWith(".dc.html") && x.includes(ONLY))) {
  const html = readFileSync(resolve(dir, f), "utf8");
  const m = html.match(/"\$preview":\{"width":(\d+),"height":(\d+)\}/);
  const [w, h] = m ? [Number(m[1]), Number(m[2])] : [1920, 1080];
  const mobile = w < 600;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage();
  await page.route("**/support.js", (r) => r.fulfill({ body: readFileSync(resolve("docs/design/support.js")), contentType: "text/javascript" }));
  await page.goto("file://" + resolve(dir, f), { waitUntil: "load" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${f.replace(".dc.html", "")}.png`, fullPage: true });
  console.log(f, w, h);
  await ctx.close();
}
await browser.close();
