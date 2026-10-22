// Screenshots of the edit proposals (split layout PR 2) → screenshots/compare/split/ (light and dark): the card in the chat and the
// highlighted page at 1440 / 1920 / 2560 (1920 next to SplitLightCase / SplitDarkCase), the phone's card with «شوف في الصفحة» and the
// sheet with the highlights + bottom bar (next to SplitM*Case / SplitM*Sheet), and the page after the confirm.
// NO model call: the card is made by code (createProposal) in a session of case 772; everything it changes is put back at the end
// (the decision's next hearing, the circuit, the new fact, the session and the card).
// Needs the app running. Run: npx tsx --conditions=react-server --env-file=.env.local scripts/edits-shots.ts [baseUrl]
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";
import { createProposal } from "@/lib/proposals";

const BASE = process.argv[2] ?? "http://localhost:4600";
const OUT = "screenshots/compare/split";
const MOCK = "screenshots/mockups/split";
mkdirSync(OUT, { recursive: true });

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const db = sb as unknown as Db;
const { data: c } = await db.from("cases").select("*").eq("case_number", "772").limit(1).single();
const caseId = c!.id;
// the hearing the decision is for: the latest one with no decision yet (a decision can only be recorded for a hearing that has happened)
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
  const ctx = await browser.newContext({ storageState: state, viewport: { width: w, height: hgt }, deviceScaleFactor: w < 600 ? 2 : 1, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light" });
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

/** a session with the lawyer's message, Clausia's line and the card (made by code, not by the model) */
async function fixture() {
  const { data: t } = await db.from("chat_threads").insert({ case_id: caseId, title: "اختبار-تعديلات: بطاقة تعديل" }).select("id").single();
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

/** put everything back as it was */
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

try {
  for (const dark of [false, true]) {
    const t = dark ? "dark" : "light";
    const L = dark ? "Dark" : "Light";
    const f = await fixture();
    try {
      const url = `/cases/${caseId}?s=${f.threadId}`;
      for (const [w, hgt] of [[1440, 900], [1920, 1080], [2560, 1440]] as const) {
        const [ctx, page] = await ctxOf(w, hgt, dark);
        await go(page, url);
        await shot(page, `Edit-${w}-${t}`, w === 1920 ? `Split${L}Case` : undefined);
        await ctx.close();
      }
      // phone: the card (with «شوف في الصفحة») and the sheet with the highlights + the bottom bar
      const [mctx, mp] = await ctxOf(390, 844, dark);
      await go(mp, url);
      await shot(mp, `M-edit-card-${t}`, `SplitM${L}Case`);
      await go(mp, `${url}&sheet=1`);
      await mp.waitForTimeout(600);
      await shot(mp, `M-edit-sheet-${t}`, `SplitM${L}Sheet`);
      await mctx.close();
      // the page after the confirm (desktop, from the page's own bar)
      const [ctx, page] = await ctxOf(1440, 900, dark);
      await go(page, url);
      await page.getByRole("region", { name: "تعديلات مقترحة" }).getByRole("button", { name: "أكّد" }).click();
      await page.waitForFunction(() => !document.querySelector("[data-pending-row]"), undefined, { timeout: 30_000 });
      await page.waitForTimeout(1200);
      await shot(page, `Edit-after-confirm-1440-${t}`);
      await ctx.close();
    } finally {
      await revert(f);
    }
  }
} finally {
  await browser.close();
}
console.log("done");
