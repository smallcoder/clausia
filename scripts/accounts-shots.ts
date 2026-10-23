// Screenshots + checks of «الحسابات» (PR 5 of the restructure) → screenshots/accounts/. READ ONLY: no model call, no database write (the dialogs are only opened).
//   REAL pages (the demo office has no fees or movements, so these are the empty states):
//     tab-empty-<1920|1440>-<t>, m-tab-empty-390-<t>      the client's «الحسابات» tab
//     dialog-movement-1920-<t>, dialog-fee-1920-<t>, m-dialog-movement-390-<t>   «+ حركة» and «حدد الأتعاب», opened and never saved
//   MOCKED render (`--preview`, needs the TEMPORARY pages src/app/(app)/zz-preview and src/app/zz-preview-receipt that are NOT committed: they render the
//   components with the mockup's numbers and read nothing from the database):
//     tab-<1920|1440>-<t>, m-tab-390-<t>, card-<open|expense|fee|done|unclear>-<t>, m-card-open-390-<t>, receipt-<t>, receipt-print (+ .pdf)
//     compare-tab-1920-<t>                                the mockup (docs/design/ia/SBAcct*, rendered to mockups/) next to the build
// Checks (printed): no horizontal scroll at 390 / 1280 / 1440 / 1920, AA contrast of the text on the tab, the dialogs and the cards.
// Needs the app running and the mockups rendered (npx tsx scripts/mockup-shots-ia.ts screenshots/accounts/mockups SBAcct).
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/accounts-shots.ts [baseUrl] [--preview]
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.argv.slice(2).find((a) => a.startsWith("http")) ?? "http://localhost:3107";
const PREVIEW = process.argv.includes("--preview");
const OUT = "screenshots/accounts";
mkdirSync(OUT, { recursive: true });

