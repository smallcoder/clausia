// The case documents table shots: the mockup (docs/design/next/Review{Light,Dark}.dc.html, 1920x1080) next to the real
// page → screenshots/compare/next/Review{Light,Dark}.png; the column card (ReviewCard*), the table with a confirmed
// column (ReviewColumn*) and the phone (ReviewMobile*) are app-only. It also checks in the real browser what the unit
// tests cannot: a cell chip opens the paper panel on its sentence, the suggested cell has the gold dot, no sideways scroll on a phone.
// Fixture (free, no model): a temporary case «772 لسنة 2025» with the mockup's four papers (invented text), their items with
// spans (one suggested), and a column card made from `judgeAnswer`; all removed at the end.
// Flag ON (the app started with NEXT_PUBLIC_FEATURE_DOCS_TABLE=1): all of the above, plus the row's «…» menu and status line.
// Flag OFF (the app started without it): `--off` takes ReviewFlagOff.png and checks the released view (grid + panels, no table, no «عمود جديد»).
// Needs the app running. Run: npx tsx --conditions=react-server --env-file=.env.local scripts/docs-table-shots.ts [baseUrl] [--off]
import { chromium, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Database } from "@/lib/db/types";
import { judgeAnswer, columnTitle } from "@/lib/doc-columns/run";
import { createProposal, decideProposal, type DraftOp } from "@/lib/proposals";
import { findSpanInPages } from "@/lib/quote-match";
import type { Db } from "@/lib/supabase/server";

const OFF = process.argv.includes("--off");
const BASE = process.argv.find((a, i) => i >= 2 && a.startsWith("http")) ?? "http://localhost:4100";
mkdirSync("screenshots/compare/next", { recursive: true });
mkdirSync("screenshots/tmp", { recursive: true });
const failures: string[] = [];
const check = (ok: boolean, label: string) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failures.push(label); };

const fill = (n: number, first: string[]) => Array.from({ length: n }, (_, i) => first[i] ?? `صفحة ${i + 1} من ${n}: بقية المستند.`);
const PAPERS = [
  { title: "صحيفة الدعوى", type: "claim_sheet" as const, date: "2026-02-02", pages: fill(4, [
    "صحيفة دعوى إخلاء\nأقامها المدعي عادل النموذجي ضد المدعى عليه وليد التجريبي أمام محكمة القاهرة الجديدة الابتدائية.",
    "بموجب عقد إيجار مؤرخ 1/9/2022 استأجر المدعى عليه الشقة المملوكة للمدعي لمدة سنة تتجدد.\nوامتنع المدعى عليه عن سداد الأجرة منذ يناير 2026 رغم المطالبة.",
    "الأسانيد القانونية للدعوى وصور المستندات المرفقة.",
    "ولذلك يطلب المدعي الحكم بإخلاء العين المؤجرة وإلزام المدعى عليه بالأجرة المتأخرة مع المصروفات.",
  ]) },
  { title: "عقد الإيجار", type: "contract" as const, date: "2022-09-01", pages: fill(2, [
    "عقد إيجار\nحرر هذا العقد بين الطرف الأول عادل النموذجي مؤجرًا والطرف الثاني وليد التجريبي مستأجرًا.\nمدة العقد سنة تتجدد بنفس الشروط والأجرة الشهرية 2,500 جنيه.",
    "وفي حالة التأخير في السداد يلتزم المستأجر بغرامة قدرها 500 جنيه عن كل أسبوع تأخير. وتختص محكمة القاهرة بنظر أي نزاع.",
  ]) },
  { title: "الإنذار", type: "correspondence" as const, date: "2026-03-15", pages: fill(1, [
    "إنذار على يد محضر\nننذر المدعى عليه وليد التجريبي بسداد الأجرة المتأخرة خلال 15 يومًا من تاريخه وإلا اتخذنا الإجراءات القانونية.",
  ]) },
  { title: "مذكرة الخصم", type: "opponent_memo" as const, date: "2026-10-20", pages: fill(6, [
    "مذكرة بدفاع المدعى عليه وليد التجريبي في الدعوى 772 لسنة 2025.",
    "الوقائع كما يرويها المدعى عليه.",
    "ندفع بعدم قبول الدعوى لرفعها قبل التكليف بالوفاء، ونحتفظ بحقنا في الدفوع الأخرى.",
  ]) },
];

