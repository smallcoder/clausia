// Checks for the liquid-glass PR (read only, no model call, no database write): prints numbers.
//   contrast   WCAG contrast of text on the glass surfaces, measured on real pixels (text hidden, background sampled in the text's box; worst pixel and median)
//   hscroll    no horizontal scroll at 390 / 1440 / 1920
//   cursor     clickable elements (links, buttons, role, tabindex, React onClick) whose computed cursor is not pointer; disabled ones must be not-allowed
//   reduced    prefers-reduced-transparency: reduce → glass is solid (no backdrop-filter, opaque background)
//   perf       frame timing (rAF) while scrolling a long chat and a long page, with the blur on and with it forced off
// Needs the app running. Run: npx tsx --conditions=react-server --env-file=.env.local scripts/glass-checks.ts [baseUrl] [contrast|hscroll|cursor|reduced|perf ...]
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith("http")) ?? "http://localhost:5100";
const only = args.filter((a) => !a.startsWith("http"));
const want = (n: string) => only.length === 0 || only.includes(n);

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const { data: c } = await sb.from("cases").select("id").eq("case_number", "772").limit(1).single();
const caseId = c!.id as string;
const { data: threads } = await sb.from("chat_threads").select("id").is("case_id", null).limit(200);
let longThread = ""; let most = -1;
for (const t of threads ?? []) {
  const { count } = await sb.from("chat_messages").select("id", { count: "exact", head: true }).eq("thread_id", t.id);
  if ((count ?? 0) > most) { most = count ?? 0; longThread = t.id; }
}

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
  const ctx = await browser.newContext({ storageState: state, viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light" });
  await ctx.addInitScript((d) => { try { localStorage.setItem("clausia-theme", d ? "dark" : "light"); } catch { /* none */ } }, dark);
  const page = await ctx.newPage();
  await page.addInitScript("window.__name = (f) => f"); // tsx (esbuild keepNames) wraps inner functions in __name()
  await page.addInitScript(() => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s)); });
  return [ctx, page];
}
async function go(page: Page, path: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForSelector('textarea[aria-label="رسالة لـ Clausia"]', { timeout: 30_000 });
  await page.waitForTimeout(1500);
}

