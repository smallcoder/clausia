// Uploads the fake claim sheet through the real chat attach button, waits for the card, screenshots it.
// Run: npx tsx --env-file=.env.local scripts/demo-upload.ts [baseUrl]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";

async function main() {
  mkdirSync("screenshots/390", { recursive: true });
  mkdirSync("screenshots/1280", { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ar-EG", timezoneId: "Africa/Cairo" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await page.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click('button:has-text("دخول")')]);
  await page.goto(`${BASE}/chat`);
  await Promise.all([page.waitForURL(/\/chat\/[0-9a-f-]{36}/), page.click('button:has-text("محادثة فارغة")')]);
  const url = page.url();
  await page.setInputFiles('input[type="file"]', "tests/fixtures/claim-sheet.pdf");
  await page.waitForSelector("text=بطاقة تأكيد", { timeout: 120_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "screenshots/390/08-doc-card.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.reload({ waitUntil: "networkidle" });
  await page.screenshot({ path: "screenshots/1280/08-doc-card.png", fullPage: true });
  console.log("thread", url);
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
