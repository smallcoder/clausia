// Screenshots + checks of «المكتبة» (PR 6 of the restructure) → screenshots/library/. READ ONLY: no model call, no database write.
//   REAL pages:
//     library-<1920|1440>-<t>, m-library-390-<t>              the library (the 6 base templates)
//     filter-<1920|1440>-<t>, m-filter-390-<t>                 a category chip picked («استئناف ونقض»)
//     search-1920-<t>, laws-1920-<t>                           the search («مذكرة»); the second tab («قريباً»)
//     dialog-use-1920-<t>, m-dialog-use-390-<t>                «استخدمها في قضية» (opened, nothing chosen)
//     memos-empty-1920-<t>, m-memos-empty-390-<t>              a real case's «المذكرات والأحكام» (the demo case has no draft)
//   MOCKED render (`--preview`, needs the TEMPORARY pages src/app/(app)/zz-preview-library and zz-preview-case that are NOT committed: they render the
//   components with the REAL fill of a real demo case (read-only through RLS); the «saved» state and the draft rows are mocked, nothing is written):
//     fill-card-<pending|asked|saved>-<t>, m-fill-card-390-<t>   the fill card in the chat
//     memos-drafts-<1920|1440>-<t>, m-memos-drafts-390-<t>        a draft listed in the case's «المذكرات والأحكام»
//     draft-<1920|1440>-<t>, m-draft-390-<t>, draft-asked-1920-<t>   the draft, read only
//     compare-library-1920-<t>                                   the mockup (docs/design/ia/IALibrary*, rendered to mockups/) next to the build
// Checks (printed): no horizontal scroll at 390 / 1280 / 1440 / 1920, AA contrast of the text on the page, the dialog and the cards.
// Needs the app running and the mockups rendered (npx tsx scripts/mockup-shots-ia.ts screenshots/library/mockups Library).
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/library-shots.ts [baseUrl] [--preview]
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.argv.slice(2).find((a) => a.startsWith("http")) ?? "http://localhost:3107";
const PREVIEW = process.argv.includes("--preview");
const OUT = "screenshots/library";
mkdirSync(OUT, { recursive: true });
// a real demo case (the preview pages read it through RLS too): سامح التجريبي, one judgment, three facts
const CASE = "72071d66-4ab3-4682-9c3d-1ff65cdc2369";

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

