// Screenshots + checks of the clients pages (PR 4 of the restructure) → screenshots/clients/ (READ ONLY: no model call, no database write; the «حدد الموكل» dialog is only opened).
//   list-<1920|1440>-<light|dark>, m-list-390-<t>            the clients list
//   client-<cases|accounts|documents>-1920-<t>, client-cases-1440-<t>, m-client-<tab>-390-<t>   one client (the one with the most cases)
//   picker-1920-<t>, picker-new-1920-light, m-picker-390-<t>  case 4471/2026 (no client): the header's «حدد الموكل» and its dialog (opened, never saved)
//   compare-client-1920-<t>                                   the mockup (docs/design/ia/IAClient*, rendered to mockups/) next to the build
// Checks (printed): no horizontal scroll at 390 / 1280 / 1440 / 1600 / 1920 (list, the three client tabs, the case page with the picker open), AA contrast of the
// new text, the client cell links to the client page, the sessions of a client's chat are its own.
// Needs the app running and the mockups rendered (npx tsx scripts/mockup-shots-ia.ts screenshots/clients/mockups IAClient).
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/clients-shots.ts [baseUrl] [client id] [case without a client]
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3101";
const OUT = "screenshots/clients";
mkdirSync(OUT, { recursive: true });

// the demo data, read through RLS as the demo user: the client with the most cases, and the case that has no client
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const { data: cs } = await sb.from("cases").select("id, client_id").neq("review_status", "rejected");
const counts = new Map<string, number>();
for (const c of cs ?? []) if (c.client_id) counts.set(c.client_id, (counts.get(c.client_id) ?? 0) + 1);
const CLIENT = process.argv[3] ?? [...counts].sort((a, b) => b[1] - a[1])[0][0];
const NO_CLIENT = process.argv[4] ?? (cs ?? []).find((c) => !c.client_id)?.id;
if (!NO_CLIENT) throw new Error("no case without a client in the demo office");

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
async function go(page: Page, path: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 120_000 });
  await page.waitForSelector("main#page h1", { timeout: 60_000 }).catch(() => null);
  await page.waitForTimeout(1800);
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` });
const theme = (d: boolean) => (d ? "dark" : "light");
const problems: string[] = [];

// ---- contrast: the text colour against the pixels behind it (the text is made transparent, the page shot again, the median colour under each text box) ----
const lum = (c: number[]) => { const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
async function contrast(page: Page, root: string, tag: string) {
  const items = await page.evaluate((sel) => {
    const el0 = document.querySelector(sel);
    if (!el0) return [];
    const out: { text: string; x: number; y: number; w: number; h: number; color: number[]; size: number; weight: number; op: number }[] = [];
    const g = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    el0.querySelectorAll("*").forEach((el) => {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent!.trim()).map((n) => n.textContent!.trim()).join(" ");
      if (!own) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width < 2 || r.height < 2 || cs.visibility === "hidden" || cs.display === "none" || el.closest(".sr-only") || el.closest("button:disabled") /* a disabled control is exempt */ || (el.closest("[aria-hidden='true']") && !el.closest("[role='dialog']"))) return;
      if (r.top < 0 || r.bottom > window.innerHeight || r.left < 0 || r.right > window.innerWidth) return;
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (!top || !el.contains(top)) return;
      // an element faded as a whole (a finished case) multiplies its opacity into every text inside it
      let op = 1;
      for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity);
      out.push({ text: own.slice(0, 28), x: r.x, y: r.y, w: r.width, h: r.height, op, color: ((): number[] => { g.canvas.width = g.canvas.height = 1; g.clearRect(0, 0, 1, 1); g.fillStyle = cs.color; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; })(), size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight) });
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
    // the faded row's own background is behind the text too: with the row at `op`, the colour of text and background both move toward the page; the text's share is op * alpha
    const a = (it.color[3] ?? 1) * it.op;
    const fg = [0, 1, 2].map((j) => Math.round(it.color[j] * a + bg[j] * (1 - a)));
    const large = it.size >= 24 || (it.size >= 18.66 && it.weight >= 700);
    const r = ratio(fg, bg);
    worst = Math.min(worst, r);
    if (r < (large ? 3 : 4.5)) problems.push(`contrast ${tag}: «${it.text}» ${r.toFixed(2)}:1 (${it.size}px, text ${fg}, behind ${bg})`);
  });
  console.log(`contrast ${tag}: ${items.length} texts, lowest ${worst.toFixed(2)}:1`);
}

try {
  // ---- screenshots and contrast ----
  const TABS = ["cases", "accounts", "documents"] as const;
  for (const dark of [false, true]) {
    const t = theme(dark);
    for (const [w, h] of [[1920, 1080], [1440, 900]] as const) {
      const [ctx, page] = await ctxOf(w, h, dark);
      await go(page, "/clients");
      await shot(page, `list-${w}-${t}`);
      if (w === 1920) await contrast(page, "main#page", `list ${w} ${t}`);
      await ctx.close();
    }
    for (const tab of TABS) {
      const [ctx, page] = await ctxOf(1920, 1080, dark);
      await go(page, `/clients/${CLIENT}?tab=${tab}`);
      await shot(page, `client-${tab}-1920-${t}`);
      await contrast(page, "main#page", `client ${tab} 1920 ${t}`);
      await ctx.close();
    }
    {
      const [ctx, page] = await ctxOf(1440, 900, dark);
      await go(page, `/clients/${CLIENT}`);
      await shot(page, `client-cases-1440-${t}`);
      await ctx.close();
    }
    // the phone: the list is a sheet over the chat; so is a client's tab
    {
      const [ctx, page] = await ctxOf(390, 844, dark);
      await go(page, "/clients");
      await shot(page, `m-list-390-${t}`);
      await contrast(page, "main#page", `m-list 390 ${t}`);
      await ctx.close();
    }
    for (const tab of TABS) {
      const [ctx, page] = await ctxOf(390, 844, dark);
      await go(page, `/clients/${CLIENT}?tab=${tab}`);
      await shot(page, `m-client-${tab}-390-${t}`);
      await contrast(page, "main#page", `m-client ${tab} 390 ${t}`);
      await ctx.close();
    }
    {
      const [ctx, page] = await ctxOf(390, 844, dark);
      await go(page, `/clients/${CLIENT}`); // no tab: the chat is the context (the client's chat), the page is behind
      await shot(page, `m-client-chat-390-${t}`);
      await ctx.close();
    }
    // the client's chat beside the page (desktop), with the sessions of this client only
    {
      const [ctx, page] = await ctxOf(1920, 1080, dark);
      await go(page, `/clients/${CLIENT}?s=new`);
      await shot(page, `client-chat-new-1920-${t}`);
      await ctx.close();
    }
  }

  // ---- «حدد الموكل» on the case that has no client: opened, NEVER saved ----
  for (const dark of [false, true]) {
    const t = theme(dark);
    const [ctx, page, writes] = await ctxOf(1920, 1080, dark);
    await go(page, `/cases/${NO_CLIENT}`);
    const base = writes.length; // the page's own POSTs on load (the chat panel) are not the picker's
    await page.locator("main#page header").first().screenshot({ path: `${OUT}/no-client-header-1920-${t}.png` });
    await shot(page, `no-client-1920-${t}`);
    await page.getByRole("button", { name: "حدد الموكل" }).click();
    await page.waitForSelector("dialog[open]");
    await page.waitForTimeout(400);
    await shot(page, `picker-1920-${t}`);
    await contrast(page, "dialog[open]", `picker 1920 ${t}`);
    if (!dark) {
      await page.getByRole("button", { name: "+ موكل جديد" }).click();
      await page.waitForTimeout(300);
      await shot(page, "picker-new-1920-light");
    }
    if (writes.length > base) problems.push(`the picker made a POST request while only being opened (${writes.slice(base).join(", ")})`);
    else console.log(`the picker only opened: no POST after the page loaded (${base} on load)`);
    await ctx.close();
    {
      const [c2, p2, w2] = await ctxOf(390, 844, dark);
      await go(p2, `/cases/${NO_CLIENT}?tab=hearings`);
      const base2 = w2.length;
      await p2.getByRole("button", { name: "حدد الموكل" }).click();
      await p2.waitForSelector("dialog[open]");
      await p2.waitForTimeout(400);
      await shot(p2, `m-picker-390-${t}`);
      if (w2.length > base2) problems.push(`the phone picker made a POST request while only being opened (${w2.slice(base2).join(", ")})`);
      await c2.close();
    }
  }

  // ---- the case page of a client that exists: the client cell is a link to the client's page ----
  {
    const { data: withClient } = await sb.from("cases").select("id, client_id").eq("client_id", CLIENT).limit(1).single();
    const [ctx, page] = await ctxOf(1920, 1080, false);
    await go(page, `/cases/${withClient!.id}`);
    const link = page.locator("main#page header dl a[href^='/clients/']");
    const href = await link.first().getAttribute("href").catch(() => null);
    if (href !== `/clients/${CLIENT}`) problems.push(`the case header's client cell does not link to the client page (${href})`);
    else console.log("the case header's client cell links to the client page: ok");
    await page.locator("main#page header").first().screenshot({ path: `${OUT}/case-header-client-link-1920-light.png` });
    await ctx.close();
  }

  // ---- the client chat's sessions are its own: none of them is in the general list, and the general list has none of them ----
  {
    const { data: threads } = await sb.from("chat_threads").select("id, case_id, client_id");
    const mine = (threads ?? []).filter((x) => x.client_id === CLIENT);
    const [ctx, page] = await ctxOf(1920, 1080, false);
    await go(page, "/clients");
    const general = await page.locator("aside a[href*='s=']").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")));
    const leaked = mine.filter((x) => general.some((h) => h?.includes(x.id)));
    console.log(`client sessions: ${mine.length}; shown in the general lists: ${leaked.length}`);
    if (leaked.length) problems.push("a client's session shows in the general sessions");
    await ctx.close();
  }

  // ---- compare: the mockup next to the build (each shown at `dw` px wide) ----
  const mock = await browser.newContext();
  const cmp = async (name: string, mockup: string, build: string, dw: number) => {
    const m = readFileSync(`${OUT}/mockups/${mockup}.png`).toString("base64");
    const b = readFileSync(`${OUT}/${build}.png`).toString("base64");
    const p = await mock.newPage();
    await p.setViewportSize({ width: dw * 2 + 90, height: 700 });
    await p.setContent(`<body style="margin:0;background:#777;font:16px sans-serif;color:#fff"><div style="display:flex;gap:30px;padding:30px"><div><div style="padding:0 0 6px">mockup (${mockup})</div><img src="data:image/png;base64,${m}" style="width:${dw}px;display:block"></div><div><div style="padding:0 0 6px">build (${build})</div><img src="data:image/png;base64,${b}" style="width:${dw}px;display:block"></div></div></body>`);
    await p.screenshot({ path: `${OUT}/compare-${name}.png`, fullPage: true });
    await p.close();
  };
  for (const t of ["light", "dark"]) {
    const T = t === "light" ? "Light" : "Dark";
    await cmp(`client-1920-${t}`, `IAClient${T}`, `client-cases-1920-${t}`, 1100);
  }
  await mock.close();

  // ---- no horizontal scroll ----
  for (const w of [390, 1280, 1440, 1600, 1920]) {
    const [ctx, page] = await ctxOf(w, w < 600 ? 844 : 900, false);
    const paths = ["/clients", ...TABS.map((tab) => `/clients/${CLIENT}?tab=${tab}`), `/cases/${NO_CLIENT}?tab=hearings`];
    for (const p of paths) {
      await go(page, p);
      const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      if (r.sw > r.iw) problems.push(`horizontal scroll at ${w} on ${p}: ${r.sw} > ${r.iw}`);
    }
    console.log(`overflow check at ${w}: done`);
    await ctx.close();
  }
} finally {
  await browser.close();
}

if (problems.length) { console.log("\nPROBLEMS:"); problems.forEach((p) => console.log(" -", p)); process.exitCode = 1; }
else console.log("\nall checks passed");
