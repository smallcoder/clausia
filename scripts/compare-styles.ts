// Computed-style snapshot and diff: proves a CSS refactor (tokens instead of arbitrary values) changes nothing visible.
//   snap: npx tsx --env-file=.env.local scripts/compare-styles.ts snap <outDir> [baseUrl=http://localhost:3600]
//   diff: npx tsx scripts/compare-styles.ts diff <dirA> <dirB>      (exit 1 when any element differs)
// snap logs in as the demo user (DEMO_EMAIL / DEMO_PASSWORD, never printed) and, for every element on 5 screens
// (/, /cases, /cases/<case 772>, /hearings, /chat/<thread>) at 1440 and 390 wide, light and dark, saves the computed
// width, height, min/max sizes, padding, margin, gap, inset, flex-basis, scroll padding/margin, translate and transform.
// Streaming <script>s and the route announcer are skipped (they change between loads). An element is keyed by its place in the page (tag + child index path), so a class rename does not matter, only the result.
import { chromium, type Browser } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const THREAD = process.env.CHAT_THREAD ?? "fa31106e-d577-41bd-be88-70fd5ff1804a";
const PROPS = [
  "width", "height", "min-width", "min-height", "max-width", "max-height",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "row-gap", "column-gap", "top", "right", "bottom", "left",
  "flex-basis", "translate", "transform",
  "scroll-padding-top", "scroll-padding-right", "scroll-padding-bottom", "scroll-padding-left",
  "scroll-margin-top", "scroll-margin-right", "scroll-margin-bottom", "scroll-margin-left",
] as const;
type Snap = Record<string, string[]>; // element key -> values in PROPS order (key ends with a short text hint after «|»)

async function caseId(): Promise<string> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
  const { data } = await db.from("cases").select("id").eq("case_number", "772").limit(1).maybeSingle();
  if (!data?.id) throw new Error("case 772 not found");
  return data.id as string;
}

async function login(browser: Browser, base: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${base}/login`);
  await page.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await page.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { waitUntil: "commit", timeout: 60_000 }), page.click('button:has-text("دخول")')]);
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

async function snap(outDir: string, base: string) {
  mkdirSync(outDir, { recursive: true });
  const id = await caseId();
  const routes: Record<string, string> = { home: "/", cases: "/cases", case: `/cases/${id}`, hearings: "/hearings", chat: `/chat/${THREAD}` };
  const browser = await chromium.launch();
  const state = await login(browser, base);
  for (const [name, path] of Object.entries(routes)) {
    for (const width of [1440, 390]) for (const dark of [false, true]) {
      const ctx = await browser.newContext({ storageState: state, viewport: { width, height: width === 390 ? 844 : 960 }, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light", reducedMotion: "reduce" });
      const page = await ctx.newPage();
      try { await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 40_000 }); }
      catch { await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 60_000 }); }
      await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      // a plain string (not a function): tsx's name-keeping helper would not exist in the page
      const data = (await page.evaluate(`(() => {
        const props = ${JSON.stringify(PROPS)};
        const out = {};
        const skip = new Set(["script", "style", "noscript", "next-route-announcer", "template"]);
        const walk = (el, key) => {
          const cs = getComputedStyle(el);
          const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent || "").join("").trim().slice(0, 16);
          out[key + "|" + own] = props.map((p) => cs.getPropertyValue(p));
          Array.from(el.children).forEach((c, i) => { if (!skip.has(c.tagName.toLowerCase())) walk(c, key + ">" + c.tagName.toLowerCase() + ":" + i); });
        };
        walk(document.documentElement, "html");
        return out;
      })()`)) as Snap;
      const file = `${name}-${width}-${dark ? "dark" : "light"}.json`;
      writeFileSync(join(outDir, file), JSON.stringify({ props: PROPS, data }));
      console.log(file, Object.keys(data).length, "elements");
      await ctx.close();
    }
  }
  await browser.close();
}

function diff(a: string, b: string) {
  const files = readdirSync(a).filter((f) => f.endsWith(".json")).sort();
  let total = 0;
  for (const f of files) {
    let B: { data: Snap };
    try { B = JSON.parse(readFileSync(join(b, f), "utf8")); } catch { console.log(`${f}: missing in ${b}`); total++; continue; }
    const A: { props: string[]; data: Snap } = JSON.parse(readFileSync(join(a, f), "utf8"));
    const ka = Object.keys(A.data), kb = new Set(Object.keys(B.data));
    const lines: string[] = [];
    for (const k of ka) {
      if (!kb.has(k)) { lines.push(`  only in A: ${k}`); continue; }
      A.props.forEach((p, i) => { if (A.data[k][i] !== B.data[k][i]) lines.push(`  ${k}  ${p}: ${A.data[k][i]} -> ${B.data[k][i]}`); });
    }
    for (const k of kb) if (!(k in A.data)) lines.push(`  only in B: ${k}`);
    console.log(`${f}: ${ka.length} elements, ${lines.length} difference(s)`);
    for (const l of lines.slice(0, 40)) console.log(l);
    if (lines.length > 40) console.log(`  … ${lines.length - 40} more`);
    total += lines.length;
  }
  console.log(total === 0 ? "computed styles: 0 differences" : `computed styles: ${total} difference(s)`);
  process.exit(total === 0 ? 0 : 1);
}

const [cmd, x, y] = process.argv.slice(2);
if (cmd === "snap" && x) snap(x, y ?? "http://localhost:3600").catch((e) => { console.error(e); process.exit(1); });
else if (cmd === "diff" && x && y) diff(x, y);
else { console.error("usage: compare-styles.ts snap <outDir> [baseUrl] | diff <dirA> <dirB>"); process.exit(2); }
