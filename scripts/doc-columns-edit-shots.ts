// Issue #61 in the real browser (flag ON: the app started with NEXT_PUBLIC_FEATURE_DOCS_TABLE=1): the lawyer renames a saved
// column, edits a cell, confirms a suggested cell and removes a column (with the confirm step). Shots at 1440, light and dark:
//   screenshots/compare/next/ColumnMenu{Light,Dark}-1440.png      the column's «…» menu
//   screenshots/compare/next/ColumnRemove{Light,Dark}-1440.png    the remove confirm step
//   screenshots/compare/next/CellEdited{Light,Dark}-1440.png      an edited cell (the lawyer's wording, the paper's page)
// Fixture (free, no model): a temporary case with two invented papers, a confirmed column and a suggested column made from
// `judgeAnswer`; all removed at the end. Needs the app running.
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/doc-columns-edit-shots.ts [baseUrl]
import { chromium, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Database } from "@/lib/db/types";
import { columnTitle, judgeAnswer } from "@/lib/doc-columns/run";
import { createProposal, decideProposal, type DraftOp } from "@/lib/proposals";
import type { Db } from "@/lib/supabase/server";

const BASE = process.argv.find((a, i) => i >= 2 && a.startsWith("http")) ?? "http://localhost:4200";
mkdirSync("screenshots/compare/next", { recursive: true });
const failures: string[] = [];
const check = (ok: boolean, label: string) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failures.push(label); };

const PAPERS = [
  { title: "صحيفة الدعوى", type: "claim_sheet" as const, pages: ["صحيفة دعوى إخلاء\nأقامها المدعي عادل النموذجي ضد المدعى عليه وليد التجريبي.", "بموجب عقد إيجار مؤرخ 1/9/2022 استأجر المدعى عليه الشقة المملوكة للمدعي."] },
  { title: "عقد الإيجار", type: "contract" as const, pages: ["عقد إيجار\nمدة العقد سنة تتجدد بنفس الشروط والأجرة الشهرية 2,500 جنيه.", "وفي حالة التأخير في السداد يلتزم المستأجر بغرامة قدرها 500 جنيه عن كل أسبوع تأخير."] },
];

async function fixture(db: Db) {
  const { data: c, error } = await db.from("cases").insert({ title: "اختبار-تعديل-الأعمدة", case_number: "772", case_year: 2025, source_kind: "manual" }).select("id").single();
  if (error) throw new Error(error.message);
  const docs: { id: string; pages: string[] }[] = [];
  for (const p of PAPERS) {
    const { data: d, error: de } = await db.from("documents").insert({ case_id: c.id, storage_path: `test/${crypto.randomUUID()}/x.pdf`, file_name: `${p.title}.pdf`, title: p.title, mime_type: "application/pdf", size_bytes: 120_000, doc_type: p.type, read_status: "done", source_kind: "manual", page_count: p.pages.length }).select("id").single();
    if (de) throw new Error(de.message);
    const { error: pe } = await db.from("document_pages").insert(p.pages.map((text, i) => ({ document_id: d.id, page_no: i + 1, text })));
    if (pe) throw new Error(pe.message);
    docs.push({ id: d.id, pages: p.pages });
  }
  const column = async (question: string, answers: Parameters<typeof judgeAnswer>[0][], mode: "confirm" | "suggest") => {
    const ops: DraftOp[] = [{ tool: "add_doc_column", args: { ref: "col1", case: c.id, question, title: columnTitle(question), quote: question }, source: { kind: "chat", quote: question } }];
    docs.forEach((d, i) => {
      const j = judgeAnswer(answers[i], d.pages);
      ops.push({ tool: "add_doc_cell", args: { column: "@col1", document: d.id, ...(j.answer ? { answer: j.answer, quote: j.quote } : {}), ...(j.note ? { note: j.note } : {}) },
        source: j.answer ? { kind: "document", document_id: d.id, page: j.page, quote: j.quote, char_start: j.start, char_end: j.end } : { kind: "document", document_id: d.id } });
    });
    const p = await createProposal(db, { caseId: c.id, ops, sourceTexts: [question, ...docs.flatMap((d) => d.pages)] });
    await decideProposal(db, p.id, { mode });
  };
  const none = { found: false, answer: "", page: 0, quote: "", suspicious_lines: [] };
  await column("فيه شرط جزائي؟", [none, { found: true, answer: "أيوه، غرامة 500 جنيه عن كل أسبوع تأخير", page: 2, quote: "يلتزم المستأجر بغرامة قدرها 500 جنيه عن كل أسبوع تأخير", suspicious_lines: [] }], "confirm");
  await column("الأجرة الشهرية كام؟", [none, { found: true, answer: "الأجرة الشهرية 2,500 جنيه", page: 1, quote: "مدة العقد سنة تتجدد بنفس الشروط والأجرة الشهرية 2,500 جنيه", suspicious_lines: [] }], "suggest");
  return { caseId: c.id, docs };
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

async function open(browser: Browser, caseId: string, dark: boolean) {
  const ctx = await browser.newContext({ storageState: await session(browser), viewport: { width: 1440, height: 900 }, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light" });
  const page = await ctx.newPage();
  const url = `${BASE}/cases/${caseId}?tab=documents`;
  try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 }); } catch { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 }); }
  await page.waitForSelector('[role="table"]', { timeout: 60_000 });
  await page.waitForTimeout(900);
  return { ctx, page };
}

