// Exact-layout pass, Case screen: checks the behaviour the layout changes must keep, on 1290 (has a suggested fact).
// - tapping a fact opens its sheet (confirm / reject for a suggested one); Escape closes it
// - the hearing card opens ?tab=hearings; the «سجّله» link inside it goes to the hearing's decision (#h-…)
// - the docs count opens ?tab=documents; the gold «محتاجة مراجعة» stat (#item-…) opens the suggested item's sheet
// - mobile: the review banner switches the tab and opens the sheet; the segment control switches segments
// Needs the app running. Run: npx tsx --env-file=.env.local scripts/x-case-behaviour.ts [baseUrl] [statePath]
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const [BASE = "http://localhost:3403", STATE = "/tmp/clausia-x-case-state.json"] = process.argv.slice(2);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await db.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const id = (await db.from("cases").select("id").eq("case_number", "1290").limit(1).maybeSingle()).data?.id as string;
let fails = 0;
const check = (ok: boolean, what: string) => { console.log(ok ? "ok  " : "FAIL", what); if (!ok) fails++; };

const browser = await chromium.launch();
for (const mobile of [false, true]) {
  const ctx = await browser.newContext({ storageState: STATE, viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 }, locale: "ar-EG", timezoneId: "Africa/Cairo" });
  const page = await ctx.newPage();
  const url = `${BASE}/cases/${id}`;
  const tag = mobile ? "[mobile]" : "[desktop]";
  await page.goto(url, { waitUntil: "load" });
  await page.locator('#facts button[aria-haspopup="dialog"]').last().click();
  await page.waitForTimeout(300);
  check(await page.locator("dialog[open]").count() === 1, `${tag} fact tap opens the sheet`);
  check(await page.locator("dialog[open] button:has-text('تأكيد')").count() === 1, `${tag} suggested fact sheet has تأكيد`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  check(await page.locator("dialog[open]").count() === 0, `${tag} Escape closes the sheet`);

  const decide = page.locator("a:visible:has-text('سجّله')").first();
  check((await decide.getAttribute("href"))?.includes("?tab=hearings#h-") ?? false, `${tag} «سجّله» links to the hearing decision`);
  // the decide link must be on top of the card's overlay link (a real click target)
  await decide.scrollIntoViewIfNeeded();
  const top = await decide.evaluate((el) => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest("a")?.getAttribute("href"); });
  check(top?.includes("#h-") ?? false, `${tag} «سجّله» is clickable over the card link`);
  const day = page.locator("text=أكتوبر").first();
  const under = await day.evaluate((el) => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest("a")?.getAttribute("href"); });
  check(under?.endsWith("?tab=hearings") ?? false, `${tag} the hearing card opens ?tab=hearings`);

  if (!mobile) {
    check(await page.locator("a[aria-label='كل المستندات']").getAttribute("href").then((h) => h?.endsWith("?tab=documents") ?? false), `${tag} docs count opens ?tab=documents`);
    await page.locator("a:has-text('محتاجة مراجعة')").first().click();
    await page.waitForTimeout(500);
    check(await page.locator("dialog[open]").count() === 1, `${tag} «محتاجة مراجعة» stat opens the suggested item's sheet`);
    await page.keyboard.press("Escape");
  } else {
    await page.getByRole("tab", { name: /الأطراف/ }).click();
    await page.waitForTimeout(200);
    check(await page.locator("#seg-parties").isVisible() && !(await page.locator("#seg-facts").isVisible()), `${tag} tabs switch to الأطراف`);
    await page.locator("a:visible:has-text('محتاجة مراجعتك')").first().click();
    await page.waitForTimeout(500);
    check(await page.locator("#seg-facts").isVisible(), `${tag} banner switches back to الوقائع`);
    check(await page.locator("dialog[open]").count() === 1, `${tag} banner opens the suggested fact's sheet`);
  }
  for (const t of ["hearings", "documents", "details"]) {
    const r = await page.goto(`${url}?tab=${t}`, { waitUntil: "load" });
    check(r?.ok() ?? false, `${tag} ?tab=${t} renders`);
  }
  await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} failed` : "all ok");
process.exit(fails ? 1 : 0);