// ---------- contrast
type RGBA = [number, number, number, number];
const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** contrast of the text of `sel` (first match) against the pixels behind it (text hidden). Returns [worst, median]. */
async function contrastOf(page: Page, sel: string, opts: { which?: number; color?: string } = {}): Promise<{ worst: number; median: number; color: string } | null> {
  const loc = page.locator(sel).nth(opts.which ?? 0);
  if (!(await loc.count())) return null;
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const info = await loc.evaluate((el, col) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, color: col || getComputedStyle(el).color };
  }, opts.color ?? "");
  const m = info.color.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  const fg: RGBA = [parts[0], parts[1], parts[2], parts[3] ?? 1];
  const style = await page.addStyleTag({ content: "*,*::before,*::after,*::placeholder{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}" });
  await page.waitForTimeout(250);
  // sample inside the box, away from the rounded corners of a pill (radius up to h/2), where the page behind shows
  const ix = Math.min(info.w / 3, info.h * 0.3); const iy = info.h * 0.15;
  const clip = { x: Math.max(0, Math.floor(info.x + ix)), y: Math.max(0, Math.floor(info.y + iy)), width: Math.max(1, Math.ceil(info.w - 2 * ix)), height: Math.max(1, Math.ceil(info.h - 2 * iy)) };
  const png = await page.screenshot({ clip });
  if (process.env.DUMP) (await import("node:fs")).writeFileSync(`/tmp/claude-501/dump-${sel.replace(/[^a-z]/gi, "").slice(0, 30)}.png`, png);
  await style.evaluate((n) => n.remove());
  await page.waitForTimeout(450); // colours transition back (150ms) before the next reading
  const ratios = await page.evaluate(async ([b64, f]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
    const g = cv.getContext("2d")!; g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    const fgc = f as number[];
    const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const L = (r: number, gg: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
    const out: number[] = [];
    for (let i = 0; i < d.length; i += 4 * 3) {
      const bg = [d[i], d[i + 1], d[i + 2]];
      const a = fgc[3];
      const mix = [0, 1, 2].map((k) => fgc[k] * a + bg[k] * (1 - a));
      const l1 = L(mix[0], mix[1], mix[2]); const l2 = L(bg[0], bg[1], bg[2]);
      out.push((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
    }
    return out;
  }, [png.toString("base64"), fg] as const);
  ratios.sort((a, b) => a - b);
  void lum; void ratio;
  return { worst: ratios[Math.floor(ratios.length * 0.02)], median: ratios[Math.floor(ratios.length / 2)], color: info.color };
}
const fmt = (r: { worst: number; median: number } | null) => (r ? `worst ${r.worst.toFixed(2)}  median ${r.median.toFixed(2)}` : "not found");
const PASS = (r: { worst: number } | null, min: number) => (r ? (r.worst >= min ? "PASS" : "FAIL") : "n/a");

if (want("contrast")) {
  console.log("== contrast (AA: 4.5 normal text, 3 large text / UI parts; worst = 2nd percentile pixel)");
  for (const dark of [false, true]) {
    const t = dark ? "dark" : "light";
    const [ctx, page] = await ctxOf(1440, 900, dark);
    await go(page, `/?s=${longThread}`);
    const rows: [string, string, number?, number?][] = [
      ["chat: Clausia answer text (on the panel)", "aside ol li p", 4.5],
      ["chat: header title «Clausia»", "aside .text-title", 4.5],
      ["chat: header sub line (text-2)", "aside .text-text-2", 4.5],
      ["chat: muted text in the chat (text-3)", "aside ol .text-text-3", 4.5],
      ["chat: composer placeholder (text-4)", 'textarea[aria-label="رسالة لـ Clausia"]', 3],
      ["composer: inactive mode (اسأل…)", '.focus-host [role="tab"][aria-selected="false"]', 4.5],
      ["composer: ACTIVE mode", '.focus-host [role="tab"][aria-selected="true"]', 4.5],
      ["top bar: inactive tab «الجلسات»", 'nav[aria-label="الأقسام"] a:not([aria-current])', 4.5],
      ["top bar: ACTIVE tab", 'nav[aria-label="الأقسام"] a[aria-current="page"]', 4.5],
      ["top bar: office name (text-4, on the page)", "header .text-text-4", 3],
    ];
    for (const [label, sel, min] of rows) {
      const r = await contrastOf(page, sel);
      console.log(`${t.padEnd(5)} ${label.padEnd(46)} ${fmt(r)}  ${PASS(r, min ?? 4.5)} (min ${min})`);
    }
    // sessions list (the glass popover)
    await page.locator('button[aria-label="محادثات"]').click();
    await page.waitForTimeout(400);
    for (const [label, sel] of [["sessions list: title", '[aria-current], a.min-h-11 .truncate'], ["sessions list: date (text-4)", "a.min-h-11 .num"]] as const) {
      const r = await contrastOf(page, sel);
      console.log(`${t.padEnd(5)} ${label.padEnd(46)} ${fmt(r)}  ${PASS(r, label.includes("date") ? 3 : 4.5)}`);
    }
    await page.keyboard.press("Escape");
    // undo toast: the same classes, injected over the chat bottom and over a page card (the toast is only shown after a confirm; no write is made here)
    for (const [where, x, y] of [["over the page", 1100, 700], ["over the chat", 260, 700]] as const) {
      await page.evaluate(([px, py]) => {
        document.getElementById("toast-probe")?.remove();
        const d = document.createElement("div");
        d.id = "toast-probe";
        d.className = "glass flex items-center gap-3 rounded-full py-1.5 ps-4.5 pe-1.5 text-sm text-text";
        d.style.cssText = `position:fixed;left:${px}px;top:${py}px;z-index:60`;
        d.innerHTML = '<span id="toast-text">اتحفظ تعديلين</span><span class="inline-flex h-8 items-center rounded-full border border-border px-3.5 font-semibold text-text-2">تراجع</span>';
        document.body.appendChild(d);
      }, [x, y]);
      const r = await contrastOf(page, "#toast-text");
      console.log(`${t.padEnd(5)} ${("undo toast " + where).padEnd(46)} ${fmt(r)}  ${PASS(r, 4.5)}`);
    }
    await page.evaluate(() => document.getElementById("toast-probe")?.remove());
    // top bar scrolled over the dark ink card header (the worst case under the glass)
    await go(page, `/cases/${caseId}`);
    const y = await page.evaluate(() => { const h = document.querySelector('section[aria-label="لنا · طلباتنا"]'); return h ? h.getBoundingClientRect().top + window.scrollY : 480; });
    await page.evaluate((top) => window.scrollTo(0, top - 20), y);
    await page.waitForTimeout(800);
    for (const [label, sel, min] of [["scrolled bar over the dark card: inactive tab", 'nav[aria-label="الأقسام"] a:not([aria-current])', 4.5], ["scrolled bar over the dark card: ACTIVE tab", 'nav[aria-label="الأقسام"] a[aria-current="page"]', 4.5], ["scrolled bar over the dark card: «Clausia»", "header .text-title", 4.5]] as const) {
      const r = await contrastOf(page, sel);
      console.log(`${t.padEnd(5)} ${label.padEnd(46)} ${fmt(r)}  ${PASS(r, min)}`);
    }
    await ctx.close();
    // the phone: the page sheet and the chat
    const [mctx, mpage] = await ctxOf(390, 844, dark);
    await go(mpage, `/cases/${caseId}?sheet=1`);
    for (const [label, sel, min] of [["sheet: page title (on the sheet glass)", "main h1", 4.5], ["sheet: «موكلنا» label (gold)", "main .text-gold", 4.5], ["sheet: «ضد» (text-4)", "main .text-text-4", 3], ["sheet: «رجوع للشات»", 'a:has-text("رجوع للشات")', 4.5]] as const) {
      const r = await contrastOf(mpage, sel);
      console.log(`${t.padEnd(5)} ${label.padEnd(46)} ${fmt(r)}  ${PASS(r, min)}`);
    }
    await mctx.close();
    const [m2, p2] = await ctxOf(390, 844, dark);
    await go(p2, `/?s=${longThread}`);
    for (const [label, sel, min] of [["phone chat: answer text", "aside ol li p", 4.5], ["phone composer: ACTIVE mode", '.focus-host [role="tab"][aria-selected="true"]', 4.5], ["phone composer: inactive mode", '.focus-host [role="tab"][aria-selected="false"]', 4.5]] as const) {
      const r = await contrastOf(p2, sel);
      console.log(`${t.padEnd(5)} ${label.padEnd(46)} ${fmt(r)}  ${PASS(r, min)}`);
    }
    await m2.close();
  }
}

// ---------- horizontal scroll
if (want("hscroll")) {
  console.log("== horizontal scroll (scrollWidth - clientWidth, must be 0)");
  for (const [w, h] of [[390, 844], [1440, 900], [1920, 1080]] as const) {
    for (const dark of [false, true]) {
      const [ctx, page] = await ctxOf(w, h, dark);
      const res: string[] = [];
      for (const [name, path] of [["home", "/"], ["case", `/cases/${caseId}`], ["sheet", `/cases/${caseId}?sheet=1`], ["cases", "/cases"], ["hearings", "/hearings"], ["long chat", `/?s=${longThread}`]] as const) {
        await go(page, path);
        const d = await page.evaluate(() => { const e = document.documentElement; return { over: e.scrollWidth - e.clientWidth, body: document.body.scrollWidth - e.clientWidth }; });
        res.push(`${name} ${d.over}${d.body ? `(body ${d.body})` : ""}`);
      }
      console.log(`${String(w).padEnd(5)} ${dark ? "dark " : "light"} ${res.join(" | ")}`);
      await ctx.close();
    }
  }
}

// ---------- cursor
if (want("cursor")) {
  console.log("== cursor audit: clickable things whose cursor is not pointer; disabled things that are not not-allowed");
  const miss = new Map<string, number>();
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    const [ctx, page] = await ctxOf(w, h, false);
    for (const [name, path] of [["home", "/"], ["case", `/cases/${caseId}`], ["sheet", `/cases/${caseId}?sheet=1`], ["cases", "/cases"], ["hearings", "/hearings"], ["long chat", `/?s=${longThread}`], ["brief", "/brief"], ["holidays", "/settings/holidays"]] as const) {
      await go(page, path).catch(() => {});
      // open what opens: the sessions list, the account menu, the case menu
      for (const sel of ['button[aria-label="محادثات"]', 'button[aria-label="الحساب"]', 'button[aria-label="خيارات القضية"]', 'button[aria-haspopup="menu"]']) {
        const b = page.locator(sel).first();
        if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(200); }
      }
      const found = await page.evaluate(() => {
        const out: { where: string; why: string; cursor: string }[] = [];
        const all = document.querySelectorAll<HTMLElement>("body *");
        for (const el of all) {
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const props = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
          const rp = props ? (el as unknown as Record<string, Record<string, unknown>>)[props] : null;
          const reasons: string[] = [];
          if (rp && typeof rp.onClick === "function") reasons.push("onClick");
          if (el.hasAttribute("onclick")) reasons.push("onclick");
          const role = el.getAttribute("role");
          if (role && ["button", "tab", "menuitem", "option", "link", "radio", "checkbox", "switch"].includes(role)) reasons.push(`role=${role}`);
          if (el.tagName === "A" && el.hasAttribute("href")) reasons.push("a[href]");
          if (["BUTTON", "SUMMARY", "SELECT"].includes(el.tagName)) reasons.push(el.tagName.toLowerCase());
          if (el.tagName === "LABEL" && el.hasAttribute("for")) reasons.push("label[for]");
          if (el.hasAttribute("tabindex") && el.getAttribute("tabindex") !== "-1") reasons.push("tabindex");
          if (!reasons.length) continue;
          const dis = el.matches("[disabled], [aria-disabled='true']");
          const want = dis ? "not-allowed" : "pointer";
          if (cs.cursor !== want) {
            // a stretched button inside a row is the clickable part: fine if the element itself is covered by one with a pointer
            out.push({ where: `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(/\s+/).slice(0, 3).join(".") : ""}`, why: reasons.join("+") + (dis ? " (disabled)" : ""), cursor: cs.cursor });
          }
        }
        return out;
      });
      for (const f of found) { const k = `${w} ${name}: ${f.where} [${f.why}] cursor=${f.cursor}`; miss.set(k, (miss.get(k) ?? 0) + 1); }
    }
    await ctx.close();
  }
  if (miss.size === 0) console.log("none missing");
  for (const [k, n] of miss) console.log(`${k}${n > 1 ? ` x${n}` : ""}`);
}

