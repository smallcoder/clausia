// Screenshots + checks of the draft editor (PR 7 of the restructure) → screenshots/draft-editor/. The three main pages, each at 1440, 1920 and 390, light and dark.
// READ ONLY: no model call, no database write. ALL THREE are MOCKED renders: the shared database has no draft, and the shots must not write one. They are
// the REAL components (DraftEditor, its tracked changes, its history panel) on the preview page src/app/(app)/zz-preview-draft (development only: it 404s in
// production), with the demo case's chat beside it (src/app/(app)/@chat/zz-preview-draft). The page needs a dev server (`next dev -p <port>`), not a build.
//     editor-<1920|1440>-<t>, m-editor-390-<t>          the editor with a draft: the office paper, a quotation box, blanks, bold, the lawyer sections
//     tracked-<1920|1440>-<t>, m-tracked-390-<t>        the same draft with tracked changes: old words struck through (light red), new words in gold, ✓ / ×, a cited article
//     versions-<1920|1440>-<t>, m-versions-390-<t>      the version history open («النسخ»)
// Checks (printed): no horizontal scroll at each width; AA contrast of the text on the page; the editor really shows what the shot is named for.
// The mockup (docs/design/ia/IADraft*) can be rendered next to these: npx tsx scripts/mockup-shots-ia.ts screenshots/draft-editor/mockups IADraft
// Run: npx tsx --env-file=.env.local scripts/draft-editor-shots.ts <port>        (e.g. 3207; never 3000: that is the owner's dev server)
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const port = process.argv.slice(2).find((a) => /^\d{4,5}$/.test(a));
if (!port) { console.error("usage: npx tsx --env-file=.env.local scripts/draft-editor-shots.ts <port>"); process.exit(2); }
if (port === "3000") { console.error("port 3000 is the owner's dev server: use another port"); process.exit(2); }
const BASE = `http://localhost:${port}`;
const OUT = "screenshots/draft-editor";
mkdirSync(OUT, { recursive: true });

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
  const touch = w < 600;
  const ctx = await browser.newContext({ storageState: state, viewport: { width: w, height: h }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light" });
  await ctx.addInitScript((d) => { try { localStorage.setItem("clausia-theme", d ? "dark" : "light"); } catch { /* none */ } }, dark);
  const page = await ctx.newPage();
  await page.addInitScript(() => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s)); });
  return [ctx, page];
}
async function go(page: Page, query: string) {
  await page.goto(`${BASE}/zz-preview-draft${query}`, { waitUntil: "load", timeout: 120_000 });
  await page.waitForSelector("[data-block-id]", { timeout: 60_000 });
  await page.waitForTimeout(1800);
}
const problems: string[] = [];
const theme = (d: boolean) => (d ? "dark" : "light");

async function noScroll(page: Page, tag: string) {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  const inner = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("main#page, main#page *")].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === "visible" && e.getBoundingClientRect().right > window.innerWidth + 1).length);
  if (sw > iw || inner) problems.push(`horizontal scroll ${tag}: page ${sw} > ${iw}, ${inner} wide element(s)`);
  else console.log(`no horizontal scroll ${tag} (${iw}px)`);
}

