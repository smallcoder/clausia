// Screenshots of dates inside Arabic text (the date-text PR) → screenshots/compare/date-text/{before,after,compare}/
//   <mode> = before (run on origin/main) | after (run on the branch) | compare (builds Compare-<name>-<w>-<light|dark>.png from both)
//   <name> = Roll-<day|day25>, Home, Cases, Case (header + hearing card), Facts (timeline), Hearings (hearing cards), Sessions, Noticed («لاحظت» cards)
// NO model call. A fixture is added to the demo data (hearings on 22/10 (past), 12/11 and 19/11 so the Home list also shows a plain d/m/yyyy
// row; two chat sessions of case 772, one of them tied to the 22/10 hearing) and removed again at the end. Nothing in LawMill is touched.
// Today in the demo data = 23/10/2026 with hearings on 23, 24 and 25 → «النهارده», «بكرة», «الأحد 25».
// Needs the app running. Run: npx tsx --conditions=react-server --env-file=.env.local scripts/date-text-shots.ts <before|after|compare> [baseUrl]
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";

const MODE = process.argv[2] as "before" | "after" | "compare";
if (!["before", "after", "compare"].includes(MODE)) throw new Error("usage: date-text-shots.ts <before|after|compare> [baseUrl]");
const BASE = process.argv[3] ?? "http://localhost:5200";
const ROOT = "screenshots/compare/date-text";
const OUT = `${ROOT}/${MODE}`;
mkdirSync(OUT, { recursive: true });

const SIZES = [[1440, 900], [390, 844]] as const;
const THEMES = ["light", "dark"] as const;
// name → what to open and which part to show. `el` = crop to this element (the page is scrolled to it); else the viewport.
const PAGES: { name: string; path: string; wait: string; el?: string; mobile?: "skip" | "same" }[] = [
  { name: "Roll-day", path: "/hearings?view=day&date=23/10/2026", wait: "main" },
  { name: "Roll-day25", path: "/hearings?view=day&date=25/10/2026", wait: "main" },
  { name: "Home", path: "/", wait: 'section[aria-label="الجلسات الجاية"]', el: 'section[aria-label="الجلسات الجاية"]' },
  { name: "Cases", path: "/cases", wait: "main" },
];


if (MODE === "compare") {
  const browser = await chromium.launch();
  const names = ["Roll-day", "Roll-day25", "Home", "Cases", "Case", "Facts", "Hearings", "Sessions", "Noticed"];
  for (const [w] of SIZES) for (const t of THEMES) for (const n of names) {
    const a = `${ROOT}/before/${n}-${w}-${t}.png`, b = `${ROOT}/after/${n}-${w}-${t}.png`;
    if (!existsSync(a) || !existsSync(b)) continue;
    const img = (p: string) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
    const dark = t === "dark";
    const html = `<html><body style="margin:0;background:${dark ? "#05070c" : "#dfe2e8"};font:600 14px -apple-system,sans-serif;color:${dark ? "#ccc" : "#333"}">
      <div style="display:flex;gap:24px;padding:16px;align-items:flex-start;direction:ltr">
        <div><div style="padding:0 0 8px">before (origin/main) · ${n} · ${w}px · ${t}</div><img src="${img(a)}" style="display:block;max-width:${w < 600 ? 390 : 1440}px;border-radius:8px"></div>
        <div><div style="padding:0 0 8px">after (date-text) · ${n} · ${w}px · ${t}</div><img src="${img(b)}" style="display:block;max-width:${w < 600 ? 390 : 1440}px;border-radius:8px"></div>
      </div></body></html>`;
    const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: "load" });
    mkdirSync(`${ROOT}/compare`, { recursive: true });
    await page.screenshot({ path: `${ROOT}/compare/Compare-${n}-${w}-${t}.png`, fullPage: true });
    await ctx.close();
  }
  await browser.close();
  process.exit(0);
}

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const db = sb as unknown as Db;
const idOf = async (n: string) => (await db.from("cases").select("id").eq("case_number", n).limit(1).single()).data!.id;
const CASE = await idOf("772");
const CASE2 = await idOf("4512");

