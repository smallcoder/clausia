// Screenshots of the UI batch (wider sidebar and chat, thin scrollbars, the agenda's «محتاجة قرار» tab, the court cards' column names) → screenshots/ui-batch/.
// Five views, each at 1440, 1920 and 390, light and dark (30 shots):
//   agenda-<w>-<t>         the agenda's day: court cards with the column names inside each card              REAL page
//   decide-<w>-<t>         the «محتاجة قرار» tab: the tab bar with its gold count, the rows                  REAL page
//   decide-form-<w>-<t>    the same tab with the first row's inline form open and «تأجيل» chosen              REAL page, never saved
//   decide-empty-<w>-<t>   the same tab with nothing waiting: «كل القرارات متسجلة ✓»                         MOCKED (see below)
//   case-header-<w>-<t>    the case page's header (8 cells)                                                   REAL page
// MOCKED: the demo office has undecided hearings and the only way to empty the list is to save decisions (a database write). So decide-empty uses a
// TEMPORARY page, src/app/(app)/zz-preview-decide/page.tsx, that this script writes at the start and DELETES at the end (also on a crash or Ctrl-C). It renders the
// same AgendaView on the «محتاجة قرار» tab with no rows and a count of 0, inside the real shell; it reads nothing and writes nothing. In that shot the
// sidebar's own badge still shows the real count (the shell reads it). Nothing else is mocked, and «حفظ القرار» is never tapped: the script counts the POST
// requests the form sends and prints a warning if any is a save.
// Checks printed: the widths (sidebar 288 / 72, chat 560 / 480), no horizontal scroll, the tab bar and the count.
// Needs the app running FROM THIS FOLDER on a free port (never the owner's port 3000; the temporary page must be inside the running app) and .env.local with the demo account.
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/ui-batch-shots.ts <port | baseUrl> [dd/mm/yyyy of the day to shoot]
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const arg = process.argv[2];
if (!arg) throw new Error("usage: ui-batch-shots.ts <port | baseUrl> [dd/mm/yyyy]");
const BASE = /^\d+$/.test(arg) ? `http://localhost:${arg}` : arg;
if (/:3000\b/.test(BASE)) throw new Error("port 3000 is the owner's dev server: use another port");
const OUT = "screenshots/ui-batch";
mkdirSync(OUT, { recursive: true });

// ---- the temporary preview page (deleted again on every way out) ----
const PREVIEW_FILE = resolve("src/app/(app)/zz-preview-decide/page.tsx");
const PREVIEW_PATH = "/zz-preview-decide?tab=decide";
const PREVIEW_SRC = `// TEMPORARY: written by scripts/ui-batch-shots.ts and deleted by it. Never committed.
import { AgendaView } from "@/components/agenda/AgendaView";
import { addDaysIso, todayIso } from "@/lib/dates";
import { weekStart } from "@/lib/hearings";

export default function ZzPreviewDecide() {
  const today = todayIso();
  const wk = weekStart(today);
  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col px-4 sm:px-10">
      <AgendaView today={today} from={addDaysIso(wk, -28)} to={addDaysIso(wk, 34)} rows={[]} undecided={0} undecidedRows={[]} />
    </div>
  );
}
`;
const removePreview = () => { try { rmSync(dirname(PREVIEW_FILE), { recursive: true, force: true }); } catch { /* already gone */ } };
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { removePreview(); process.exit(130); });
process.on("exit", removePreview);
mkdirSync(dirname(PREVIEW_FILE), { recursive: true });
writeFileSync(PREVIEW_FILE, PREVIEW_SRC);

// ---- what to shoot (read through RLS as the demo user) ----
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const dmy = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d}/${m}/${y}`; };
let DAY = process.argv[3];
if (!DAY) {
  // the day with the most hearings (the agenda's most interesting day)
  const { data } = await sb.from("hearings").select("hearing_date").neq("review_status", "rejected");
  const per = new Map<string, number>();
  for (const h of data ?? []) per.set(h.hearing_date, (per.get(h.hearing_date) ?? 0) + 1);
  const best = [...per].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0];
  DAY = best ? dmy(best[0]) : "20/10/2026";
}
const { data: c772 } = await sb.from("cases").select("id").eq("case_number", "772").eq("case_year", 2025).limit(1);
const CASE_ID = c772?.[0]?.id ?? (await sb.from("cases").select("id").limit(1)).data?.[0]?.id;
if (!CASE_ID) throw new Error("no case to shoot");
console.log(`base ${BASE} · agenda day ${DAY} · case ${CASE_ID}`);

const browser = await chromium.launch();
const login = await browser.newContext();
const lp = await login.newPage();
await lp.goto(`${BASE}/login`);
await lp.fill('input[name="email"]', process.env.DEMO_EMAIL!);
await lp.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
await Promise.all([lp.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90_000 }), lp.click('button:has-text("دخول")')]);
const state = await login.storageState();
await login.close();

const SIZES: [number, number][] = [[1440, 960], [1920, 1080], [390, 844]];
const posts: string[] = [];
async function ctxOf(w: number, h: number, dark: boolean): Promise<[BrowserContext, Page]> {
  const touch = w < 600;
  const ctx = await browser.newContext({ storageState: state, viewport: { width: w, height: h }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light" });
  await ctx.addInitScript((d) => { try { localStorage.setItem("clausia-theme", d ? "dark" : "light"); } catch { /* none */ } }, dark);
  const page = await ctx.newPage();
  await page.addInitScript(() => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s)); });
  // the form is opened but never saved: a POST carrying the form's fields would be a save
  page.on("request", (r) => { if (r.method() === "POST" && /hearing_id/.test(r.postData() ?? "")) posts.push(r.url()); });
  return [ctx, page];
}
async function go(page: Page, path: string, ready: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 120_000 });
  await page.waitForSelector(ready, { timeout: 90_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` });