async function ctxOf(w: number, h: number, dark: boolean): Promise<[BrowserContext, Page, string[]]> {
  const touch = w < 600;
  const ctx = await browser.newContext({ storageState: state, viewport: { width: w, height: h }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light" });
  await ctx.addInitScript((d) => { try { localStorage.setItem("clausia-theme", d ? "dark" : "light"); } catch { /* none */ } }, dark);
  const page = await ctx.newPage();
  const writes: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST") writes.push(r.url()); });
  await page.addInitScript(() => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s)); });
  return [ctx, page, writes];
}
async function go(page: Page, path: string, sel = "main#page h1") {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 120_000 });
  await page.waitForSelector(sel, { timeout: 60_000 }).catch(() => null);
  await page.waitForTimeout(1800);
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` });
const theme = (d: boolean) => (d ? "dark" : "light");
const problems: string[] = [];

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
  const style = await page.addStyleTag({ content: `${root} *, ${root} *::before { color: transparent !important; text-shadow: none !important; }` });
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
    // ---- REAL pages ----
    for (const [w, h] of [[1920, 1080], [1440, 900]] as const) {
      const [ctx, page] = await ctxOf(w, h, dark);
      await go(page, "/library");
      await shot(page, `library-${w}-${t}`);
      await contrast(page, "main#page", `library ${w} ${t}`);
      await noScroll(page, `library ${w} ${t}`);
      await page.getByRole("button", { name: /^استئناف ونقض/ }).click();
      await page.waitForTimeout(300);
      await shot(page, `filter-${w}-${t}`);
      await contrast(page, "main#page", `filter ${w} ${t}`);
      await ctx.close();
    }
    {
      const [ctx, page] = await ctxOf(390, 844, dark);
      await go(page, "/library");
      await shot(page, `m-library-390-${t}`);
      await contrast(page, "main#page", `m-library 390 ${t}`);
      await noScroll(page, `m-library 390 ${t}`);
      await page.getByRole("button", { name: /^استئناف ونقض/ }).click();
      await page.waitForTimeout(300);
      await shot(page, `m-filter-390-${t}`);
      await ctx.close();
    }
    for (const w of [1280]) {
      const [ctx, page] = await ctxOf(w, 800, dark);
      await go(page, "/library");
      await noScroll(page, `library ${w} ${t}`);
      await ctx.close();
    }
    {
      const [ctx, page] = await ctxOf(1920, 1080, dark);
      await go(page, "/library");
      await page.getByRole("searchbox", { name: "دوّر في الصيغ" }).fill("مذكرة");
      await page.waitForTimeout(300);
      await shot(page, `search-1920-${t}`);
      await page.getByRole("tab", { name: /التشريعات والأحكام/ }).click();
      await page.waitForTimeout(300);
      await shot(page, `laws-1920-${t}`);
      await contrast(page, "main#page", `laws 1920 ${t}`);
      await ctx.close();
    }
    {
      const [ctx, page, writes] = await ctxOf(1920, 1080, dark);
      await go(page, "/library");
      const base = writes.length;
      await page.getByRole("button", { name: /^استخدم صحيفة استئناف في قضية/ }).click();
      await page.waitForSelector("dialog[open]");
      await page.waitForTimeout(400);
      await shot(page, `dialog-use-1920-${t}`);
      await contrast(page, "dialog[open]", `use dialog 1920 ${t}`);
      await page.keyboard.press("Escape");
      if (writes.length > base) problems.push(`the use dialog made a POST while only being opened (${writes.slice(base).join(", ")})`);
      else console.log("the use dialog only opened: no POST after the page loaded");
      await ctx.close();
    }
    {
      const [ctx, page] = await ctxOf(390, 844, dark);
      await go(page, "/library");
      await page.getByRole("button", { name: /^استخدم صحيفة استئناف في قضية/ }).click();
      await page.waitForSelector("dialog[open]");
      await page.waitForTimeout(400);
      await shot(page, `m-dialog-use-390-${t}`);
      await contrast(page, "dialog[open]", `m-use dialog 390 ${t}`);
      await ctx.close();
    }
    for (const [w, h] of [[1920, 1080], [1440, 900]] as const) {
      const [ctx, page] = await ctxOf(w, h, dark);
      await go(page, `/cases/${CASE}?tab=memos`, "main#page");
      if (w === 1920) { await shot(page, `memos-empty-1920-${t}`); await contrast(page, "main#page", `memos-empty ${w} ${t}`); }
      await noScroll(page, `memos-empty ${w} ${t}`);
      await ctx.close();
    }
    {
      const [ctx, page] = await ctxOf(390, 844, dark);
      await go(page, `/cases/${CASE}?tab=memos&sheet=1`, "main#page");
      await shot(page, `m-memos-empty-390-${t}`);
      await noScroll(page, `m-memos-empty 390 ${t}`);
      await ctx.close();
    }

    if (!PREVIEW) continue;
    // ---- MOCKED render ----
    {
      const [ctx, page] = await ctxOf(1920, 2600, dark);
      await go(page, "/zz-preview-library", "[data-cards]");
      for (const id of ["pending", "asked", "saved"]) await page.locator(`#card-${id}`).screenshot({ path: `${OUT}/fill-card-${id}-${t}.png` });
      await contrast(page, "[data-cards]", `fill cards 1920 ${t}`);
      await ctx.close();
    }
    {
      const [ctx, page] = await ctxOf(390, 2600, dark);
      await go(page, "/zz-preview-library", "[data-cards]");
      await page.locator("#card-pending").screenshot({ path: `${OUT}/m-fill-card-390-${t}.png` });
      await contrast(page, "[data-cards]", `m-fill cards 390 ${t}`);
      await noScroll(page, `m-fill cards 390 ${t}`);
      await ctx.close();
    }
    for (const [w, h] of [[1920, 1080], [1440, 900]] as const) {
      const [ctx, page] = await ctxOf(w, h, dark);
      await go(page, "/zz-preview-case", "main#page");
      await shot(page, `memos-drafts-${w}-${t}`);
      await contrast(page, "main#page", `memos-drafts ${w} ${t}`);
      await noScroll(page, `memos-drafts ${w} ${t}`);
      await ctx.close();
      const [c2, p2] = await ctxOf(w, 1400, dark);
      await go(p2, "/zz-preview-case?draft=1", "main#page");
      await shot(p2, `draft-${w}-${t}`);
      await contrast(p2, "main#page", `draft ${w} ${t}`);
      await noScroll(p2, `draft ${w} ${t}`);
      if (w === 1920) {
        await go(p2, "/zz-preview-case?draft=1&asked=1", "main#page");
        await shot(p2, `draft-asked-1920-${t}`);
        await contrast(p2, "main#page", `draft-asked ${w} ${t}`);
      }
      await c2.close();
    }
    {
      const [ctx, page] = await ctxOf(390, 844, dark);
      await go(page, "/zz-preview-case?sheet=1", "main#page");
      await shot(page, `m-memos-drafts-390-${t}`);
      await noScroll(page, `m-memos-drafts 390 ${t}`);
      await go(page, "/zz-preview-case?draft=1&sheet=1", "main#page");
      await shot(page, `m-draft-390-${t}`);
      await contrast(page, "main#page", `m-draft 390 ${t}`);
      await noScroll(page, `m-draft 390 ${t}`);
      await ctx.close();
    }
    for (const w of [1280]) {
      const [ctx, page] = await ctxOf(w, 900, dark);
      await go(page, "/zz-preview-case?draft=1", "main#page");
      await noScroll(page, `draft ${w} ${t}`);
      await ctx.close();
    }
    // mockup next to the build (the mockup is 1920 × 1080)
    {
      const [ctx, page] = await ctxOf(3840, 1080, dark);
      const mock = readFileSync(resolve(OUT, "mockups", `IALibrary${dark ? "Dark" : "Light"}.png`)).toString("base64");
      const build = readFileSync(resolve(OUT, `library-1920-${t}.png`)).toString("base64");
      await page.setContent(`<body style="margin:0;display:flex;direction:ltr"><div><img style="display:block" src="data:image/png;base64,${mock}"></div><div><img style="display:block" src="data:image/png;base64,${build}"></div></body>`);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/compare-library-1920-${t}.png` });
      await ctx.close();
    }
  }
  console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n- ${problems.join("\n- ")}` : "\nno problems");
  process.exitCode = problems.length ? 1 : 0;
} finally {
  await browser.close();
}