const made = { hearings: [] as string[], threads: [] as string[] };
async function fixture() {
  const hearing = async (case_id: string, hearing_date: string) => {
    const r = await db.from("hearings").insert({ case_id, hearing_date, purpose: "نظر الدعوى", review_status: "confirmed", source_kind: "manual" }).select("id").single();
    if (r.error || !r.data) throw new Error(`hearing: ${r.error?.message}`);
    made.hearings.push(r.data.id);
    return r.data.id;
  };
  const past = await hearing(CASE, "2026-10-22");
  await hearing(CASE2, "2026-11-12");
  await hearing(CASE, "2026-11-19");
  const thread = async (title: string | null, hearing_id: string | null) => {
    const r = await db.from("chat_threads").insert({ case_id: CASE, hearing_id, title }).select("id").single();
    if (r.error || !r.data) throw new Error(`thread: ${r.error?.message}`);
    made.threads.push(r.data.id);
  };
  await thread(null, past);
  await thread("ملخص الدعوى", null);
}
async function cleanup() {
  if (made.threads.length) await db.from("chat_threads").delete().in("id", made.threads);
  if (made.hearings.length) await db.from("hearings").delete().in("id", made.hearings);
}

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

async function ctxOf(w: number, hgt: number, dark: boolean): Promise<[BrowserContext, Page]> {
  const touch = w < 600;
  const ctx = await browser.newContext({ storageState: state, viewport: { width: w, height: hgt }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light" });
  await ctx.addInitScript((d) => { try { localStorage.setItem("theme", d ? "dark" : "light"); } catch { /* none */ } }, dark);
  const page = await ctx.newPage();
  await page.addInitScript(() => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s)); });
  return [ctx, page];
}
async function open(page: Page, path: string, wait: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForSelector(wait, { timeout: 30_000 });
  await page.waitForTimeout(1500);
}
const file = (name: string, w: number, t: string) => `${OUT}/${name}-${w}-${t}.png`;

try {
  await fixture();
  for (const dark of [false, true]) {
    const t = dark ? "dark" : "light";
    for (const [w, h] of SIZES) {
      const phone = w < 600;
      const [ctx, page] = await ctxOf(w, h, dark);
      const snap = async (name: string, el?: string) => {
        if (el) await page.locator(el).first().screenshot({ path: file(name, w, t) });
        else await page.screenshot({ path: file(name, w, t) });
      };
      for (const p of PAGES) {
        if (phone && p.name === "Home") continue; // on the phone «/» is the chat (the Home cards sit under it): see Noticed
        await open(page, p.path, p.wait);
        await snap(p.name, p.el);
      }
      // the case page: header + the hearing card, the facts timeline, the hearing cards (case 772)
      // (on the phone the case page is a sheet over the chat: ?sheet=1)
      const sheet = phone ? "&sheet=1" : "";
      await open(page, `/cases/${CASE}?tab=overview${sheet}`, "main");
      await snap("Case");
      await open(page, `/cases/${CASE}?tab=facts${sheet}`, "main");
      await snap("Facts");
      await open(page, `/cases/${CASE}?tab=hearings${sheet}`, "main");
      await snap("Hearings");
      // the sessions list: desktop = the list button of the chat header; phone = the context picker
      await open(page, `/cases/${CASE}`, "aside");
      if (phone) await page.locator('button[aria-label="اختار المحادثة"]').click();
      else await page.locator('aside button[aria-label="محادثات"]').click();
      await page.waitForTimeout(1200);
      await snap("Sessions");
      // the «لاحظت» cards (general chat)
      await open(page, "/", "aside");
      const noticed = page.locator('section[aria-label="لاحظت"]');
      await noticed.first().waitFor({ timeout: 20_000 }).catch(() => console.log("no «لاحظت» cards on this run"));
      if (await noticed.count()) await noticed.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      if (await noticed.count()) await snap("Noticed", 'section[aria-label="لاحظت"]'); else await snap("Noticed");
      await ctx.close();
    }
  }
  console.log(`saved to ${OUT}`);
} finally {
  await cleanup();
  await browser.close();
}
