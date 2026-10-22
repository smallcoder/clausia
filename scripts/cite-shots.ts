// «Source to the sentence» shots: the mockup (docs/design/next/Cite{Light,Dark}.dc.html, 1920x1080) next to the real
// screen with the panel open → screenshots/compare/next/Cite{Light,Dark}.png, plus the mobile sheet →
// screenshots/compare/next/CiteMobile{Light,Dark}.png (app only). It also checks, in the real browser, what the unit tests
// cannot: the mark is on the page, Esc closes the panel and focus returns to the chip, aria-current, the old-row fallback.
// Fixture (free, no model): a temporary thread with a copy of an existing claim-sheet paper (its saved page text) and one
// card whose rows carry spans, one whose rows do not (an older item) and one whose quote is not on the page; all removed at the end.
// Needs the app running. Run: npx tsx --conditions=react-server --env-file=.env.local scripts/cite-shots.ts [baseUrl]
import { chromium, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Database } from "@/lib/db/types";
import { createProposal, type DraftOp } from "@/lib/proposals";
import { findSpanInPages } from "@/lib/quote-match";
import type { Db } from "@/lib/supabase/server";
import { createGeneralThread } from "@/lib/threads";

const BASE = process.argv[2] ?? "http://localhost:4000";
mkdirSync("screenshots/compare/next", { recursive: true });
mkdirSync("screenshots/tmp", { recursive: true });
const failures: string[] = [];
const check = (ok: boolean, label: string) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failures.push(label); };

async function fixture(db: Db) {
  const { data: src } = await db.from("documents").select("*").eq("file_name", "claim-sheet.pdf").eq("read_status", "done").order("created_at").limit(1).single();
  if (!src) throw new Error("no read claim-sheet.pdf in the demo office to copy");
  const { data: pg } = await db.from("document_pages").select("page_no, text, model, office_id").eq("document_id", src.id).order("page_no");
  const pages = (pg ?? []).map((p) => p.text);
  const threadId = await createGeneralThread(db, "اختبار-مصدر-الجملة");
  const { data: am } = await db.from("chat_messages").insert({ thread_id: threadId, role: "assistant", content: "قريت الصحيفة وجهّزت ملف القضية. دوس على أي مصدر عشان تشوف الجملة في الورقة." }).select("id").single();
  const docId = crypto.randomUUID();
  const { error: de } = await db.from("documents").insert({
    id: docId, thread_id: threadId, case_id: null, storage_path: src.storage_path, file_name: src.file_name, mime_type: src.mime_type, size_bytes: src.size_bytes,
    source_kind: "chat", read_status: "done", page_count: pages.length, doc_type: "claim_sheet",
  });
  if (de) throw new Error(de.message);
  const { error: pe } = await db.from("document_pages").insert((pg ?? []).map((p) => ({ document_id: docId, page_no: p.page_no, text: p.text, model: p.model, office_id: p.office_id })));
  if (pe) throw new Error(pe.message);

  const lawyer = "موكلي هو سامح التجريبي عبد الفتاح";
  const paper = (page: number, quote: string, withSpan: boolean): DraftOp["source"] => {
    const hit = findSpanInPages(pages, quote, page);
    return { kind: "document", document_id: docId, page: hit?.page ?? page, quote, ...(withSpan && hit ? { char_start: hit.start, char_end: hit.end } : {}) };
  };
  const rows = (withSpan: boolean, badQuote = false): DraftOp[] => [
    { tool: "create_client", args: { ref: "c1", name: "سامح التجريبي عبد الفتاح", kind: "person", quote: "سامح التجريبي عبد الفتاح" }, source: { kind: "chat", message_id: null, quote: "سامح التجريبي عبد الفتاح" } },
    { tool: "create_case", args: { ref: "case1", client: "@c1", case_number: "4471", case_year: 2026, court: "محكمة القاهرة الجديدة الابتدائية", stage: "first_instance", quote: "قيدت برقم 4471 لسنة 2026 مدني كلي القاهرة الجديدة" }, source: paper(1, "قيدت برقم 4471 لسنة 2026 مدني كلي القاهرة الجديدة", withSpan) },
    { tool: "add_fact", args: { case: "@case1", date: "10/1/2025", text: "تعاقد الطالب مع الشركة على توريد معدات مكتبية بمبلغ 350,000 جنيه", quote: badQuote ? "جملة مش موجودة في الورقة خالص" : "تعاقد الطالب مع الشركة المعلن إليها على توريد معدات مكتبية بمبلغ إجمالي قدره 350,000 جنيه" }, source: paper(1, badQuote ? "جملة مش موجودة في الورقة خالص" : "تعاقد الطالب مع الشركة المعلن إليها على توريد معدات مكتبية بمبلغ إجمالي قدره 350,000 جنيه", withSpan) },
    { tool: "add_request", args: { case: "@case1", text: "فسخ عقد التوريد ورد مبلغ 150,000 جنيه", quote: "بفسخ عقد التوريد المؤرخ 10/1/2025 وإلزام الشركة المدعى عليها برد مبلغ 150,000 جنيه للمدعي" }, source: paper(2, "بفسخ عقد التوريد المؤرخ 10/1/2025 وإلزام الشركة المدعى عليها برد مبلغ 150,000 جنيه للمدعي", withSpan) },
  ];
  const mk = async (ops: DraftOp[]) => (await createProposal(db, { threadId, messageId: am!.id, caseId: null, documentId: docId, ops, sourceTexts: [lawyer, ...pages] })).id;
  const main = await mk(rows(true));
  const old = await mk(rows(false));
  const lost = await mk(rows(false, true));
  return { threadId, docId, main, old, lost, pages };
}

