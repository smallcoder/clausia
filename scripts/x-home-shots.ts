// Exact-layout pass, Home: shoots / at 1440×960 and 390×844 (light + dark, viewport and full page), writes
// mockup | app side by side to screenshots/compare-x/<View>.png, and dumps the same landmarks' boxes from the mockup
// (docs/design/<View>.dc.html) and the app to screenshots/tmp/x-home/boxes.json for the px comparison.
// Needs the app running. Run: npx tsx --env-file=.env.local scripts/x-home-shots.ts [baseUrl]
import { chromium, type Browser, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3401";
const OUT = "screenshots/compare-x";
const TMP = "screenshots/tmp/x-home";
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

let state: Awaited<ReturnType<import("@playwright/test").BrowserContext["storageState"]>> | null = null;

/** Logs in once and reuses the session (many logins in a row get rate-limited by Supabase Auth). */
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

/** Landmarks found the same way in the mockup and the app (text + structure, no test ids). A page string, so tsx helpers don't leak in. */
const LANDMARKS = `(() => {
  const vis = (e) => e && e.getBoundingClientRect().width > 0;
  const box = (name, e) => { if (!vis(e)) return { name, missing: true }; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return { name, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), fs: cs.fontSize, fw: cs.fontWeight, lh: cs.lineHeight, rad: cs.borderTopLeftRadius, pad: cs.padding }; };
  const all = (sel) => Array.from(document.querySelectorAll(sel));
  const byText = (t) => all("*").filter((e) => vis(e) && Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().startsWith(t)));
  const out = [];
  const nav = document.querySelector("header nav"); out.push(box("nav", nav));
  (nav ? Array.from(nav.querySelectorAll("a")) : []).forEach((a, i) => out.push(box("tab" + i, a)));
  const hb = all("header button, header a").filter(vis); out.push(box("account", hb.find((b) => b.getAttribute("aria-label") === "الحساب")));
  const h1 = document.querySelector("h1");
  out.push(box("eyebrow", h1 && h1.previousElementSibling), box("h1", h1));
  const line = h1 && h1.nextElementSibling; out.push(box("clausia-line", line));
  out.push(box("clausia-mark", line && Array.from(line.querySelectorAll("*")).find((e) => e.children.length === 0 && (e.textContent || "").trim() === "C")));
  out.push(box("clausia-p", line && line.querySelector("p")));
  const title = byText("جلسات النهارده")[0] || byText("جلسات بكره")[0];
  const card = title && (title.closest("section") || title.parentElement); out.push(box("today-card", card), box("today-title", title));
  (card ? Array.from(card.querySelectorAll("a")) : []).forEach((a, i) => { out.push(box("row" + i, a), box("row" + i + "-num", a.firstElementChild)); });
  const und = byText("محتاجة قرار").map((e) => e.closest("a")).find(vis); out.push(box("undecided", und));
  if (und) {
    out.push(box("undecided-num", Array.from(und.querySelectorAll("*")).find((e) => vis(e) && e.children.length === 0 && /^[0-9]+$/.test((e.textContent || "").trim()))));
    out.push(box("pill", Array.from(und.querySelectorAll("span")).find((e) => vis(e) && (e.textContent || "").trim().startsWith("سجّلها") && e.querySelector("svg"))));
  }
  const chip = all("button").find((b) => vis(b) && (b.textContent || "").includes("موكل وقضية جديدة"));
  out.push(box("chip-row", chip && chip.parentElement));
  (chip ? Array.from(chip.parentElement.children) : []).forEach((c, i) => out.push(box("chip" + i, c)));
  const ta = all("textarea").find(vis); let comp = ta; while (comp && parseFloat(getComputedStyle(comp).borderTopLeftRadius) < 20) comp = comp.parentElement;
  out.push(box("composer", comp), box("textarea", ta), box("composer-mark", comp && Array.from(comp.querySelectorAll("*")).find((e) => e.children.length === 0 && (e.textContent || "").trim() === "C")));
  (comp ? Array.from(comp.querySelectorAll("button")) : []).filter(vis).forEach((b, i) => out.push(box("btn" + i, b)));
  out.push(box("foot", byText("Clausia بتجهّز")[0] || byText("مفيش حاجة بتتحفظ")[0]));
  const last = byText("آخر ما سجّلته")[0]; if (last) out.push(box("last-recorded", last));
  return out;
})()`;

const boxes = (page: Page) => page.evaluate(LANDMARKS);

async function main() {
  const browser = await chromium.launch();
  const report: Record<string, unknown> = {};
  for (const dark of [false, true]) for (const mobile of [false, true]) {
    const name = `${dark ? "Dark" : "Light"}${mobile ? "Mobile" : ""}Home`;
    const w = mobile ? 390 : 1440, h = mobile ? 844 : 960;
    const ctx = await browser.newContext({ storageState: await session(browser), viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light" });
    const page = await ctx.newPage();
    try { await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 40_000 }); }
    catch { await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60_000 }); }
    await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const view = resolve(`${TMP}/${name}.png`);
    await page.screenshot({ path: view });
    await page.screenshot({ path: resolve(`${TMP}/${name}-full.png`), fullPage: true });
    report[name] = await boxes(page);
    await ctx.close();

    const mctx = await browser.newContext({ viewport: { width: w, height: h } });
    const mpage = await mctx.newPage();
    await mpage.goto("file://" + resolve(`docs/design/${name}.dc.html`), { waitUntil: "load" });
    await mpage.waitForTimeout(600);
    report[`${name}:mockup`] = await boxes(mpage);
    await mctx.close();

    const mock = resolve(`screenshots/mockups/${name}.png`);
    const html = `<html><body style="margin:0;background:${dark ? "#05070c" : "#dfe2e8"};font:600 14px -apple-system,sans-serif;color:${dark ? "#ccc" : "#333"}">
      <div style="display:flex;gap:24px;padding:16px;align-items:flex-start">
        <div><div style="padding:0 0 8px">Mockup · ${name} (${w}×${h})</div><img src="data:image/png;base64,${readFileSync(mock).toString("base64")}" style="width:${w}px;display:block;border-radius:12px"></div>
        <div><div style="padding:0 0 8px">App · / (${w}×${h} viewport)</div><img src="data:image/png;base64,${readFileSync(view).toString("base64")}" style="width:${w}px;display:block;border-radius:12px"></div>
      </div></body></html>`;
    const c2 = await browser.newContext({ viewport: { width: w * 2 + 56, height: 800 }, deviceScaleFactor: mobile ? 2 : 1 });
    const p2 = await c2.newPage();
    await p2.setContent(html, { waitUntil: "load" });
    await p2.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    await c2.close();
    console.log(name);
  }
  writeFileSync(`${TMP}/boxes.json`, JSON.stringify(report, null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