const problems: string[] = [];
const fitsAcross = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && ![...document.querySelectorAll("main section[aria-label], main dl")].some((e) => e.scrollWidth > e.clientWidth + 1));

try {
  for (const dark of [false, true]) {
    const t = dark ? "dark" : "light";
    for (const [w, h] of SIZES) {
      const [ctx, page] = await ctxOf(w, h, dark);
      const tag = `${w}-${t}`;

      // 1) the agenda's day
      await go(page, `/agenda?view=day&date=${DAY}`, "main section[aria-label] h3");
      await shot(page, `agenda-${tag}`);
      if (w >= 1280) {
        const chat = await page.locator('aside[aria-label="محادثة Clausia"]').evaluate((e) => Math.round(e.getBoundingClientRect().width));
        const side = await page.locator("nav[aria-label='القائمة']").evaluate((e) => Math.round(e.getBoundingClientRect().width));
        const want = w >= 1441 ? [288, 560] : [72, 480];
        const ok = side === want[0] && chat === want[1];
        console.log(`${ok ? "ok  " : "WARN"} ${tag}: sidebar ${side}, chat ${chat} (want ${want.join(" / ")})`);
        if (!ok) problems.push(`${tag}: widths ${side}/${chat}, want ${want.join("/")}`);
      }
      if (!(await fitsAcross(page))) problems.push(`${tag}: the agenda scrolls or clips sideways`);

      // 2) the «محتاجة قرار» tab
      await go(page, "/agenda?tab=decide", "nav[aria-label='أقسام الأجندة']");
      const rows = page.locator('main section[aria-label="جلسات محتاجة قرار"] > ul > li');
      const n = await rows.count();
      const pill = await page.locator("nav[aria-label='أقسام الأجندة'] a >> nth=1").innerText();
      console.log(`ok   ${tag}: the tab lists ${n} rows; tab text «${pill.replace(/\s+/g, " ")}»`);
      await shot(page, `decide-${tag}`);
      if (!(await fitsAcross(page))) problems.push(`${tag}: the tab scrolls or clips sideways`);

      // 3) the inline form, opened (never saved); تأجيل chosen so the date field shows
      if (n > 0) {
        await rows.first().getByRole("button", { name: /سجّل القرار/ }).click();
        const form = rows.first().locator("form");
        await form.waitFor();
        await form.getByRole("radio", { name: "تأجيل", exact: true }).click();
        await page.waitForTimeout(300);
        await shot(page, `decide-form-${tag}`);
      } else {
        problems.push(`${tag}: no undecided hearing to open the form on`);
      }

      // 4) the empty state (MOCKED: the temporary page)
      await go(page, PREVIEW_PATH, "nav[aria-label='أقسام الأجندة']");
      const empty = (await page.locator("main").innerText()).includes("كل القرارات متسجلة ✓");
      if (!empty) problems.push(`${tag}: the empty state did not show (is the app running from this folder?)`);
      await shot(page, `decide-empty-${tag}`);

      // 5) the case page's header
      await go(page, `/cases/${CASE_ID}${w < 600 ? "?sheet=1" : ""}`, "main dl > div");
      const cells = await page.locator("main dl").first().evaluate((dl) => ({ n: dl.children.length, fits: dl.scrollWidth <= dl.clientWidth + 1 }));
      console.log(`${cells.n === 8 && cells.fits ? "ok  " : "WARN"} ${tag}: case header ${cells.n} cells, fits ${cells.fits}`);
      if (cells.n !== 8 || !cells.fits) problems.push(`${tag}: the case header has ${cells.n} cells, fits ${cells.fits}`);
      if (!(await fitsAcross(page))) problems.push(`${tag}: the case page scrolls or clips sideways`);
      await shot(page, `case-header-${tag}`);

      await ctx.close();
    }
  }
  if (posts.length) problems.push(`a form was SAVED during the run (${posts.length} POST with the form's fields): ${posts.join(", ")}`);
} finally {
  await browser.close();
  removePreview();
}
console.log(existsSync(PREVIEW_FILE) ? "WARN the temporary preview page is still there" : "the temporary preview page is deleted");
console.log(problems.length ? `\n${problems.length} problem(s):\n- ${problems.join("\n- ")}` : `\nall ${SIZES.length * 2 * 5} shots taken → ${OUT}/, no problems`);
process.exit(problems.length ? 1 : 0);
