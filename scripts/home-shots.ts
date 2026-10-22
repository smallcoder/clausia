// Home of the chat-first split layout → screenshots/compare/split/ (light and dark), each app shot next to its mockup
// (screenshots/mockups/split/*.png: mockup left, app right) where one exists. NO model call.
//  - Home at 1440 / 1920 / 2560 (compare at 1920 both themes and 2560 light), the phone's chat (390, compare), a noticed card after «تجاهل»,
//    the brief's cite chip open, and the record-decision sheet opened from a card.
// The demo office has little this week, so the script adds a small FIXTURE with the demo login (RLS client): two papers («الصحيفة»,
// «الإنذار») on case 772, a hearing today that came from a paper, and the same event dated 15/3 in one paper and 15/4 in the other
// (a date conflict). Everything is removed at the end (also when a step fails), and today's saved brief is dropped before and after.
// Needs the app running. Run: npx tsx --env-file=.env.local scripts/home-shots.ts [baseUrl]   (default http://localhost:4700)
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { todayIso } from "../src/lib/dates";
import { findSpan } from "../src/lib/quote-match";

const BASE = process.argv[2] ?? "http://localhost:4700";
const OUT = "screenshots/compare/split";
const MOCK = "screenshots/mockups/split";
mkdirSync(OUT, { recursive: true });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const db = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const admin = createClient(URL, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await db.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
if (authErr || !auth.user) throw new Error(`demo login: ${authErr?.message}`);
const userId = auth.user.id;
const { data: c } = await db.from("cases").select("id").eq("case_number", "772").limit(1).maybeSingle();
const caseId = c!.id as string;
const today = todayIso();

// ---- the fixture ----
const made = { docs: [] as string[], facts: [] as string[], hearings: [] as string[] };
const SENT = "أنذر المستأجر على يد محضر بتاريخ DATE بسداد المتأخر خلال خمسة عشر يومًا.";
async function paper(title: string, doc_type: "claim_sheet" | "correspondence", pages: string[]) {
  const { data: d, error } = await db.from("documents").insert({ case_id: caseId, title, doc_type, file_name: `${title}.pdf`, mime_type: "application/pdf", storage_path: `fixture/home-shots/${title}`, read_status: "done", page_count: pages.length, review_status: "confirmed" }).select("id").single();
  if (error || !d) throw new Error(`document: ${error?.message}`);
  made.docs.push(d.id);
  const { error: pe } = await db.from("document_pages").insert(pages.map((text, i) => ({ document_id: d.id, page_no: i + 1, text })));
  if (pe) throw new Error(`pages: ${pe.message}`);
  return d.id;
}
async function cleanup() {
  await db.from("hearings").delete().in("id", made.hearings);
  await db.from("case_facts").delete().in("id", made.facts);
  await db.from("document_pages").delete().in("document_id", made.docs);
  await db.from("documents").delete().in("id", made.docs);
  await db.from("daily_briefs").delete().eq("user_id", userId);
  await admin.from("dismissed_notices").delete().eq("user_id", userId);
}

const browser = await chromium.launch();
async function ctxOf(state: Awaited<ReturnType<BrowserContext["storageState"]>>, w: number, h: number, dark: boolean): Promise<[BrowserContext, Page]> {
  const ctx = await browser.newContext({ storageState: state, viewport: { width: w, height: h }, deviceScaleFactor: w < 600 ? 2 : 1, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light" });
  const page = await ctx.newPage();
  await page.addInitScript(() => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s)); });
  return [ctx, page];
}
async function go(page: Page, path: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForSelector('aside[aria-label="محادثة Clausia"]');
  await page.waitForTimeout(1500);
}
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

