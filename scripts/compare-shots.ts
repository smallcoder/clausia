// Side by side: mockup (left) next to the real screen (right) → screenshots/compare/<Mockup>.png
// Needs the app running. Run: npx tsx --env-file=.env.local scripts/compare-shots.ts [baseUrl]
// Mockups are rendered from docs/design/*.dc.html (support.js fills the templates).
import { chromium, type Browser } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3000";
mkdirSync("screenshots/compare", { recursive: true });
mkdirSync("screenshots/app", { recursive: true });

async function ids() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
  const { data: c } = await db.from("cases").select("id").eq("case_number", "772").limit(1).maybeSingle();
  const { data: p } = await db.from("proposals").select("thread_id").not("document_id", "is", null).not("thread_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: anyp } = await db.from("proposals").select("thread_id").not("thread_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return { caseId: c?.id as string, threadId: (process.env.CHAT_THREAD ?? p?.thread_id ?? anyp?.thread_id) as string };
}

let state: Awaited<ReturnType<import("@playwright/test").BrowserContext["storageState"]>> | null = null;

/** Logs in once and reuses the session for every shot (many logins in a row get rate-limited by Supabase Auth). */
async function session(browser: Browser) {
  if (state) return state;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await page.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { waitUntil: "commit", timeout: 60_000 }), page.click('button:has-text("دخول")')]);
  state = await ctx.storageState();
  await ctx.close();
  return state;
}

async function shootApp(browser: Browser, path: string, mobile: boolean, dark: boolean, out: string, width = 1440) {
  const ctx = await browser.newContext({ storageState: await session(browser), viewport: { width: mobile ? 390 : 1440, height: mobile ? 844 : 960 }, deviceScaleFactor: mobile ? 2 : 1, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light" });
  const page = await ctx.newPage();
  console.log(new Date().toISOString().slice(11, 19), "goto", path, mobile ? "mobile" : "desktop", dark ? "dark" : "light");
  // the local server sometimes stalls one request; retry once
  try { await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 40_000 }); }
  catch { await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 60_000 }); }
  await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out, fullPage: true });
  await ctx.close();
}

/** The loading skeleton: navigate in-app from Home with the page's data request held back, then shoot. */
async function shootLoading(browser: Browser, path: string, mobile: boolean, dark: boolean, out: string) {
  const ctx = await browser.newContext({ storageState: await session(browser), viewport: { width: mobile ? 390 : 1440, height: mobile ? 844 : 960 }, deviceScaleFactor: mobile ? 2 : 1, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light" });
  const page = await ctx.newPage();
  await page.goto(BASE + (path === "/" ? "/cases" : "/"), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1500);
  // prefetch first (not held back), as a real <Link> would, so the target route's own loading boundary is known;
  // then hold back only the page's data request and navigate
  await page.evaluate((p) => (window as unknown as { next: { router: { prefetch: (p: string) => void } } }).next.router.prefetch(p), path);
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.route(/_rsc=/, async (r) => { await new Promise((ok) => setTimeout(ok, 15_000)); await r.continue().catch(() => {}); });
  await page.evaluate((p) => (window as unknown as { next: { router: { push: (p: string) => void } } }).next.router.push(p), path);
  await page.waitForSelector('[aria-busy="true"]', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(900);
  await page.screenshot({ path: out });
  await ctx.close();
}

async function main() {
  const { caseId, threadId } = await ids();
  const routes: Record<string, string> = { Home: "/", Chat: `/chat/${threadId}`, Case: `/cases/${caseId}`, Roll: "/hearings", Cases: "/cases" };
  const browser = await chromium.launch();
  // desktop at 1440 and 1920 (mockups are 1440 wide), mobile at 390; ONLY=Roll,Case limits the screens
  const only = process.env.ONLY?.split(",");
  const shots: { mobile: boolean; width: number }[] = [{ mobile: false, width: 1440 }, { mobile: false, width: 1920 }, { mobile: true, width: 390 }];
  for (const [screen, path] of Object.entries(routes)) {
    if (only && !only.includes(screen)) continue;
    for (const dark of [false, true]) for (const { mobile, width } of shots) {
      const base = `${dark ? "Dark" : "Light"}${mobile ? "Mobile" : ""}${screen}`;
      const name = mobile || width === 1440 ? base : `${base}-${width}`;
      const app = resolve(`screenshots/app/${name}.png`);
      await shootApp(browser, path, mobile, dark, app, width);
      const mock = resolve(`screenshots/mockups/${base}.png`);
      const mw = mobile ? 390 : 1440;
      const html = `<html><body style="margin:0;background:${dark ? "#05070c" : "#dfe2e8"};font:600 14px -apple-system,sans-serif;color:${dark ? "#ccc" : "#333"}">
        <div style="display:flex;gap:24px;padding:16px;align-items:flex-start">
          <div><div style="padding:0 0 8px">Mockup · ${base} (${mw}px)</div><img src="data:image/png;base64,${readFileSync(mock).toString("base64")}" style="width:${mw}px;display:block;border-radius:12px"></div>
          <div><div style="padding:0 0 8px">App · ${path} (${width}px)</div><img src="data:image/png;base64,${readFileSync(app).toString("base64")}" style="width:${width}px;display:block;border-radius:12px"></div>
        </div></body></html>`;
      const ctx = await browser.newContext({ viewport: { width: mw + width + 56, height: 800 } });
      const page = await ctx.newPage();
      await page.setContent(html, { waitUntil: "load" });
      await page.screenshot({ path: `screenshots/compare/${name}.png`, fullPage: true });
      await ctx.close();
      console.log(name, path);
      if (width === 1440 || mobile) {
        const lapp = resolve(`screenshots/app/${base}-loading.png`);
        await shootLoading(browser, path, mobile, dark, lapp);
        const lhtml = html.replace(`App · ${path} (${width}px)`, `App loading · ${path} (${mobile ? 390 : 1440}px)`).replace(readFileSync(app).toString("base64"), readFileSync(lapp).toString("base64"));
        const lctx = await browser.newContext({ viewport: { width: mw * 2 + 56, height: 800 } });
        const lpage = await lctx.newPage();
        await lpage.setContent(lhtml, { waitUntil: "load" });
        await lpage.screenshot({ path: `screenshots/compare/${base}-loading.png`, fullPage: true });
        await lctx.close();
        console.log(`${base}-loading`, path);
      }
    }
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