let state: Awaited<ReturnType<import("@playwright/test").BrowserContext["storageState"]>> | null = null;
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

async function open(browser: Browser, threadId: string, mobile: boolean, dark: boolean) {
  const ctx = await browser.newContext({ storageState: await session(browser), viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 }, deviceScaleFactor: mobile ? 2 : 1, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light" });
  const page = await ctx.newPage();
  try { await page.goto(`${BASE}/chat/${threadId}`, { waitUntil: "domcontentloaded", timeout: 60_000 }); }
  catch { await page.goto(`${BASE}/chat/${threadId}`, { waitUntil: "domcontentloaded", timeout: 90_000 }); }
  await page.waitForSelector("[data-cite-id]", { timeout: 30_000 });
  await page.waitForTimeout(800);
  return { ctx, page };
}

const chip = (page: Page, pid: string, op: string) => page.locator(`[data-cite-id="card:${pid}:${op}"]`);

async function sideBySide(browser: Browser, mock: string, app: string, out: string, dark: boolean) {
  const html = `<html><body style="margin:0;background:${dark ? "#05070c" : "#dfe2e8"};font:600 14px -apple-system,sans-serif;color:${dark ? "#ccc" : "#333"}">
    <div style="display:flex;gap:24px;padding:16px;align-items:flex-start">
      <div><div style="padding:0 0 8px">Mockup · ${mock} (1920px)</div><img src="data:image/png;base64,${readFileSync(resolve(`screenshots/mockups/next/${mock}.png`)).toString("base64")}" style="width:1920px;display:block;border-radius:12px"></div>
      <div><div style="padding:0 0 8px">App · chat thread, panel open (1920px)</div><img src="data:image/png;base64,${readFileSync(app).toString("base64")}" style="width:1920px;display:block;border-radius:12px"></div>
    </div></body></html>`;
  const c2 = await browser.newContext({ viewport: { width: 3920, height: 800 } });
  const p2 = await c2.newPage();
  await p2.setContent(html, { waitUntil: "load" });
  await p2.screenshot({ path: out, fullPage: true });
  await c2.close();
}

async function main() {
  const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { error: ae } = await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
  if (ae) throw new Error(`sign-in: ${ae.message}`);
  const db = sb as unknown as Db;
  const fx = await fixture(db);
  const browser = await chromium.launch();
  try {
    for (const dark of [false, true]) {
      const name = dark ? "CiteDark" : "CiteLight";
      console.log(`\n=== ${name} desktop 1920 ===`);
      const { ctx, page } = await open(browser, fx.threadId, false, dark);
      const fact = chip(page, fx.main, "op3");
      await fact.scrollIntoViewIfNeeded();
      await fact.focus();
      await fact.press("Enter");
      await page.waitForSelector("aside mark", { timeout: 15_000 });
      await page.waitForTimeout(700);
      page.on("console", (m) => { if (m.text().startsWith("OUTLINE")) console.log(m.text()); });
      const info = await page.evaluate(() => {
        const a = document.querySelector("aside")!;
        const m = a.querySelector("mark")!;
        const r = m.getBoundingClientRect(), box = a.getBoundingClientRect();
        const cs = getComputedStyle(a);
        console.log("OUTLINE", cs.outlineStyle, cs.outlineColor, a.matches(":focus-visible"), a.getAttribute("tabindex"));
        return { label: a.getAttribute("aria-label"), mark: m.textContent, markIn: r.top >= box.top && r.bottom <= box.bottom, focusInside: a.contains(document.activeElement) || a === document.activeElement, left: box.left, right: box.right, scrollY: window.scrollY };
      });
      check(!!info.mark && info.mark.startsWith("تعاقد الطالب"), `${name}: the sentence is marked («${info.mark?.slice(0, 30)}…»)`);
      check(info.markIn, `${name}: the mark is inside the panel's view`);
      check(info.focusInside, `${name}: focus moved into the panel`);
      check(info.label?.includes("الورقة") ?? false, `${name}: the panel is labelled (${info.label})`);
      check(info.left < 960 && info.right < 960 + 12, `${name}: the panel is the left half in RTL (x ${Math.round(info.left)}–${Math.round(info.right)})`);
      check((await fact.getAttribute("aria-current")) === "true", `${name}: aria-current on the open chip`);
      check((await chip(page, fx.main, "op4").getAttribute("aria-current")) === null, `${name}: aria-current only on the open chip`);
      await page.screenshot({ path: resolve(`screenshots/tmp/app-${name}.png`) });
      await sideBySide(browser, name, resolve(`screenshots/tmp/app-${name}.png`), resolve(`screenshots/compare/next/${name}.png`), dark);

      // page control: another page has no mark; back to the source page has it again
      await page.locator("aside select").selectOption("2");
      check((await page.locator("aside mark").count()) === 0, `${name}: page 2 of the same paper has no mark`);
      await page.locator("aside select").selectOption("1");
      check((await page.locator("aside mark").count()) >= 1, `${name}: the source page marks it again`);
      // a second chip replaces the first
      await chip(page, fx.main, "op4").click();
      await page.waitForSelector("aside mark");
      check((await page.locator("aside mark").first().textContent())?.startsWith("بفسخ") ?? false, `${name}: another chip opens its own sentence (page 2)`);
      check((await page.locator("aside select").inputValue()) === "2", `${name}: …at its page`);
      // Esc: closes it, focus back on the chip
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      check((await page.locator("aside").count()) === 0, `${name}: Esc closes the panel`);
      check(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("data-cite-id") ?? "") === `card:${fx.main}:op4`, `${name}: focus is back on the chip`);

      if (!dark) {
        // an older item (no span): the code matcher finds the sentence; one whose quote is not on the page: no mark and a note
        await chip(page, fx.old, "op3").click();
        await page.waitForSelector("aside mark", { timeout: 10_000 }).catch(() => {});
        check((await page.locator("aside mark").first().textContent().catch(() => ""))?.startsWith("تعاقد الطالب") ?? false, "old item without a span: found by the matcher and marked");
        await page.screenshot({ path: resolve("screenshots/tmp/app-old-row.png") });
        await page.keyboard.press("Escape");
        await chip(page, fx.lost, "op3").click();
        await page.waitForSelector("aside");
        await page.waitForTimeout(500);
        check((await page.locator("aside mark").count()) === 0, "quote not on the page: no mark");
        check(((await page.locator("aside").textContent()) ?? "").includes("مش لاقي الجملة بالظبط في الصفحة"), "quote not on the page: the note «مش لاقي الجملة بالظبط في الصفحة»");
        await page.screenshot({ path: resolve("screenshots/tmp/app-not-found.png") });
        // the lawyer's own message: no panel
        const msg = page.locator(`[data-cite-id^="card:${fx.main}:op1"]`);
        check((await msg.count()) === 0, "«من رسالتك» is a label, not a chip that opens the panel");
      }
      await ctx.close();

      console.log(`=== ${name} mobile 390 ===`);
      const m = await open(browser, fx.threadId, true, dark);
      await chip(m.page, fx.main, "op3").scrollIntoViewIfNeeded();
      await chip(m.page, fx.main, "op3").click();
      await m.page.waitForSelector('[role="dialog"] mark', { timeout: 15_000 });
      await m.page.waitForTimeout(700);
      check(await m.page.evaluate(() => !!document.querySelector('[role="dialog"][aria-modal="true"][aria-label]')), `${name} mobile: a labelled modal sheet`);
      await m.page.screenshot({ path: resolve(`screenshots/compare/next/CiteMobile${dark ? "Dark" : "Light"}.png`) });
      await m.page.keyboard.press("Escape");
      await m.page.waitForTimeout(300);
      check((await m.page.locator('[role="dialog"]').count()) === 0, `${name} mobile: Esc closes the sheet`);
      await m.ctx.close();
    }
  } finally {
    await browser.close();
    await db.from("proposals").delete().eq("thread_id", fx.threadId);
    await db.from("documents").delete().eq("id", fx.docId); // the row only: the Storage object is the source paper's own
    await db.from("chat_threads").delete().eq("id", fx.threadId);
    console.log("\ncleanup: fixture thread, paper copy and cards removed");
  }
  console.log(failures.length ? `\nFAILED ${failures.length}: ${failures.join(" | ")}` : "\nALL CHECKS PASSED");
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error("FAIL", e); process.exit(1); });