try {
  await cleanup(); // a leftover of a failed run
  const P = await paper("الصحيفة", "claim_sheet", ["محكمة شمال القاهرة الابتدائية\nصحيفة دعوى إخلاء", `صفحة 2\n\nوقائع الدعوى:\n${SENT.replace("DATE", "15/3/2026")}\nوامتنع المستأجر عن السداد رغم ذلك.`]);
  const Q = await paper("الإنذار", "correspondence", [`إنذار على يد محضر\n${SENT.replace("DATE", "15/4/2026")}\nمع حفظ كافة الحقوق.`]);
  const q1 = SENT.replace("DATE", "15/3/2026");
  const pageTwo = (await db.from("document_pages").select("text").eq("document_id", P).eq("page_no", 2).single()).data!.text;
  const span = findSpan(pageTwo, q1)!;
  const ins = async (table: "case_facts", row: Record<string, unknown>) => { const { data, error } = await db.from(table).insert(row as never).select("id").single(); if (error) throw new Error(error.message); made.facts.push((data as { id: string }).id); };
  await ins("case_facts", { case_id: caseId, text: q1, fact_date: "2026-03-15", date_precision: "day", source_kind: "document", source_document_id: P, source_page: 2, source_quote: q1, source_char_start: span.start, source_char_end: span.end, review_status: "confirmed" });
  await ins("case_facts", { case_id: caseId, text: SENT.replace("DATE", "15/4/2026"), fact_date: "2026-04-15", date_precision: "day", source_kind: "document", source_document_id: Q, source_page: 1, source_quote: SENT.replace("DATE", "15/4/2026"), review_status: "confirmed" });
  const { data: h, error: he } = await db.from("hearings").insert({ case_id: caseId, hearing_date: today, purpose: "نظر الدعوى", source_kind: "document", source_document_id: P, source_page: 2, source_quote: q1, source_char_start: span.start, source_char_end: span.end, review_status: "confirmed" }).select("id").single();
  if (he || !h) throw new Error(`hearing: ${he?.message}`);
  made.hearings.push(h.id);
  await db.from("daily_briefs").delete().eq("user_id", userId); // the brief of today is rebuilt with the fixture on the first load below

  const login = await browser.newContext();
  const lp = await login.newPage();
  await lp.goto(`${BASE}/login`);
  await lp.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await lp.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([lp.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120_000 }), lp.click('button:has-text("دخول")')]);
  const state = await login.storageState();
  await login.close();

  for (const dark of [false, true]) {
    const t = dark ? "dark" : "light";
    const L = dark ? "Dark" : "Light";
    for (const [w, hh] of [[1440, 900], [1920, 1080], [2560, 1440]] as const) {
      const [ctx, page] = await ctxOf(state, w, hh, dark);
      await go(page, "/");
      await shot(page, `Home-${w}-${t}`, w === 1920 ? `Split${L}Home` : w === 2560 && !dark ? "Split2560" : undefined);
      if (w === 1920) {
        // the brief's cite chip open (a paper source: the panel shows the page with the sentence marked)
        await page.locator('aside[aria-label="محادثة Clausia"] button[data-cite-id^="morning-hearing"]').first().click();
        await page.waitForTimeout(1200);
        await shot(page, `Home-cite-1920-${t}`);
        await page.keyboard.press("Escape");
        // the record-decision sheet from a card
        const rec = page.getByRole("button", { name: /^سجّل قرار جلسة/ }).first();
        if (await rec.count()) { await rec.click(); await page.waitForTimeout(700); await shot(page, `Home-sheet-1920-${t}`); await page.keyboard.press("Escape"); }
        // «تجاهل» on the first card: it goes, and stays gone after a reload
        const before = await page.locator('aside section[aria-label="لاحظت"] article').count();
        await page.locator('aside section[aria-label="لاحظت"] article button:has-text("تجاهل")').first().click();
        await page.waitForTimeout(1500);
        await shot(page, `Home-ignored-1920-${t}`);
        await go(page, "/");
        const after = await page.locator('aside section[aria-label="لاحظت"] article').count();
        console.log(`${t}: cards before ${before}, after «تجاهل» + reload ${after}`);
        await admin.from("dismissed_notices").delete().eq("user_id", userId); // the next shots show the card again
      }
      await ctx.close();
    }
    const [ctx, page] = await ctxOf(state, 390, 844, dark);
    await go(page, "/");
    await shot(page, `M-chat-${t}`, `SplitM${L}Chat`);
    await ctx.close();
  }
} finally {
  await cleanup();
  await browser.close();
}
console.log("done");
