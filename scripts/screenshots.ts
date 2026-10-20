// Screenshots of every screen at 390px and 1280px, light and dark → screenshots/<width>-<light|dark>/<name>.png
// Needs the app running (default http://localhost:3000). Run: npx tsx --env-file=.env.local scripts/screenshots.ts [baseUrl]
import { chromium, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const WIDTHS = [390, 1280];
const SCHEMES = ["light", "dark"] as const;

async function ids() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { error } = await db.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
  if (error) throw error;
  // the case with the most facts makes the best case-page screenshots
  const { data: cases } = await db.from("cases").select("id, case_facts(count)").limit(50);
  const best = (cases ?? []).sort((a, b) => ((b.case_facts as unknown as { count: number }[])[0]?.count ?? 0) - ((a.case_facts as unknown as { count: number }[])[0]?.count ?? 0))[0];
  const { data: thread } = await db.from("proposals").select("thread_id").not("thread_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: docThread } = await db.from("proposals").select("thread_id").not("thread_id", "is", null).not("document_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return { caseId: best?.id as string | undefined, threadId: thread?.thread_id as string | undefined, docThreadId: docThread?.thread_id as string | undefined };
}

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await page.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 }), page.click('button:has-text("دخول")')]);
}

async function main() {
  const { caseId, threadId, docThreadId } = await ids();
  const routes: [string, string][] = [
    ["01-home", "/"],
    ["02-chat", "/chat"],
    ...(threadId ? [["03-chat-thread", `/chat/${threadId}`] as [string, string]] : []),
    ...(docThreadId ? [["03b-chat-document-card", `/chat/${docThreadId}`] as [string, string]] : []),
    ["04-hearings-day", "/hearings?view=day"],
    ["05-hearings-week", "/hearings?view=week"],
    ["06-cases", "/cases"],
    ["06b-cases-search", "/cases?q=" + encodeURIComponent("نفقة")],
  ];
  if (caseId) for (const t of ["summary", "facts", "parties", "requests", "hearings", "documents", "judgments", "chat"]) routes.push([`07-case-${t}`, `/cases/${caseId}?tab=${t}`]);

  const browser = await chromium.launch();
  for (const scheme of SCHEMES) for (const w of WIDTHS) {
    const dir = `screenshots/${w}-${scheme}`;
    mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 860 }, deviceScaleFactor: w < 500 ? 2 : 1, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.screenshot({ path: `${dir}/00-login.png`, fullPage: true });
    await login(page);
    for (const [name, path] of routes) {
      const res = await page.goto(BASE + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
      console.log(scheme, w, name, res?.status());
      // on mobile, open the confirmation card's bottom sheet
      if (w < 1024 && name.startsWith("03")) {
        const review = page.locator('button:has-text("مراجعة")').last();
        if (await review.count()) {
          await review.click();
          await page.waitForTimeout(450);
          await page.screenshot({ path: `${dir}/${name}-sheet.png` });
          console.log(scheme, w, `${name}-sheet`);
        }
      }
    }
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