// ---------- reduced transparency
if (want("reduced")) {
  console.log("== prefers-reduced-transparency: reduce");
  for (const dark of [false, true]) {
    const [ctx, page] = await ctxOf(1440, 900, dark);
    await go(page, `/cases/${caseId}`);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
    await page.waitForTimeout(400);
    const res = await page.evaluate(() => {
      const q = (s: string) => { const el = document.querySelector(s) as HTMLElement | null; if (!el) return null; const cs = getComputedStyle(el); return { backdrop: cs.backdropFilter, bg: cs.backgroundColor, img: cs.backgroundImage === "none" ? "none" : "image" }; };
      return { media: matchMedia("(prefers-reduced-transparency: reduce)").matches, panel: q("aside > div"), composer: q(".focus-host"), capsule: q('nav[aria-label="الأقسام"]') };
    });
    console.log(dark ? "dark " : "light", JSON.stringify(res));
    await ctx.close();
  }
}

// ---------- perf
if (want("perf")) {
  console.log("== frame timing while scrolling (rAF deltas, ms; 1440x900; blur on vs forced off). Headless Chromium; use the pair, not the absolute numbers");
  const scenarios: [string, string, string][] = [
    ["long chat x4 (DOM-cloned to ~170 messages)", `/?s=${longThread}`, "chat"],
    ["long page (case 772, window scroll, bar glass fades in)", `/cases/${caseId}`, "page"],
  ];
  for (const dark of [false, true]) {
    for (const [label, path, kind] of scenarios) {
      for (const blur of [true, false]) {
        const [ctx, page] = await ctxOf(1440, 900, dark);
        await go(page, path);
        if (!blur) await page.addStyleTag({ content: "*,*::before,*::after{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}" });
        if (kind === "chat") {
          await page.evaluate(() => {
            const ol = document.querySelector("aside ol")!;
            const items = Array.from(ol.children);
            for (let i = 0; i < 3; i++) for (const it of items) ol.appendChild(it.cloneNode(true));
          });
        } else {
          // make the page long enough to scroll: repeat the main content
          await page.evaluate(() => {
            const m = document.querySelector("main")!;
            const kids = Array.from(m.children);
            for (let i = 0; i < 3; i++) for (const k of kids) m.appendChild(k.cloneNode(true));
          });
        }
        await page.waitForTimeout(500);
        const r = await page.evaluate(async (k) => {
          const scroller = k === "chat" ? (document.querySelector("aside ol")!.closest(".overflow-y-auto") as HTMLElement) : null;
          const max = k === "chat" ? scroller!.scrollHeight - scroller!.clientHeight : document.documentElement.scrollHeight - innerHeight;
          const deltas: number[] = [];
          let last = performance.now();
          const start = last;
          const dur = 5000;
          await new Promise<void>((done) => {
            const tick = (now: number) => {
              deltas.push(now - last); last = now;
              const p = Math.min(1, (now - start) / dur);
              const y = p * max;
              if (scroller) scroller.scrollTop = y; else window.scrollTo(0, y);
              if (p < 1) requestAnimationFrame(tick); else done();
            };
            requestAnimationFrame(tick);
          });
          deltas.shift();
          const s = [...deltas].sort((a, b) => a - b);
          return { frames: deltas.length, max, avg: deltas.reduce((a, b) => a + b, 0) / deltas.length, p95: s[Math.floor(s.length * 0.95)], worst: s[s.length - 1], over20: deltas.filter((d) => d > 20).length, over33: deltas.filter((d) => d > 33.4).length };
        }, kind);
        console.log(`${dark ? "dark " : "light"} ${label.padEnd(58)} blur ${blur ? "ON " : "off"}  scrolled ${Math.round(r.max)}px  frames ${r.frames}  avg ${r.avg.toFixed(1)}  p95 ${r.p95.toFixed(1)}  worst ${r.worst.toFixed(1)}  >20ms ${r.over20}  >33ms ${r.over33}`);
        await ctx.close();
      }
    }
  }
}
await browser.close();
