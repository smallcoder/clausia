// Screenshots of every screen at 390px and 1280px → screenshots/<width>/<name>.png
// Needs the app running (default http://localhost:3000). Run: npx tsx --env-file=.env.local scripts/screenshots.ts [baseUrl]
import { chromium, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const WIDTHS = [390, 1280];

async function ids() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { error } = await db.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
  if (error) throw error;
  // the case with the most facts makes the best case-page screenshots
  const { data: cases } = await db.from("cases").select("id, case_facts(count)").limit(50);
  const best = (cases ?? []).sort((a, b) => ((b.case_facts as unknown as { count: number }[])[0]?.count ?? 0) - ((a.case_facts as unknown as { count: number }[])[0]?.count ?? 0))[0];
  const { data: thread } = await db.from("proposals").select("thread_id").not("thread_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return { caseId: best?.id as string | undefined, threadId: thread?.thread_id as string | undefined };
}

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await page.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 }), page.click('button:has-text("دخول")')]);
}

async function main() {
  const { caseId, threadId } = await ids();
  const routes: [string, string][] = [
    ["01-home", "/"],
    ["02-chat", "/chat"],
    ...(threadId ? [["03-chat-thread", `/chat/${threadId}`] as [string, string]] : []),
    ["04-hearings-day", "/hearings?view=day"],
    ["05-hearings-week", "/hearings?view=week"],
    ["06-cases", "/cases"],
    ["06b-cases-search", "/cases?q=" + encodeURIComponent("نفقة")],
  ];
  if (caseId) for (const t of ["summary", "facts", "parties", "requests", "hearings", "documents", "judgments", "chat"]) routes.push([`07-case-${t}`, `/cases/${caseId}?tab=${t}`]);

  const browser = await chromium.launch();
  for (const w of WIDTHS) {
    mkdirSync(`screenshots/${w}`, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 860 }, deviceScaleFactor: w < 500 ? 2 : 1, locale: "ar-EG", timezoneId: "Africa/Cairo" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.screenshot({ path: `screenshots/${w}/00-login.png`, fullPage: true });
    await login(page);
    for (const [name, path] of routes) {
      const res = await page.goto(BASE + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `screenshots/${w}/${name}.png`, fullPage: true });
      console.log(w, name, res?.status());
    }
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