async function fixture(db: Db) {
  const { data: c, error } = await db.from("cases").insert({ title: "دعوى إخلاء", case_number: "772", case_year: 2025, case_type: "إيجارات", court: "محكمة القاهرة الجديدة الابتدائية", circuit: "الدائرة 3", source_kind: "manual" }).select("id").single();
  if (error) throw new Error(error.message);
  const docs: { id: string; pages: string[] }[] = [];
  for (const p of PAPERS) {
    const { data: d, error: de } = await db.from("documents").insert({ case_id: c.id, storage_path: `test/${crypto.randomUUID()}/x.pdf`, file_name: `${p.title}.pdf`, title: p.title, mime_type: "application/pdf", size_bytes: 120_000, doc_type: p.type, doc_date: p.date, read_status: "done", source_kind: "manual", page_count: p.pages.length }).select("id").single();
    if (de) throw new Error(de.message);
    const { error: pe } = await db.from("document_pages").insert(p.pages.map((text, i) => ({ document_id: d.id, page_no: i + 1, text })));
    if (pe) throw new Error(pe.message);
    docs.push({ id: d.id, pages: p.pages });
  }
  const src = (i: number, page: number, quote: string) => {
    const hit = findSpanInPages(docs[i].pages, quote, page);
    if (!hit) throw new Error(`fixture quote not on the page: ${quote}`);
    return { source_kind: "document" as const, created_by_kind: "model" as const, source_document_id: docs[i].id, source_page: hit.page, source_quote: quote, source_char_start: hit.start, source_char_end: hit.end };
  };
  const ins = async (table: "case_parties" | "case_facts" | "case_requests" | "case_arguments", row: Record<string, unknown>) => {
    const { error: e } = await (db.from(table) as unknown as { insert: (r: unknown) => Promise<{ error: { message: string } | null }> }).insert({ case_id: c.id, ...row });
    if (e) throw new Error(`${table}: ${e.message}`);
  };
  const q1 = "المدعي عادل النموذجي ضد المدعى عليه وليد التجريبي";
  await ins("case_parties", { name: "عادل النموذجي", role: "plaintiff", is_our_client: true, ...src(0, 1, q1) });
  await ins("case_parties", { name: "وليد التجريبي", role: "defendant", ...src(0, 1, q1) });
  await ins("case_facts", { fact_date: "2022-09-01", date_precision: "day", date_text: "1/9/2022", text: "استأجر المدعى عليه الشقة بعقد", ...src(0, 2, "بموجب عقد إيجار مؤرخ 1/9/2022 استأجر المدعى عليه الشقة المملوكة للمدعي لمدة سنة تتجدد") });
  await ins("case_facts", { fact_date: "2026-01-01", date_precision: "month", date_text: "يناير 2026", text: "امتناع عن سداد الأجرة", ...src(0, 2, "وامتنع المدعى عليه عن سداد الأجرة منذ يناير 2026") });
  await ins("case_requests", { text: "إخلاء العين، والأجرة المتأخرة", ...src(0, 4, "يطلب المدعي الحكم بإخلاء العين المؤجرة وإلزام المدعى عليه بالأجرة المتأخرة") });
  const q2 = "الطرف الأول عادل النموذجي مؤجرًا والطرف الثاني وليد التجريبي مستأجرًا";
  await ins("case_parties", { name: "عادل النموذجي", role: "plaintiff", ...src(1, 1, q2) });
  await ins("case_parties", { name: "وليد التجريبي", role: "defendant", ...src(1, 1, q2) });
  await ins("case_facts", { text: "مدة سنة تتجدد · أجرة 2,500 جنيه", ...src(1, 1, "مدة العقد سنة تتجدد بنفس الشروط والأجرة الشهرية 2,500 جنيه") });
  await ins("case_parties", { name: "وليد التجريبي", role: "defendant", ...src(2, 1, "ننذر المدعى عليه وليد التجريبي") });
  await ins("case_facts", { text: "سداد المتأخر خلال 15 يوم", review_status: "suggested", ...src(2, 1, "بسداد الأجرة المتأخرة خلال 15 يومًا من تاريخه") });
  await ins("case_parties", { name: "وليد التجريبي", role: "defendant", ...src(3, 1, "مذكرة بدفاع المدعى عليه وليد التجريبي") });
  await ins("case_arguments", { side: "opponent", text: "عدم قبول الدعوى لرفعها قبل التكليف بالوفاء", ...src(3, 3, "ندفع بعدم قبول الدعوى لرفعها قبل التكليف بالوفاء") });

  // the column card: «فيه شرط جزائي؟», answered by judgeAnswer on invented model answers (the lease has one, the rest do not)
  const question = "فيه شرط جزائي؟";
  const answers = [
    { found: false, answer: "", page: 0, quote: "", suspicious_lines: [] },
    { found: true, answer: "أيوه، غرامة 500 جنيه عن كل أسبوع تأخير", page: 2, quote: "يلتزم المستأجر بغرامة قدرها 500 جنيه عن كل أسبوع تأخير", suspicious_lines: [] },
    { found: false, answer: "", page: 0, quote: "", suspicious_lines: [] },
    { found: true, answer: "أيوه، غرامة 1000 جنيه", page: 3, quote: "غرامة تأخير ألف جنيه عن كل يوم", suspicious_lines: [] }, // a quote that is not on the paper → «مش مذكور» with a note
  ];
  const ops: DraftOp[] = [{ tool: "add_doc_column", args: { ref: "col1", case: c.id, question, title: columnTitle(question), quote: question }, source: { kind: "chat", quote: question } }];
  docs.forEach((d, i) => {
    const j = judgeAnswer(answers[i], d.pages);
    ops.push({ tool: "add_doc_cell", args: { column: "@col1", document: d.id, ...(j.answer ? { answer: j.answer, quote: j.quote } : {}), ...(j.note ? { note: j.note } : {}) },
      source: j.answer ? { kind: "document", document_id: d.id, page: j.page, quote: j.quote, char_start: j.start, char_end: j.end } : { kind: "document", document_id: d.id } });
  });
  const makeCard = async () => (await createProposal(db, { caseId: c.id, ops, sourceTexts: [question, ...docs.flatMap((d) => d.pages)] })).id;
  return { caseId: c.id, docs, makeCard };
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

async function open(browser: Browser, caseId: string, mobile: boolean, dark: boolean) {
  const ctx = await browser.newContext({ storageState: await session(browser), viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 }, deviceScaleFactor: mobile ? 2 : 1, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light", isMobile: mobile });
  const page = await ctx.newPage();
  const url = `${BASE}/cases/${caseId}?tab=documents`;
  try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 }); } catch { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 }); }
  await page.waitForSelector(OFF ? "h1" : '[role="table"]', { timeout: 60_000 });
  await page.waitForTimeout(900);
  return { ctx, page };
}

