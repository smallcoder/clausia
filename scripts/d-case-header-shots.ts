// Item 19, Case desktop header: shoots /cases/<772/2025> at 1440×960 and 1920×1080, light and dark (viewport + full
// page) → screenshots/d-case/Header-<Light|Dark>-<width>[-full].png, side-by-side with the mockup PNG at 1440 →
// screenshots/d-case/compare-header-<Light|Dark>Case.png, and measures the header elements in the mockup HTML and the
// app (x / y / width / height, px) → printed table + screenshots/d-case/header-measure.json.
// Logs in once and reuses the session (storageState). Needs the app running.
// Run: npx tsx --env-file=.env.local scripts/d-case-header-shots.ts [baseUrl] [statePath]
import { chromium, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [BASE = "http://localhost:3501", STATE = "/tmp/clausia-d-case-state.json"] = process.argv.slice(2);
const OUT = "screenshots/d-case";
mkdirSync(OUT, { recursive: true });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await db.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const id = (await db.from("cases").select("id").eq("case_number", "772").eq("case_year", 2025).limit(1).maybeSingle()).data?.id as string;
if (!id) throw new Error("case 772/2025 not found");

const browser = await chromium.launch();
if (!existsSync(STATE)) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await page.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.click('button:has-text("دخول")')]);
  await ctx.storageState({ path: STATE });
  await ctx.close();
}

// The same element list from both pages; strings so the bundler adds no helpers inside the page.
const RECT = "const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10]; };";
const MOCK = `(() => { ${RECT}
  const main = document.querySelector('main'); const back = main.querySelector('button[aria-label="رجوع"]');
  const crumb = back.nextElementSibling, pill = crumb.nextElementSibling, who = main.children[1], card = main.children[2];
  const cells = [...card.children].filter((c) => c.children.length);
  const o = { back: r(back), crumb: r(crumb), pill: r(pill), eyebrow: r(who.children[0]), h1: r(main.querySelector('h1')), card: r(card), divider: r([...card.children].find((c) => !c.children.length)) };
  cells.forEach((c, i) => { o['cell' + i] = r(c); o['cell' + i + '.top'] = r(c.children[0]); o['cell' + i + '.bottom'] = r(c.children[1]); });
  return o; })()`;
const APP = `(() => { ${RECT}
  const h1 = document.querySelector('h1'); const header = h1.closest('header');
  const back = [...header.querySelectorAll('a[aria-label="رجوع"]')].find((e) => e.offsetParent);
  const crumb = header.querySelector('nav[aria-label="المسار"]'), pill = crumb.nextElementSibling, card = header.lastElementChild;
  const cells = [...card.querySelectorAll(':scope > dl > div, :scope > a, :scope > div')].filter((c) => c.children.length);
  const o = { back: r(back), more: r([...header.querySelectorAll('button[aria-label="المزيد"]')].find((e) => e.offsetParent)), crumb: r(crumb), pill: r(pill), eyebrow: r(h1.previousElementSibling.firstElementChild), h1: r(h1), card: r(card), divider: r([...card.children].find((c) => !c.children.length)) };
  cells.forEach((c, i) => { o['cell' + i] = r(c); o['cell' + i + '.top'] = r(c.children[0]); o['cell' + i + '.bottom'] = r(c.children[1]); });
  return o; })()`;

const measure: Record<string, unknown> = {};
const pin = "html{position:relative} .bg-fade.fixed{position:absolute}";
for (const dark of [false, true]) for (const width of [1440, 1920]) {
  const theme = dark ? "Dark" : "Light";
  const ctx = await browser.newContext({
    storageState: STATE, viewport: { width, height: width === 1440 ? 960 : 1080 }, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light",
  });
  const page: Page = await ctx.newPage();
  await page.goto(`${BASE}/cases/${id}`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/Header-${theme}-${width}.png` });
  if (width === 1440) measure[`app-${theme}`] = await page.evaluate(APP);
  await page.addStyleTag({ content: pin });
  const full = resolve(`${OUT}/Header-${theme}-${width}-full.png`);
  await page.screenshot({ path: full, fullPage: true });
  await ctx.close();
  console.log(theme, width);
  if (width !== 1440) continue;

  const m = await (await browser.newContext({ viewport: { width: 1440, height: 960 } })).newPage();
  await m.goto("file://" + resolve(`docs/design/${theme}Case.dc.html`), { waitUntil: "load" });
  await m.waitForTimeout(600);
  measure[`mockup-${theme}`] = await m.evaluate(MOCK);
  await m.context().close();

  const html = `<html><body style="margin:0;background:${dark ? "#05070c" : "#dfe2e8"};font:600 14px -apple-system,sans-serif;color:${dark ? "#ccc" : "#333"}">
    <div style="display:flex;gap:24px;padding:16px;align-items:flex-start">
      <div><div style="padding:0 0 8px">Mockup · ${theme}Case</div><img src="data:image/png;base64,${readFileSync(`screenshots/mockups/${theme}Case.png`).toString("base64")}" style="width:1440px;display:block"></div>
      <div><div style="padding:0 0 8px">App · /cases/772 (1440px)</div><img src="data:image/png;base64,${readFileSync(full).toString("base64")}" style="width:1440px;display:block"></div>
    </div></body></html>`;
  const c2 = await browser.newContext({ viewport: { width: 1440 * 2 + 56, height: 800 } });
  const p2 = await c2.newPage();
  await p2.setContent(html, { waitUntil: "load" });
  await p2.screenshot({ path: `${OUT}/compare-header-${theme}Case.png`, fullPage: true });
  await c2.close();
}
await browser.close();
writeFileSync(`${OUT}/header-measure.json`, JSON.stringify(measure, null, 1));

// table: mockup vs app (light), and the deltas
const mk = measure["mockup-Light"] as Record<string, number[] | null>, ap = measure["app-Light"] as Record<string, number[] | null>;
console.log("element".padEnd(16), "mockup [x y w h]".padEnd(30), "app [x y w h]".padEnd(30), "delta");
for (const k of new Set([...Object.keys(mk), ...Object.keys(ap)])) {
  const a = mk[k], b = ap[k];
  const d = a && b ? a.map((v, i) => Math.round((b[i] - v) * 10) / 10).join(" ") : "";
  console.log(k.padEnd(16), String(a?.join(" ") ?? "-").padEnd(30), String(b?.join(" ") ?? "-").padEnd(30), d);
}