// ---- contrast: the text colour against the pixels behind it (the text is made transparent, the page shot again, the median colour under each text box) ----
const lum = (c: number[]) => { const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
async function contrast(page: Page, root: string, tag: string) {
  const items = await page.evaluate((sel) => {
    const el0 = document.querySelector(sel);
    if (!el0) return [];
    const out: { text: string; x: number; y: number; w: number; h: number; color: number[]; size: number; weight: number }[] = [];
    const g = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    el0.querySelectorAll("*").forEach((el) => {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent!.trim()).map((n) => n.textContent!.trim()).join(" ");
      if (!own) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width < 2 || r.height < 2 || cs.visibility === "hidden" || cs.display === "none" || el.closest(".sr-only") || el.closest("button:disabled") || (el.closest("[aria-hidden='true']") && !el.closest("[role='dialog']"))) return;
      if (r.top < 0 || r.bottom > window.innerHeight || r.left < 0 || r.right > window.innerWidth) return;
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (!top || !el.contains(top)) return;
      out.push({ text: own.slice(0, 28), x: r.x, y: r.y, w: r.width, h: r.height, color: ((): number[] => { g.canvas.width = g.canvas.height = 1; g.clearRect(0, 0, 1, 1); g.fillStyle = cs.color; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; })(), size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight) });
    });
    return out;
  }, root);
  if (!items.length) return;
  const style = await page.addStyleTag({ content: `${root} *, ${root} *::before { color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important; }` });
  const buf = await page.screenshot();
  await style.evaluate((n) => (n as Element).remove());
  const data = await page.evaluate(async ({ b64, rects }) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const k = img.naturalWidth / window.innerWidth;
    const cv = document.createElement("canvas"); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const g = cv.getContext("2d")!; g.drawImage(img, 0, 0);
    return rects.map((r) => {
      const d = g.getImageData(Math.max(0, Math.round(r.x * k)), Math.max(0, Math.round(r.y * k)), Math.max(1, Math.round(r.w * k)), Math.max(1, Math.round(r.h * k))).data;
      const ch: number[][] = [[], [], []];
      for (let i = 0; i < d.length; i += 4) { ch[0].push(d[i]); ch[1].push(d[i + 1]); ch[2].push(d[i + 2]); }
      return ch.map((a) => { a.sort((m, n) => m - n); return a[Math.floor(a.length / 2)]; });
    });
  }, { b64: buf.toString("base64"), rects: items });
  let worst = 99;
  items.forEach((it, i) => {
    const bg = data[i];
    const a = it.color[3] ?? 1;
    const fg = [0, 1, 2].map((j) => Math.round(it.color[j] * a + bg[j] * (1 - a)));
    const large = it.size >= 24 || (it.size >= 18.66 && it.weight >= 700);
    const r = ratio(fg, bg);
    worst = Math.min(worst, r);
    if (r < (large ? 3 : 4.5)) problems.push(`contrast ${tag}: «${it.text}» ${r.toFixed(2)}:1 (${it.size}px, text ${fg}, behind ${bg})`);
  });
  console.log(`contrast ${tag}: ${items.length} texts, lowest ${worst.toFixed(2)}:1`);
}

try {
  for (const dark of [false, true]) {
    const t = theme(dark);
    for (const [w, h] of [[1920, 1080], [1440, 900], [390, 844]] as const) {
      const m = w < 600 ? "m-" : "";
      const tag = `${w} ${t}`;

      // 1) the editor with a draft
      {
        const [ctx, page] = await ctxOf(w, h, dark);
        await go(page, "");
        const blocks = await page.locator("[data-block-id]").count();
        if (blocks < 5) problems.push(`editor ${tag}: only ${blocks} editable blocks`);
        if (!(await page.locator("article figure blockquote, article [data-lock]").count()) || !(await page.locator("[data-ph]").count())) problems.push(`editor ${tag}: the quotation or the blanks are missing`);
        await page.screenshot({ path: `${OUT}/${m}editor-${w}-${t}.png` });
        await contrast(page, "main#page", `editor ${tag}`);
        await noScroll(page, `editor ${tag}`);
        await ctx.close();
      }

      // 2) the editor with tracked changes: old struck through, new in gold, ✓ / ×
      {
        const [ctx, page] = await ctxOf(w, h, dark);
        await go(page, "?changes=1");
        const ticks = await page.getByRole("button", { name: /^اقبل التعديل/ }).count();
        const crosses = await page.getByRole("button", { name: /^ارفض التعديل/ }).count();
        if (ticks !== 3 || crosses !== 3) problems.push(`tracked ${tag}: expected 3 ✓ and 3 × (got ${ticks}, ${crosses})`);
        if (!(await page.locator("article .line-through").count())) problems.push(`tracked ${tag}: no struck-through old words`);
        await page.getByRole("button", { name: "اقبل الكل" }).scrollIntoViewIfNeeded();
        // the changes are in the lawyer section: bring the first one into view for the shot
        await page.locator("article .line-through").first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${OUT}/${m}tracked-${w}-${t}.png` });
        await contrast(page, "main#page", `tracked ${tag}`);
        await noScroll(page, `tracked ${tag}`);
        await ctx.close();
      }

      // 3) the version history open
      {
        const [ctx, page] = await ctxOf(w, h, dark);
        await go(page, "?versions=1");
        await page.getByRole("button", { name: "النسخ" }).click();
        await page.waitForSelector('section[aria-label="النسخ"]');
        const rows = await page.locator('section[aria-label="النسخ"] li').count();
        if (rows !== 5) problems.push(`versions ${tag}: expected 5 versions (got ${rows})`);
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${OUT}/${m}versions-${w}-${t}.png` });
        await contrast(page, "main#page", `versions ${tag}`);
        await noScroll(page, `versions ${tag}`);
        await ctx.close();
      }
    }
  }
  console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n- ${problems.join("\n- ")}` : "\nno problems");
  process.exitCode = problems.length ? 1 : 0;
} finally {
  await browser.close();
}