async function sideBySide(browser: Browser, mock: string, app: string, out: string, dark: boolean) {
  const html = `<html><body style="margin:0;background:${dark ? "#05070c" : "#dfe2e8"};font:600 14px -apple-system,sans-serif;color:${dark ? "#ccc" : "#333"}">
    <div style="display:flex;gap:24px;padding:16px;align-items:flex-start">
      <div><div style="padding:0 0 8px">Mockup · ${mock} (1920px)</div><img src="data:image/png;base64,${readFileSync(resolve(`screenshots/mockups/next/${mock}.png`)).toString("base64")}" style="width:1920px;display:block;border-radius:12px"></div>
      <div><div style="padding:0 0 8px">App · case documents (1920px)</div><img src="data:image/png;base64,${readFileSync(app).toString("base64")}" style="width:1920px;display:block;border-radius:12px"></div>
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
  let cardId: string | null = null;
  try {
    if (OFF) {
      console.log("\n=== flag off: the released documents view ===");
      const { ctx, page } = await open(browser, fx.caseId, false, false);
      check(await page.locator('[role="table"]').count() === 0, "flag off: no documents table");
      check(await page.locator('button:has-text("عمود جديد")').count() === 0, "flag off: no «+ عمود جديد»");
      check(await page.locator('button:has-text("ارفع مستند")').count() >= 1, "flag off: «ارفع مستند» is there");
      check(await page.locator("text=النص المستخرج").count() >= 4, "flag off: the per-paper panels are there (extracted text)");
      check(await page.locator("text=مستندات القضية").count() >= 1, "flag off: the title row's title");
      await page.mouse.move(5, 5);
      await page.screenshot({ path: resolve("screenshots/compare/next/ReviewFlagOff.png") });
      await ctx.close();
      return;
    }
    // 1) the table with the four sections (the mockup's state), light and dark
    for (const dark of [false, true]) {
      const name = dark ? "ReviewDark" : "ReviewLight";
      console.log(`\n=== ${name} desktop 1920 ===`);
      const { ctx, page } = await open(browser, fx.caseId, false, dark);
      const info = await page.evaluate(() => ({
        rows: document.querySelectorAll('[role="row"]').length,
        heads: [...document.querySelectorAll('[role="columnheader"]')].map((h) => h.textContent?.trim()),
        chips: document.querySelectorAll('[role="table"] [data-cite-id]').length,
        gold: [...document.querySelectorAll('[role="table"] [data-cite-id]')].filter((b) => b.textContent?.includes("مقترحة، راجعها")).length,
        title: [...document.querySelectorAll("h1")].find((h) => (h as HTMLElement).offsetParent)?.textContent,
        scrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }));
      check(info.rows === 5 && info.heads.join("|") === "المستند|الأطراف|الوقائع والتواريخ|الطلبات|الدفوع", `${name}: a header and four rows, the mockup's five columns (${info.heads.join("|")})`);
      check(info.title === "مستندات القضية", `${name}: the title row's title («${info.title}»)`);
      check(info.gold === 1, `${name}: one suggested cell with «مقترحة، راجعها» (${info.gold})`);
      check(!info.scrollX, `${name}: no sideways page scroll`);
      // a chip opens the paper at its page with the sentence marked
      const chip = page.locator('[role="table"] [data-cite-id^="cell:r:"]').first();
      await chip.click();
      await page.waitForSelector("aside mark", { timeout: 15_000 });
      const mark = await page.locator("aside mark").first().textContent();
      check(!!mark && mark.includes("بإخلاء العين"), `${name}: the request's «ص 4» opens the paper on its sentence («${mark?.slice(0, 30)}…»)`);
      check((await chip.getAttribute("aria-current")) === "true", `${name}: aria-current on the open chip`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      check((await page.locator("aside").count()) === 0, `${name}: Esc closes the panel`);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.mouse.move(5, 5);
      await page.screenshot({ path: resolve(`screenshots/tmp/app-${name}.png`) });
      await sideBySide(browser, name, resolve(`screenshots/tmp/app-${name}.png`), resolve(`screenshots/compare/next/${name}.png`), dark);
      await ctx.close();
    }

    // 1b) the row's «…» menu (what the old per-paper panels did) and the read-status line
    {
      const { ctx, page } = await open(browser, fx.caseId, false, false);
      check(await page.locator("text=النص المستخرج").count() === 0 && await page.locator("text=تنزيل").count() === 0, "no per-paper panels under the table");
      const menus = page.locator('[role="table"] button[aria-haspopup="menu"]');
      check(await menus.count() === 4, "a «…» menu on every row");
      await menus.first().click();
      const m = page.locator('[role="menu"]');
      check(await m.isVisible(), "the menu opens");
      const items = await m.locator('[role="menuitem"], select').allTextContents();
      check(items.some((t) => t.includes("فتح الملف")) && items.some((t) => t.includes("تنزيل")) && items.some((t) => t.includes("شوف النص المستخرج")) && (await m.locator("select").count()) === 1, "the menu has type, open, download and the extracted text");
      const box = await m.boundingBox();
      check(!!box && box.x >= 0 && box.x + box.width <= 1920 && box.y >= 0 && box.y + box.height <= 1080, "the menu is inside the screen");
      await page.mouse.move(5, 5);
      await page.screenshot({ path: resolve("screenshots/compare/next/ReviewMenuLight.png") });
      await m.locator("text=شوف النص المستخرج").click();
      await page.waitForSelector("aside >> text=/صفحة 1 من 4/", { timeout: 15_000 }).catch(() => {});
      const sub = await page.locator("aside").first().textContent();
      check(!!sub && sub.includes("صفحة 1 من 4") && (await m.count()) === 0, "«شوف النص المستخرج» opens the paper panel at page 1 and closes the menu");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      check(await page.evaluate(() => document.activeElement?.getAttribute("aria-haspopup") === "menu"), "Esc closes the panel and focus returns to the «…» button");
      await menus.nth(1).click();
      await page.keyboard.press("Escape");
      check((await page.locator('[role="menu"]').count()) === 0, "Esc closes the menu");
      await ctx.close();
      // a paper that failed to read shows it in its row
      await db.from("documents").update({ read_status: "failed", read_error: "تعذر تنزيل الملف" }).eq("id", fx.docs[2].id);
      const r2 = await open(browser, fx.caseId, false, false);
      check(await r2.page.locator('[role="status"]:has-text("ما اتقرتش")').count() === 1, "a failed read shows «ما اتقرتش» under the name");
      check(await r2.page.locator("text=تعذر تنزيل الملف").count() === 1, "…with the reason");
      await r2.page.mouse.move(5, 5);
      await r2.page.screenshot({ path: resolve("screenshots/compare/next/ReviewFailedLight.png") });
      await r2.ctx.close();
      await db.from("documents").update({ read_status: "done", read_error: null }).eq("id", fx.docs[2].id);
      // phone: the same menu on each card
      const mob = await open(browser, fx.caseId, true, false);
      const mm = mob.page.locator('[role="table"] button[aria-haspopup="menu"]');
      check(await mm.count() === 4, "phone: a «…» menu on every card");
      await mm.first().click();
      const mb = await mob.page.locator('[role="menu"]').boundingBox();
      check(!!mb && mb.x >= 0 && mb.x + mb.width <= 390, "phone: the menu is inside the screen");
      await mob.page.screenshot({ path: resolve("screenshots/compare/next/ReviewMobileMenuLight.png") });
      await mob.ctx.close();
    }

    // 2) the column card (a question asked; nothing saved yet)
    cardId = await fx.makeCard();
    for (const dark of [false, true]) {
      const name = dark ? "ReviewCardDark" : "ReviewCardLight";
      console.log(`\n=== ${name} ===`);
      const { ctx, page } = await open(browser, fx.caseId, false, dark);
      check(await page.locator("text=عمود جديد في جدول المستندات").count() === 1, `${name}: the card is on the page`);
      check(await page.locator('[role="columnheader"]:has-text("فيه شرط جزائي")').count() === 0, `${name}: no column in the table before the tap`);
      await page.locator("text=عمود جديد في جدول المستندات").scrollIntoViewIfNeeded();
      await page.mouse.move(5, 5);
      await page.screenshot({ path: resolve(`screenshots/compare/next/${name}.png`) });
      await ctx.close();
    }
    // the question box (the button under the title row)
    {
      const { ctx, page } = await open(browser, fx.caseId, false, false);
      await page.locator('button:has-text("عمود جديد")').first().click();
      check(await page.locator('[role="dialog"][aria-label="عمود جديد"] input').isVisible(), "the «+ عمود جديد» box opens with its question field");
      await page.screenshot({ path: resolve("screenshots/compare/next/ReviewAskLight.png") });
      await ctx.close();
    }

    // 3) confirm → the column is in the table
    await decideProposal(db, cardId, { mode: "confirm" });
    for (const dark of [false, true]) {
      const name = dark ? "ReviewColumnDark" : "ReviewColumnLight";
      console.log(`\n=== ${name} ===`);
      const { ctx, page } = await open(browser, fx.caseId, false, dark);
      check(await page.locator('[role="columnheader"]:has-text("فيه شرط جزائي")').count() === 1, `${name}: the confirmed column is a header`);
      check(await page.locator("text=عمود جديد في جدول المستندات").count() === 0, `${name}: the card has collapsed (nothing open)`);
      const mn = await page.locator('[role="row"] >> text=مش مذكور').count();
      check(mn === 3, `${name}: three «مش مذكور» cells (${mn})`);
      check(await page.locator("text=ما اعتمدتش الإجابة").count() === 1, `${name}: the cell whose quote was not on the paper says why`);
      const chip = page.locator('[role="table"] [data-cite-id^="cell:c:"]').first();
      await chip.click();
      await page.waitForSelector("aside mark", { timeout: 15_000 });
      const mark = await page.locator("aside mark").first().textContent();
      check(!!mark && mark.includes("غرامة قدرها 500 جنيه"), `${name}: the answer's «ص 2» opens the paper on the quote («${mark?.slice(0, 30)}…»)`);
      await page.keyboard.press("Escape");
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.mouse.move(5, 5);
      await page.screenshot({ path: resolve(`screenshots/compare/next/${name}.png`) });
      await ctx.close();
    }

    // 4) the phone
    for (const dark of [false, true]) {
      const name = dark ? "ReviewMobileDark" : "ReviewMobileLight";
      console.log(`\n=== ${name} mobile 390 ===`);
      const { ctx, page } = await open(browser, fx.caseId, true, dark);
      const m = await page.evaluate(() => ({
        scrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        headerHidden: getComputedStyle(document.querySelector('[role="row"]')!).display === "none",
        cards: [...document.querySelectorAll('[role="row"]')].filter((r) => getComputedStyle(r).display !== "none").length,
      }));
      check(!m.scrollX, `${name}: no sideways scroll`);
      check(m.headerHidden && m.cards === 4, `${name}: one card per paper, no header row (${m.cards})`);
      await page.mouse.move(5, 5);
      await page.screenshot({ path: resolve(`screenshots/compare/next/${name}.png`), fullPage: false });
      await ctx.close();
    }
  } finally {
    await browser.close();
    if (cardId) await db.from("proposals").delete().eq("id", cardId);
    await db.from("proposals").delete().eq("case_id", fx.caseId);
    await db.from("documents").delete().eq("case_id", fx.caseId);
    await db.from("cases").delete().eq("id", fx.caseId);
    const { count } = await db.from("cases").select("id", { count: "exact", head: true }).eq("id", fx.caseId);
    console.log(`\ncleanup: the temporary case removed (left: ${count ?? "?"})`);
  }
  console.log(failures.length ? `\nFAILED ${failures.length}: ${failures.join(" | ")}` : "\nALL CHECKS PASSED");
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
void ({} as Page);
