// Screenshots of the frame (top bar across, chat 560 / 480, page, gap 24) → screenshots/compare/split/Frame-*.png, light and dark.
// NO model call: the case session is made with the demo login (RLS client): a user row and an assistant row, removed at the end.
//  - Home and Case at 1440 / 1920 / 2560, and Home on a phone (390).
//  - compare-Frame-*.png: mockup (left) next to the app (right) at 1920 (Home and Case, light and dark) and 2560 (Case, light).
// Needs the app running. Run: npx tsx --env-file=.env.local scripts/frame-shots.ts [baseUrl]
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

// ---- a case session without the model ----
const { data: t, error } = await db.from("chat_threads").insert({ case_id: caseId, title: "اختبار-إطار: جلسة قضية" }).select("id").single();
if (error || !t) throw new Error(`thread: ${error?.message}`);
const sessionId = t.id as string;
await db.from("chat_messages").insert([
  { thread_id: sessionId, role: "user", content: "الجلسة النهارده اتأجلت لـ 5/12 عشان نقدم أصل عقد الإيجار" },
  { thread_id: sessionId, role: "assistant", content: "تمام. ده اللي هيتغير، ومعلّمه على الصفحة جنبك بالدهبي." },
]);

try {
  for (const dark of [false, true]) {
    const tn = dark ? "dark" : "light";
    const L = dark ? "Dark" : "Light";
    for (const [w, h] of [[1440, 900], [1920, 1080], [2560, 1440]] as const) {
      const [ctx, page] = await ctxOf(w, h, dark);
      await go(page, `/cases/${caseId}?s=${sessionId}`);
      await shot(page, `Frame-Case-${w}-${tn}`, w === 1920 ? `Split${L}Case` : w === 2560 && !dark ? "Split2560" : undefined);
      await go(page, "/");
      await shot(page, `Frame-Home-${w}-${tn}`, w === 1920 ? `Split${L}Home` : undefined);
      await ctx.close();
    }
    const [ctx, page] = await ctxOf(390, 844, dark);
    await go(page, "/");
    await shot(page, `Frame-M-Home-${tn}`);
    await ctx.close();
  }
} finally {
  await db.from("chat_threads").delete().eq("id", sessionId);
  await browser.close();
}
console.log("done");
