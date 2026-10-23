// Screenshots of «لنا · طلباتنا» / «ضدنا · دفوع الخصم» (sides PR) → screenshots/compare/split/, prefix Sides- (light and dark):
//   Sides-<1440|1920|2560>-<light|dark>   the case page with the two cards in view
//   Sides-compare-1920-<light|dark>       the mockup (SidesLight / SidesDark, 1920) next to the real page
//   Sides-M-<light|dark>                  the phone (390): the two cards stacked
//   Sides-write-reply-1920-light / Sides-see-reply-1920-light   «اكتب الرد» (chip + the box filled, nothing sent) and «شوف الرد» (the reply's sheet)
// NO model call. A fixture is added to case 772 (a memo and a claim sheet, one more request, three defenses of the memo, one answered by
// one of our arguments) and removed again at the end.
// Needs the app running. Run: npx tsx --conditions=react-server --env-file=.env.local scripts/sides-shots.ts [baseUrl]
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync } from "node:fs";
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";

const BASE = process.argv[2] ?? "http://localhost:5100";
const OUT = "screenshots/compare/split";
mkdirSync(OUT, { recursive: true });

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const db = sb as unknown as Db;
const { data: c } = await db.from("cases").select("id").eq("case_number", "772").limit(1).single();
const caseId = c!.id;

const doc = async (title: string, doc_type: "opponent_memo" | "claim_sheet", doc_date: string) =>
  (await db.from("documents").insert({ case_id: caseId, storage_path: `test/${crypto.randomUUID()}/x.pdf`, file_name: `${title}.pdf`, title, mime_type: "application/pdf", size_bytes: 1000, doc_type, doc_date, read_status: "done", source_kind: "manual", page_count: 4 }).select("id").single()).data!.id;
const made = { docs: [] as string[], args: [] as string[], reqs: [] as string[] };

