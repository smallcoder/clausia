// Screenshots of the chat-first split layout → screenshots/compare/split/ (light and dark), each app shot next to its mockup
// (screenshots/mockups/split/*.png: mockup left, app right) where one exists.
//  - Case page with a working chat at 1440 / 1920 / 2560: ONE real message is sent through the composer (a short turn, paid, cents)
//    in a new case session; every size then opens that same session (?s=). The session is removed at the end.
//  - Home at 1440 / 1920 / 2560, the sessions list, and on a phone (390): chat, case strip, sheet, context picker (both steps).
// Needs the app running. Run: npx tsx --env-file=.env.local scripts/split-shots.ts [baseUrl]   (SKIP_TURN=<threadId> reuses a session)
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:4500";
const OUT = "screenshots/compare/split";
const MOCK = "screenshots/mockups/split";
mkdirSync(OUT, { recursive: true });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await db.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const { data: c } = await db.from("cases").select("id").eq("case_number", "772").limit(1).maybeSingle();
const caseId = c!.id as string;

const browser = await chromium.launch();
const login = async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await page.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90_000 }), page.click('button:has-text("دخول")')]);
  const s = await ctx.storageState();
  await ctx.close();
  return s;
};
const state = await login();

async function ctxOf(w: number, h: number, dark: boolean): Promise<[BrowserContext, Page]> {
  const ctx = await browser.newContext({ storageState: state, viewport: { width: w, height: h }, deviceScaleFactor: w < 600 ? 2 : 1, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light" });
  const page = await ctx.newPage();
  // hide the dev overlay badge (it is not part of the app)
  await page.addInitScript(() => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s)); });
  return [ctx, page];
}
async function go(page: Page, path: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForSelector('aside[aria-label="محادثة Clausia"]');
  await page.waitForTimeout(1200);
}

/** the app shot, and (when a mockup exists) mockup | app side by side */
async function shot(page: Page, name: string, mock?: string) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  if (!mock) return;
  const [m, a] = [readFileSync(resolve(`${MOCK}/${mock}.png`)).toString("base64"), readFileSync(resolve(`${OUT}/${name}.png`)).toString("base64")];
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const p = await ctx.newPage();
  await p.setContent(`<body style="margin:0;display:flex;gap:16px;background:#888;align-items:flex-start"><div><div style="color:#fff;font:14px sans-serif;padding:4px">mockup: ${mock}</div><img style="display:block;height:900px" src="data:image/png;base64,${m}"></div><div><div style="color:#fff;font:14px sans-serif;padding:4px">app: ${name}</div><img style="display:block;height:900px" src="data:image/png;base64,${a}"></div></body>`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/compare-${name}.png`, fullPage: true });
  await ctx.close();
}

// ---- the one real turn: a new session on the case, through the composer ----
let sessionId = process.env.SKIP_TURN ?? "";
if (!sessionId) {
  const [ctx, page] = await ctxOf(1440, 900, false);
  await go(page, `/cases/${caseId}?s=new`);
  await page.locator("textarea").fill("الجلسة اللي كانت 20/10/2026 اتأجلت لـ 5/12/2026 لتقديم أصل عقد الإيجار");
  await page.keyboard.press("Enter");
  await page.waitForURL(/[?&]s=[0-9a-f-]{36}/, { timeout: 150_000 });
  sessionId = new URL(page.url()).searchParams.get("s")!;
  // the reply: Clausia's line (and its card) after the lawyer's bubble
  await page.waitForSelector("aside ol li:nth-child(2)", { timeout: 150_000 });
  await page.waitForTimeout(1500);
  await ctx.close();
  console.log("session", sessionId);
}

try {
  for (const dark of [false, true]) {
    const t = dark ? "dark" : "light";
    const L = dark ? "Dark" : "Light";
    for (const [w, h] of [[1440, 900], [1920, 1080], [2560, 1440]] as const) {
      const [ctx, page] = await ctxOf(w, h, dark);
      await go(page, `/cases/${caseId}?s=${sessionId}`);
      await shot(page, `Case-${w}-${t}`, w === 1920 ? `Split${L}Case` : w === 2560 && !dark ? "Split2560" : undefined);
      await go(page, "/");
      await shot(page, `Home-${w}-${t}`, w === 1920 ? `Split${L}Home` : undefined);
      if (w === 1440) {
        await go(page, `/cases/${caseId}?s=${sessionId}`);
        await page.getByRole("button", { name: "محادثات" }).click();
        await page.waitForTimeout(400);
        await shot(page, `Sessions-${w}-${t}`);
      }
      await ctx.close();
    }
    // phone
    const [ctx, page] = await ctxOf(390, 844, dark);
    await go(page, "/");
    await shot(page, `M-chat-${t}`, `SplitM${L}Chat`);
    await go(page, `/cases/${caseId}?s=${sessionId}`);
    await shot(page, `M-case-strip-${t}`, `SplitM${L}Case`);
    await go(page, `/cases/${caseId}?s=${sessionId}&sheet=1`);
    await page.waitForTimeout(500);
    await shot(page, `M-sheet-${t}`, `SplitM${L}Sheet`);
    await go(page, `/cases/${caseId}?s=${sessionId}`);
    await page.click('button[aria-label="اختار المحادثة"]');
    await page.waitForSelector('[role="dialog"]');
    await page.waitForTimeout(900);
    await shot(page, `M-picker-1-${t}`);
    await page.locator('[role="dialog"] button', { hasText: "عادل النموذجي" }).first().click();
    await page.waitForTimeout(1000);
    await shot(page, `M-picker-2-${t}`);
    await ctx.close();
  }
  // all shots done: the demo session is removed (when a run fails it stays: rerun with SKIP_TURN=<its id> to avoid a second paid turn)
  if (!process.env.SKIP_TURN) await db.from("chat_threads").delete().eq("id", sessionId);
} finally {
  await browser.close();
}
console.log("done");
