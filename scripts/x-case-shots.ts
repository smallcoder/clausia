// Exact-layout pass, Case screen: shoots /cases/<id> at 1440×960 and 390×844, light and dark (viewport + full page)
// → screenshots/x-case/<View>[-<tag>][-full].png, and side-by-side images (mockup left, app full page right)
// → screenshots/compare-x/<View>.png for the 772/2025 case. Logs in once and reuses the session (storageState).
// Needs the app running. Run: npx tsx --env-file=.env.local scripts/x-case-shots.ts [baseUrl] [statePath]
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const [BASE = "http://localhost:3403", STATE = "/tmp/clausia-x-case-state.json"] = process.argv.slice(2);
mkdirSync("screenshots/x-case", { recursive: true });
mkdirSync("screenshots/compare-x", { recursive: true });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await db.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const caseId = async (n: string) => (await db.from("cases").select("id").eq("case_number", n).limit(1).maybeSingle()).data?.id as string;
const cases = { "772": await caseId("772"), "1290": await caseId("1290") };

const browser = await chromium.launch();
if (!existsSync(STATE)) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await page.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.click('button:has-text("دخول")')]);
  await ctx.storageState({ path: STATE });
  await ctx.close();
}

for (const [num, id] of Object.entries(cases)) for (const dark of [false, true]) for (const mobile of [false, true]) {
  const view = `${dark ? "Dark" : "Light"}${mobile ? "Mobile" : ""}Case`;
  const tag = num === "772" ? "" : `-${num}`;
  const ctx = await browser.newContext({
    storageState: STATE, viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 }, deviceScaleFactor: mobile ? 2 : 1,
    locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light",
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/cases/${id}${process.env.SHOT_PATH ?? ""}`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `screenshots/x-case/${view}${tag}.png` });
  // full page: pin the fixed composer dock to the document's end (over its spacer)
  await page.addStyleTag({ content: "html{position:relative} .bg-fade.fixed{position:absolute}" });
  const full = resolve(`screenshots/x-case/${view}${tag}-full.png`);
  await page.screenshot({ path: full, fullPage: true });
  await ctx.close();
  console.log(view, num);
  if (num !== "772") continue;
  const mw = mobile ? 390 : 1440;
  const html = `<html><body style="margin:0;background:${dark ? "#05070c" : "#dfe2e8"};font:600 14px -apple-system,sans-serif;color:${dark ? "#ccc" : "#333"}">
    <div style="display:flex;gap:24px;padding:16px;align-items:flex-start">
      <div><div style="padding:0 0 8px">Mockup · ${view}</div><img src="data:image/png;base64,${readFileSync(`screenshots/mockups/${view}.png`).toString("base64")}" style="width:${mw}px;display:block"></div>
      <div><div style="padding:0 0 8px">App · /cases/772 (${mw}px)</div><img src="data:image/png;base64,${readFileSync(full).toString("base64")}" style="width:${mw}px;display:block"></div>
    </div></body></html>`;
  const c2 = await browser.newContext({ viewport: { width: mw * 2 + 56, height: 800 } });
  const p2 = await c2.newPage();
  await p2.setContent(html, { waitUntil: "load" });
  await p2.screenshot({ path: `screenshots/compare-x/${view}.png`, fullPage: true });
  await c2.close();
}
await browser.close();