const head = (page: Page, text: string) => page.locator('[role="columnheader"]', { hasText: text });
const headMenu = (page: Page, text: string) => head(page, text).locator('button[aria-haspopup="menu"]');

async function main() {
  const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { error: ae } = await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
  if (ae) throw new Error(`sign-in: ${ae.message}`);
  const db = sb as unknown as Db;
  const fx = await fixture(db);
  const cols = async () => (await db.from("doc_columns").select("id, title, question").eq("case_id", fx.caseId).order("created_at")).data ?? [];
  const cellsOf = async (columnId: string) => (await db.from("doc_column_cells").select("id, document_id, answer, review_status, created_by_kind, source_page, source_quote").eq("column_id", columnId)).data ?? [];
  const browser = await chromium.launch();
  try {
    const [c1, c2] = await cols();
    check(!!c1 && !!c2, "start: two saved columns");

    console.log("\n=== functional (light) ===");
    {
      const { ctx, page } = await open(browser, fx.caseId, false);
      check(await page.locator('[role="columnheader"] button[aria-haspopup="menu"]').count() === 2, "a «…» menu on each custom column's header");
      check(await head(page, "الأجرة الشهرية").locator("text=مقترح").count() === 1, "the suggested column shows «مقترح»");

      // rename
      await headMenu(page, "فيه شرط جزائي").click();
      const items = await page.locator('[role="menu"] [role="menuitem"]').allTextContents();
      check(items.length === 2 && items[0].includes("غيّر الاسم") && items[1].includes("امسح العمود"), `the menu: «غيّر الاسم» and «امسح العمود» (${items.join(" | ")})`);
      await page.locator('[role="menuitem"]:has-text("غيّر الاسم")').click();
      const input = page.locator('input[aria-label="اسم العمود"]');
      check(await input.inputValue() === c1.title, "rename: the field starts with the current title");
      await input.fill("غرامة التأخير");
      await page.locator('[role="columnheader"] button:has-text("حفظ")').click();
      await head(page, "غرامة التأخير").waitFor({ timeout: 15_000 });
      check((await cols())[0].title === "غرامة التأخير" && (await cols())[0].question === c1.question, "rename: saved; the question stays");

      // edit a cell
      const answerCell = page.locator('[role="row"]', { hasText: "عقد الإيجار" }).locator('[role="cell"]').nth(5); // 0 paper, 1-4 sections, 5 first custom column
      await answerCell.locator('button:has-text("تعديل")').click();
      const ta = answerCell.locator("textarea");
      check((await ta.inputValue()).includes("غرامة 500 جنيه"), "edit: the field starts with the current answer");
      await ta.fill("غرامة 500 جنيه كل أسبوع تأخير (عدّلتها)");
      await answerCell.locator('button:has-text("حفظ")').click();
      await answerCell.locator("text=الصياغة بتاعتك").waitFor({ timeout: 15_000 });
      const edited = (await cellsOf(c1.id)).find((x) => x.document_id === fx.docs[1].id)!;
      check(edited.answer === "غرامة 500 جنيه كل أسبوع تأخير (عدّلتها)" && edited.created_by_kind === "lawyer" && edited.review_status === "confirmed" && edited.source_page === 2 && !!edited.source_quote, "edit: saved as the lawyer's, confirmed, the page and the quote are kept");
      check(await answerCell.locator('[data-cite-id^="cell:c:"]').count() === 1, "edit: the paper chip is still there");
      check(await page.locator('[role="row"]', { hasText: "صحيفة الدعوى" }).locator('[role="cell"]').nth(5).locator('button:has-text("تعديل")').count() === 0, "a «مش مذكور» cell has no edit");

      // confirm a suggested cell with one tap
      const sugCell = page.locator('[role="row"]', { hasText: "عقد الإيجار" }).locator('[role="cell"]').nth(6);
      check((await cellsOf(c2.id)).every((x) => x.review_status === "suggested"), "confirm: start, the second column's cells are suggested");
      await sugCell.locator('button:has-text("أكّد")').click();
      await sugCell.locator('button:has-text("أكّد")').waitFor({ state: "detached", timeout: 15_000 });
      const afterC = await cellsOf(c2.id);
      check(afterC.find((x) => x.document_id === fx.docs[1].id)?.review_status === "confirmed" && afterC.find((x) => x.document_id === fx.docs[0].id)?.review_status === "suggested", "confirm: one tap confirms that cell only");
      check(await sugCell.locator("text=مقترحة، راجعها").count() === 0, "confirm: the gold «مقترحة» mark is gone from it");
      await ctx.close();
    }

    for (const dark of [false, true]) {
      const t = dark ? "Dark" : "Light";
      console.log(`\n=== shots ${t} 1440 ===`);
      const { ctx, page } = await open(browser, fx.caseId, dark);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.screenshot({ path: resolve(`screenshots/compare/next/CellEdited${t}-1440.png`) });
      await headMenu(page, "غرامة التأخير").click();
      const m = page.locator('[role="menu"]');
      const box = await m.boundingBox();
      check(!!box && box.x >= 0 && box.x + box.width <= 1440 && box.y >= 0 && box.y + box.height <= 900, `${t}: the menu is inside the screen`);
      check(await page.locator('[role="menu"] [role="menuitem"]').evaluateAll((els) => els.every((e) => e.getBoundingClientRect().height >= 44)), `${t}: menu items are 44px or more`);
      await page.screenshot({ path: resolve(`screenshots/compare/next/ColumnMenu${t}-1440.png`) });
      await page.locator('[role="menuitem"]:has-text("امسح العمود")').click();
      const dlg = page.locator('[role="alertdialog"]');
      check((await dlg.textContent())?.includes("هيتمسح العمود وكل خاناته. متأكد؟") === true, `${t}: the confirm step says «هيتمسح العمود وكل خاناته. متأكد؟»`);
      check((await cols()).length === 2, `${t}: opening the confirm step deletes nothing`);
      await page.screenshot({ path: resolve(`screenshots/compare/next/ColumnRemove${t}-1440.png`) });
      await dlg.locator('button:has-text("إلغاء")').click();
      check((await dlg.count()) === 0 && (await cols()).length === 2, `${t}: «إلغاء» closes it and nothing is deleted`);
      await headMenu(page, "غرامة التأخير").click();
      await page.locator('[role="menuitem"]:has-text("امسح العمود")').click();
      await page.keyboard.press("Escape");
      check((await dlg.count()) === 0 && (await cols()).length === 2, `${t}: Esc closes the confirm step and nothing is deleted`);
      await ctx.close();
    }

    console.log("\n=== remove ===");
    {
      const { ctx, page } = await open(browser, fx.caseId, false);
      await headMenu(page, "غرامة التأخير").click();
      await page.locator('[role="menuitem"]:has-text("امسح العمود")').click();
      check((await cols()).length === 2 && (await cellsOf(c1.id)).length === 2, "a tap on «امسح العمود» alone deletes nothing");
      await page.locator('[role="alertdialog"] button:has-text("امسح")').click();
      await head(page, "غرامة التأخير").waitFor({ state: "detached", timeout: 15_000 });
      check((await cols()).length === 1 && (await cols())[0].id === c2.id, "after «امسح» the column is deleted");
      check((await cellsOf(c1.id)).length === 0, "…and its cells with it");
      check(await head(page, "الأجرة الشهرية").count() === 1, "…the other column stays");
      await ctx.close();
    }
  } finally {
    await browser.close();
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