async function fixture() {
  const memo = await doc("مذكرة الخصم", "opponent_memo", "2026-10-15");
  const sheet = await doc("الصحيفة", "claim_sheet", "2026-03-01");
  made.docs.push(memo, sheet);
  const req = await db.from("case_requests").insert({ case_id: caseId, text: "إلزامه بالمصروفات وأتعاب المحاماة", kind: "primary", source_kind: "document", source_document_id: sheet, source_page: 4, source_quote: "ومصروفات الدعوى" }).select("id").single();
  made.reqs.push(req.data!.id);
  const arg = async (side: "ours" | "opponent", text: string, page: number | null) =>
    (await db.from("case_arguments").insert({ case_id: caseId, side, text, kind: side === "opponent" ? "formal_defense" : "argument", ...(page ? { source_kind: "document" as const, source_document_id: memo, source_page: page, source_quote: text } : { source_kind: "manual" as const }) }).select("id").single()).data!.id;
  const d1 = await arg("opponent", "الدفع بعدم قبول الدعوى لعدم سبق التكليف بالوفاء", 2);
  const d2 = await arg("opponent", "السداد عن طريق التحويل البنكي لشهري يناير وفبراير", 3);
  const d3 = await arg("opponent", "الدفع بعدم الاختصاص المحلي", 1);
  const reply = await arg("ours", "الاختصاص المحلي لمحكمة شمال القاهرة بحكم موقع العين المؤجرة", null);
  made.args.push(d1, d2, d3, reply);
  const link = await db.from("case_arguments").update({ reply_argument_id: reply }).eq("id", d3).select("id");
  if (link.error) throw link.error;
  return { d1, d3, reply };
}
async function cleanup() {
  for (const id of made.args) await db.from("case_arguments").update({ reply_argument_id: null }).eq("id", id);
  if (made.args.length) await db.from("case_arguments").delete().in("id", made.args);
  if (made.reqs.length) await db.from("case_requests").delete().in("id", made.reqs);
  if (made.docs.length) await db.from("documents").delete().in("id", made.docs);
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
async function go(page: Page, sheet = false) {
  await page.goto(`${BASE}/cases/${caseId}${sheet ? "?sheet=1" : ""}`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForSelector('section[aria-label="لنا · طلباتنا"]', { timeout: 20_000 }).catch(async (e) => { await page.screenshot({ path: "screenshots/tmp/sides-fail.png" }); throw e; });
  await page.waitForTimeout(1500);
}
/** scroll so the two cards start `top` px under the top of the screen */
async function toSides(page: Page, top: number, sheet = false) {
  // desktop: the window scrolls; phone: the page is a sheet with its own scroll
  await page.evaluate(([t, inSheet]) => { const el = document.querySelector('section[aria-label="لنا · طلباتنا"]')!; if (inSheet) { el.scrollIntoView({ block: "start" }); return; } window.scrollBy(0, el.getBoundingClientRect().top - (t as number)); }, [top, sheet] as const);
  await page.waitForTimeout(500);
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` });

async function compare(app: string, mock: string, out: string, dark: boolean) {
  const html = `<html><body style="margin:0;background:${dark ? "#05070c" : "#dfe2e8"};font:600 14px -apple-system,sans-serif;color:${dark ? "#ccc" : "#333"}">
    <div style="display:flex;gap:24px;padding:16px;align-items:flex-start">
      <div><div style="padding:0 0 8px">Mockup · ${dark ? "SidesDark" : "SidesLight"} (1920px)</div><img src="data:image/png;base64,${readFileSync(mock).toString("base64")}" style="width:1920px;display:block;border-radius:12px"></div>
      <div><div style="padding:0 0 8px">App · case page (1920px)</div><img src="data:image/png;base64,${readFileSync(app).toString("base64")}" style="width:1920px;display:block;border-radius:12px"></div>
    </div></body></html>`;
  const ctx = await browser.newContext({ viewport: { width: 3920, height: 800 } });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: out, fullPage: true });
  await ctx.close();
}

try {
  const f = await fixture();
  for (const dark of [false, true]) {
    const t = dark ? "dark" : "light";
    for (const [w, h] of [[1440, 900], [1920, 1080], [2560, 1440]] as const) {
      const [ctx, page] = await ctxOf(w, h, dark);
      await go(page);
      await toSides(page, 130);
      await shot(page, `Sides-${w}-${t}`);
      if (w === 1920) await compare(`${OUT}/Sides-1920-${t}.png`, `screenshots/mockups/split/${dark ? "SidesDark" : "SidesLight"}.png`, `${OUT}/Sides-compare-1920-${t}.png`, dark);
      await ctx.close();
    }
    // the phone
    {
      const [ctx, page] = await ctxOf(390, 844, dark);
      await go(page, true);
      await toSides(page, 60, true);
      await shot(page, `Sides-M-${t}`);
      await ctx.close();
    }
  }

  // «اكتب الرد» and «شوف الرد» (1920, light)
  {
    const [ctx, page] = await ctxOf(1920, 1080, false);
    await go(page);
    await toSides(page, 130);
    const needs = page.locator('section[aria-label="ضدنا · دفوع الخصم"] button', { hasText: "اكتب الرد" });
    console.log("«اكتب الرد» buttons:", await needs.count());
    const box = await page.locator('section[aria-label="ضدنا · دفوع الخصم"] button', { hasText: "اكتب الرد" }).first().boundingBox();
    console.log("«اكتب الرد» tap area (visual box):", box);
    await needs.first().click();
    await page.waitForTimeout(600);
    const text = await page.locator("aside textarea").inputValue();
    const chips = await page.locator("aside").getByText("الدفع", { exact: false }).count();
    console.log(`after «اكتب الرد»: box = «${text}», focused = ${await page.evaluate(() => document.activeElement?.tagName)}, sheet open = ${await page.locator("dialog[open]").count()}, chip mentions = ${chips}`);
    await shot(page, "Sides-write-reply-1920-light");
    await go(page);
    await toSides(page, 130);
    await page.locator('section[aria-label="ضدنا · دفوع الخصم"] a', { hasText: "شوف الرد" }).first().click();
    await page.waitForTimeout(700);
    console.log(`after «شوف الرد»: open sheet = ${await page.locator("dialog[open]").count()}, url hash = ${new URL(page.url()).hash}, expected #item-${f.reply}`);
    await shot(page, "Sides-see-reply-1920-light");
    await ctx.close();
  }
} finally {
  await cleanup();
  await browser.close();
}
