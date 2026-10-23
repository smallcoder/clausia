// Screenshots of «اسأل Clausia» and «تراجع» (split layout PR 2b) → screenshots/compare/split/ (light and dark), prefix Ask- / Undo-:
//   Ask-pill-fact / Ask-pill-header (the hover pill), Ask-chip (the chip in the composer, the cursor in the box) at 1440 / 1920 / 2560,
//   Ask-M-pill / Ask-M-chip on the phone (tap shows the pill; the tap on it closes the sheet);
//   Undo-toast (right after the confirm from the page's bar), Undo-after (after «تراجع»: the highlights are back), Undo-toast-card (the confirm from the card),
//   Undo-M-toast / Undo-M-after on the phone.
// NO model call: the card is made by code (createProposal) in a session of case 772; the undo puts everything back and a final revert makes sure.
// Needs the app running. Run: npx tsx --conditions=react-server --env-file=.env.local scripts/ask-undo-shots.ts [baseUrl]
import { chromium, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";
import { createProposal } from "@/lib/proposals";

const BASE = process.argv[2] ?? "http://localhost:4900";
const OUT = "screenshots/compare/split";
mkdirSync(OUT, { recursive: true });

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const db = sb as unknown as Db;
const { data: c } = await db.from("cases").select("*").eq("case_number", "772").limit(1).single();
const caseId = c!.id;
const { data: h } = await db.from("hearings").select("*").eq("case_id", caseId).is("decision_type", null).lte("hearing_date", new Date().toISOString().slice(0, 10)).order("hearing_date", { ascending: false }).limit(1).single();
const USER_TEXT = "الجلسة النهارده اتأجلت لـ 5/12/2026 عشان نقدم أصل عقد الإيجار";
const FACT = "الموكل قال إن أصل عقد الإيجار مش معاه";

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
async function go(page: Page, path: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForSelector('aside[aria-label="محادثة Clausia"]');
  await page.waitForTimeout(1500);
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` });

/** a session with the lawyer's message, Clausia's line and the card (made by code, not by the model) */
async function fixture() {
  const { data: t } = await db.from("chat_threads").insert({ case_id: caseId, title: "اختبار-تعديلات: تراجع" }).select("id").single();
  const { data: u } = await db.from("chat_messages").insert({ thread_id: t!.id, role: "user", content: USER_TEXT }).select("id").single();
  const { data: a } = await db.from("chat_messages").insert({ thread_id: t!.id, role: "assistant", content: "تمام. ده اللي هيتغير، ومعلّمه على الصفحة جنبك بالدهبي:" }).select("id").single();
  const src = { kind: "chat" as const, message_id: u!.id };
  const p = await createProposal(db, {
    threadId: t!.id, messageId: a!.id, caseId, sourceTexts: [USER_TEXT, FACT],
    ops: [
      { tool: "record_decision", args: { hearing: h!.id, decision: "postponed", decision_text: "لتقديم أصل عقد الإيجار", next_date: "5/12/2026", quote: USER_TEXT }, source: src },
      { tool: "update_case", args: { case: caseId, circuit: "5", quote: USER_TEXT }, source: src },
      { tool: "add_fact", args: { case: caseId, text: FACT, quote: USER_TEXT }, source: src },
    ],
  });
  return { threadId: t!.id, proposalId: p.id };
}

/** put everything back as it was (the undo already did; this is the safety net) */
async function revert(f: { threadId: string; proposalId: string }) {
  const { data: now } = await db.from("hearings").select("id, next_hearing_id").eq("id", h!.id).single();
  const { id: _id, office_id: _o, created_at: _c, ...back } = h!;
  await db.from("hearings").update(back).eq("id", h!.id);
  if (now?.next_hearing_id && now.next_hearing_id !== h!.next_hearing_id) await db.from("hearings").delete().eq("id", now.next_hearing_id);
  const { id: _cid, office_id: _co, created_at: _cc, ...caseBack } = c!;
  await db.from("cases").update(caseBack).eq("id", caseId);
  await db.from("case_facts").delete().eq("case_id", caseId).eq("text", FACT);
  await db.from("proposals").delete().eq("id", f.proposalId);
  await db.from("chat_threads").delete().eq("id", f.threadId);
}

/** the pill of the item (its nearest «اسأل Clausia» wrapper) */
const pillOf = (item: Locator) => item.locator('xpath=ancestor-or-self::div[contains(@class,"group/ask")][1]').locator('button[aria-label^="اسأل Clausia عن"]');
const waitToast = (page: Page) => page.getByRole("status").filter({ hasText: "اتحفظ" }).waitFor({ timeout: 30_000 });

try {
  for (const dark of [false, true]) {
    const t = dark ? "dark" : "light";
    const f = await fixture();
    try {
      const url = `/cases/${caseId}?s=${f.threadId}`;

      // ---------- desktop ----------
      for (const [w, hgt] of [[1440, 900], [1920, 1080], [2560, 1440]] as const) {
        const [ctx, page] = await ctxOf(w, hgt, dark);
        await go(page, url);

        // the hover pill on a header cell (the court) and on a fact
        const cell = page.locator("div.\\@container dl > div").nth(1);
        await cell.hover();
        await page.waitForTimeout(400);
        await shot(page, `Ask-pill-header-${w}-${t}`);
        const fact = page.locator('section#facts div[id^="item-"]').first();
        await fact.scrollIntoViewIfNeeded();
        await fact.hover();
        await page.waitForTimeout(400);
        await shot(page, `Ask-pill-fact-${w}-${t}`);
        // the click: the chip in the composer, the cursor in the box, nothing sent
        await pillOf(fact).click();
        await page.waitForTimeout(500);
        const focused = await page.evaluate(() => document.activeElement?.tagName === "TEXTAREA");
        console.log(`${w} ${t}: composer focused after the click = ${focused}`);
        await shot(page, `Ask-chip-${w}-${t}`);

        // the confirm from the page's bar → the toast → «تراجع» → the highlights are back
        await go(page, url);
        await page.getByRole("region", { name: "تعديلات مقترحة" }).getByRole("button", { name: "أكّد" }).click();
        await waitToast(page);
        await page.waitForFunction(() => !document.querySelector("[data-pending-row]"), undefined, { timeout: 30_000 });
        await page.waitForTimeout(600);
        await shot(page, `Undo-toast-${w}-${t}`);
        await page.getByRole("status").getByRole("button", { name: "تراجع" }).click();
        await page.waitForFunction(() => !!document.querySelector("[data-pending-row]"), undefined, { timeout: 30_000 });
        await page.waitForTimeout(800);
        await shot(page, `Undo-after-${w}-${t}`);
        await ctx.close();
      }

      // the confirm from the card in the chat (1440)
      {
        const [ctx, page] = await ctxOf(1440, 900, dark);
        await go(page, url);
        await page.locator("aside").getByRole("button", { name: /^أكّد/ }).first().click();
        await waitToast(page);
        await page.waitForFunction(() => !document.querySelector("[data-pending-row]"), undefined, { timeout: 30_000 });
        await page.waitForTimeout(600);
        await shot(page, `Undo-toast-card-1440-${t}`);
        await page.getByRole("status").getByRole("button", { name: "تراجع" }).click();
        await page.waitForFunction(() => !!document.querySelector("[data-pending-row]"), undefined, { timeout: 30_000 });
        await page.waitForTimeout(500);
        await ctx.close();
      }

      // ---------- phone: the page is a sheet over the chat ----------
      {
        const [ctx, page] = await ctxOf(390, 844, dark);
        await go(page, `${url}&sheet=1`);
        await page.waitForTimeout(600);
        // a tap on a spec cell shows the pill; the tap on the pill closes the sheet and the chip is in the composer
        const mcell = page.locator("dl.lg\\:hidden > div").nth(1);
        await mcell.tap();
        await page.waitForTimeout(400);
        await shot(page, `Ask-M-pill-${t}`);
        await pillOf(mcell).tap();
        await page.waitForTimeout(1200);
        await shot(page, `Ask-M-chip-${t}`);
        // the confirm from the sheet's bottom bar → the toast → «تراجع»
        await go(page, `${url}&sheet=1`);
        await page.waitForTimeout(600);
        await page.locator("#sheet-confirm-slot").getByRole("button", { name: /^أكّد/ }).tap();
        await waitToast(page);
        await page.waitForFunction(() => !document.querySelector("[data-pending-row]"), undefined, { timeout: 30_000 });
        await page.waitForTimeout(600);
        await shot(page, `Undo-M-toast-${t}`);
        await page.getByRole("status").getByRole("button", { name: "تراجع" }).tap();
        await page.waitForFunction(() => !!document.querySelector("[data-pending-row]"), undefined, { timeout: 30_000 });
        await page.waitForTimeout(800);
        await shot(page, `Undo-M-after-${t}`);
        await ctx.close();
      }
    } finally {
      await revert(f);
    }
  }
} finally {
  await browser.close();
}
console.log("done");