// the demo client with the most cases (read through RLS as the demo user)
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const { data: cs } = await sb.from("cases").select("id, client_id").neq("review_status", "rejected");
const counts = new Map<string, number>();
for (const c of cs ?? []) if (c.client_id) counts.set(c.client_id, (counts.get(c.client_id) ?? 0) + 1);
const CLIENT = [...counts].sort((a, b) => b[1] - a[1])[0][0];

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
    // ---- REAL pages: the empty states ----
    for (const [w, h] of [[1920, 1080], [1440, 900]] as const) {
      const [ctx, page] = await ctxOf(w, h, dark);
      await go(page, `/clients/${CLIENT}?tab=accounts`);
      await shot(page, `tab-empty-${w}-${t}`);
      await contrast(page, "main#page", `real tab ${w} ${t}`);
      await noScroll(page, `real tab ${w} ${t}`);
      await ctx.close();
    }
    {
      const [ctx, page] = await ctxOf(390, 844, dark);
      await go(page, `/clients/${CLIENT}?tab=accounts`);
      await shot(page, `m-tab-empty-390-${t}`);
      await contrast(page, "main#page", `real m-tab 390 ${t}`);
      await noScroll(page, `real m-tab 390 ${t}`);
      await ctx.close();
    }
    for (const w of [1280]) {
      const [ctx, page] = await ctxOf(w, 800, dark);
      await go(page, `/clients/${CLIENT}?tab=accounts`);
      await noScroll(page, `real tab ${w} ${t}`);
      await ctx.close();
    }
    // the dialogs: opened, NEVER saved
    {
      const [ctx, page, writes] = await ctxOf(1920, 1080, dark);
      await go(page, `/clients/${CLIENT}?tab=accounts`);
      const base = writes.length;
      await page.getByRole("button", { name: "حركة" }).click();
      await page.waitForSelector("dialog[open]");
      await page.waitForTimeout(400);
      await page.fill('dialog[open] input[name="amount"]', "3000");
      await page.waitForTimeout(200);
      await shot(page, `dialog-movement-1920-${t}`);
      await contrast(page, "dialog[open]", `movement dialog 1920 ${t}`);
      await page.getByRole("radio", { name: "مصروف" }).click();
      await page.waitForTimeout(200);
      await shot(page, `dialog-expense-1920-${t}`);
      await page.keyboard.press("Escape");
      if (writes.length > base) problems.push(`the movement dialog made a POST while only being opened (${writes.slice(base).join(", ")})`);
      else console.log("the movement dialog only opened: no POST after the page loaded");
      await ctx.close();
    }
    {
      const [ctx, page] = await ctxOf(390, 844, dark);
      await go(page, `/clients/${CLIENT}?tab=accounts`);
      await page.getByRole("button", { name: "حركة" }).click();
      await page.waitForSelector("dialog[open]");
      await page.waitForTimeout(400);
      await shot(page, `m-dialog-movement-390-${t}`);
      await contrast(page, "dialog[open]", `m-movement dialog 390 ${t}`);
      await ctx.close();
    }
    {
      const [ctx, page, writes] = await ctxOf(1920, 1080, dark);
      await go(page, `/clients/${CLIENT}?tab=accounts`);
      const base = writes.length;
      const fee = page.getByRole("button", { name: /^حدد أتعاب/ }).first();
      if (await fee.count()) {
        await fee.click();
        await page.waitForSelector("dialog[open]");
        await page.waitForTimeout(400);
        await page.fill('dialog[open] input[name="amount"]', "15000");
        await shot(page, `dialog-fee-1920-${t}`);
        await contrast(page, "dialog[open]", `fee dialog 1920 ${t}`);
        if (writes.length > base) problems.push("the fee dialog made a POST while only being opened");
      }
      await ctx.close();
    }

    if (!PREVIEW) continue;
    // ---- MOCKED render: the tab with the mockup's numbers, the chat cards, the receipt ----
    for (const [w, h] of [[1920, 1080], [1440, 900]] as const) {
      const [ctx, page] = await ctxOf(w, h, dark);
      await go(page, "/zz-preview");
      await shot(page, `tab-${w}-${t}`);
      await contrast(page, "main#page", `tab ${w} ${t}`);
      await noScroll(page, `tab ${w} ${t}`);
      await ctx.close();
    }
    {
      const [ctx, page] = await ctxOf(1920, 2000, dark);
      await go(page, "/zz-preview");
      await page.locator("main#page").first().screenshot({ path: `${OUT}/tab-full-1920-${t}.png` });
      await ctx.close();
    }
    {
      const [ctx, page] = await ctxOf(390, 2100, dark);
      await go(page, "/zz-preview");
      await shot(page, `m-tab-390-${t}`);
      await contrast(page, "main#page", `m-tab 390 ${t}`);
      await noScroll(page, `m-tab 390 ${t}`);
      await ctx.close();
    }
    {
      const [ctx, page] = await ctxOf(1920, 2200, dark);
      await go(page, "/zz-preview?v=cards", "[data-cards]");
      for (const id of ["open", "expense", "fee", "done", "unclear"]) {
        await page.locator(`#card-${id}`).screenshot({ path: `${OUT}/card-${id}-${t}.png` });
      }
      await contrast(page, "[data-cards]", `cards 1920 ${t}`);
      await ctx.close();
    }
    {
      const [ctx, page] = await ctxOf(390, 1800, dark);
      await go(page, "/zz-preview?v=cards", "[data-cards]");
      await page.locator("#card-open").screenshot({ path: `${OUT}/m-card-open-390-${t}.png` });
      await contrast(page, "[data-cards]", `m-cards 390 ${t}`);
      await noScroll(page, `m-cards 390 ${t}`);
      await ctx.close();
    }
    {
      // «عدّل» open on the receipt card: the amount, the method, the date and the note as fields
      const [ctx, page] = await ctxOf(1920, 1400, dark);
      await go(page, "/zz-preview?v=cards", "[data-cards]");
      await page.locator("#card-open").getByRole("button", { name: "عدّل" }).click();
      await page.waitForTimeout(300);
      await page.locator("#card-open").screenshot({ path: `${OUT}/card-open-editing-${t}.png` });
      await ctx.close();
    }
    for (const w of [1280, 1440, 1920]) {
      const [ctx, page] = await ctxOf(w, 900, dark);
      await go(page, "/zz-preview", "main#page");
      await noScroll(page, `tab ${w} ${t}`);
      await ctx.close();
    }
    {
      const [ctx, page] = await ctxOf(1100, 900, dark);
      await go(page, "/zz-preview-receipt", "article");
      await shot(page, `receipt-${t}`);
      await contrast(page, "article", `receipt ${t}`);
      if (!dark) {
        // the print layout: the print media (the toolbar is gone, white paper), and the PDF the browser would make
        await page.emulateMedia({ media: "print" });
        await page.waitForTimeout(300);
        await shot(page, "receipt-print");
        writeFileSync(`${OUT}/receipt-print.pdf`, await page.pdf({ preferCSSPageSize: true, printBackground: true }));
      }
      await ctx.close();
    }
    {
      const [ctx, page] = await ctxOf(390, 844, dark);
      await go(page, "/zz-preview-receipt", "article");
      await shot(page, `m-receipt-390-${t}`);
      await noScroll(page, `m-receipt 390 ${t}`);
      await ctx.close();
    }

    // mockup next to the build (the mockup is the same width: 1920 × 1080)
    {
      const [ctx, page] = await ctxOf(3840, 1080, dark);
      const mock = readFileSync(resolve(OUT, "mockups", `SBAcct${dark ? "Dark" : "Light"}.png`)).toString("base64");
      const build = readFileSync(resolve(OUT, `tab-1920-${t}.png`)).toString("base64");
      await page.setContent(`<body style="margin:0;display:flex;direction:ltr"><div><img style="display:block" src="data:image/png;base64,${mock}"></div><div><img style="display:block" src="data:image/png;base64,${build}"></div></body>`);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/compare-tab-1920-${t}.png` });
      await ctx.close();
    }
  }
  console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n- ${problems.join("\n- ")}` : "\nno problems");
  process.exitCode = problems.length ? 1 : 0;
} finally {
  await browser.close();
}
