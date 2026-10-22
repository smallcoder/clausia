// The brief page and the bell, in a real browser against a running server, logged in as the demo user.
//   - /brief draws the title and the chips; the memo chip opens that case's chat with the sentence in the box and SENDS NOTHING
//   - the WhatsApp chip is a wa.me link in a new tab; tapping it sends nothing (no message is saved by Clausia)
//   - the reminder chip saves a row for 07:00 Cairo, shows «تراجع», and the undo deletes the row («اتلغى»)
//   - the bell: nothing at 19:59 Cairo, «تحضير جلسات بكرة جاهز» at 20:00; ONE browser notification a day (also after a reload);
//     browser permission is NOT asked on page load, only when the bell is tapped; opening /brief clears the dot
//   The clock of the browser is faked (Playwright); the server's clock is the real one.
// Run: npx tsx --env-file=.env.local scripts/test-brief-live.ts [baseUrl]   (default http://localhost:4400)
import { chromium, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] ?? "http://localhost:4400";
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const { error: authErr } = await db.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
if (authErr) throw new Error(`demo login: ${authErr.message}`);
const count = async (t: "chat_messages" | "reminders") => (await db.from(t).select("id", { count: "exact", head: true })).count ?? 0;

const browser = await chromium.launch();
const login = await browser.newContext({ locale: "ar-EG", timezoneId: "Africa/Cairo" });
{
  const p = await login.newPage();
  await p.goto(`${BASE}/login`);
  await p.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await p.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), p.click('button:has-text("دخول")')]);
}
const state = await login.storageState();
await login.close();
const newCtx = (): Promise<BrowserContext> => browser.newContext({ storageState: state, viewport: { width: 1920, height: 1080 }, locale: "ar-EG", timezoneId: "Africa/Cairo" });

/** a Notification that records what was shown and how often permission was asked */
const STUB = (perm: string) => `
  window.__asked = 0; // (the notes are kept in sessionStorage, so a reload does not forget them)
  class N { constructor(t, o) { const n = JSON.parse(sessionStorage.getItem('__notes') || '[]'); n.push([t, o && o.body]); sessionStorage.setItem('__notes', JSON.stringify(n)); }
    static get permission() { return window.__perm; }
    static requestPermission() { window.__asked++; window.__perm = 'granted'; return Promise.resolve('granted'); } }
  window.__perm = ${JSON.stringify(perm)};
  window.Notification = N;`;

// ---------- the page, the chips ----------
{
  const ctx = await newCtx();
  const page = await ctx.newPage();
  await page.addInitScript(STUB("default"));
  await page.goto(`${BASE}/brief`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(800);
  check("the page has its big title", (await page.locator("h1").innerText()).startsWith("تحضير جلسات"));
  check("permission is not asked on page load", (await page.evaluate(() => (window as unknown as { __asked: number }).__asked)) === 0);
  const placeholder = await page.locator("textarea").first().getAttribute("placeholder");
  check("the composer says «اسأل عن جلسات …»", !!placeholder?.startsWith("اسأل عن جلسات"), placeholder ?? "");

  const wa = page.locator('a:has-text("ابعت الملخص ده واتساب")');
  const href = (await wa.getAttribute("href")) ?? "";
  check("WhatsApp chip: a wa.me link in a new tab", href.startsWith("https://wa.me/?text=") && (await wa.getAttribute("target")) === "_blank" && /noopener/.test((await wa.getAttribute("rel")) ?? ""));
  check("WhatsApp text is the summary (heading first)", decodeURIComponent(href.slice(href.indexOf("=") + 1)).startsWith("تحضير جلسات"));

  const memo = page.locator('a:has-text("اكتبلي مذكرة الدفاع لقضية")');
  const memoText = (await memo.first().innerText()).trim();
  const before = await count("chat_messages");
  await memo.first().click();
  await page.waitForURL(/\/chat\//, { timeout: 30_000 });
  await page.waitForTimeout(800);
  const box = page.locator("textarea").last();
  check("the memo chip opens the case chat with the sentence in the box", (await box.inputValue()) === memoText, `${await box.inputValue()} / ${memoText}`);
  check("…and sends nothing", (await count("chat_messages")) === before);

  // the reminder: set → undo
  await page.goto(`${BASE}/brief`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(800);
  const rBefore = await count("reminders");
  await page.click('button:has-text("ذكّرني الصبح 7")');
  await page.waitForSelector("text=تراجع", { timeout: 15_000 });
  const { data: rows } = await db.from("reminders").select("for_date, remind_at").order("created_at", { ascending: false }).limit(1);
  check("the reminder chip saves one row", (await count("reminders")) === rBefore + 1);
  const at = rows?.[0] ? new Date(rows[0].remind_at) : null;
  check("…for 07:00 Cairo of the hearings day", !!at && new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at) === "07:00");
  await page.click('button:has-text("تراجع")');
  await page.waitForSelector("text=اتلغى", { timeout: 15_000 });
  check("undo («اتلغى») deletes the row", (await count("reminders")) === rBefore);
  await ctx.close();
}

// ---------- the bell ----------
const LABEL = "text=تحضير جلسات بكرة جاهز";
async function bell(time: string, perm: string) {
  const ctx = await newCtx();
  const page = await ctx.newPage();
  await page.addInitScript(STUB(perm));
  await page.clock.install({ time: new Date(time) });
  await page.goto(`${BASE}/hearings`, { waitUntil: "load", timeout: 60_000 });
  await page.clock.runFor(1500);
  return { ctx, page };
}
const notes = (page: import("@playwright/test").Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('__notes') || '[]').length as number);
{
  // 19:59:30 Cairo (UTC+3 on 23/10/2026): nothing; a minute later: it is 20:00
  const { ctx, page } = await bell("2026-10-23T16:59:30Z", "granted");
  check("19:59 Cairo: no brief label", (await page.locator(LABEL).count()) === 0);
  await page.clock.runFor(60_000);
  await page.waitForSelector(LABEL, { timeout: 10_000 }).catch(() => {});
  check("20:00 Cairo: «تحضير جلسات بكرة جاهز» in the top bar", (await page.locator(LABEL).count()) > 0);
  check("…and one browser notification", (await notes(page)) === 1);
  await page.clock.runFor(180_000);
  check("…not another one a few minutes later", (await notes(page)) === 1);
  await page.reload({ waitUntil: "load" });
  await page.clock.runFor(1500);
  check("…nor after a reload (remembered per user)", (await notes(page)) === 1);
  await page.locator(LABEL).first().click();
  await page.waitForURL(/\/brief/, { timeout: 30_000 });
  await page.clock.runFor(61_000);
  await page.waitForSelector(LABEL, { state: "detached", timeout: 10_000 }).catch(() => {});
  check("opening the brief clears the label", (await page.locator(LABEL).count()) === 0);
  await ctx.close();
}
{
  // permission not yet answered: no pop-up, nothing asked on load; the bell tap asks
  const { ctx, page } = await bell("2026-10-23T18:00:00Z", "default");
  await page.waitForSelector(LABEL, { timeout: 10_000 }).catch(() => {});
  check("21:00, permission not given: the label shows, no notification, nothing asked on load",
    (await page.locator(LABEL).count()) > 0 && (await notes(page)) === 0 && (await page.evaluate(() => (window as unknown as { __asked: number }).__asked)) === 0);
  await page.locator('header a[aria-label="تحضير جلسات بكرة جاهز"]').click();
  await page.waitForTimeout(500);
  check("tapping the bell asks for permission", (await page.evaluate(() => (window as unknown as { __asked: number }).__asked)) === 1);
  await ctx.close();
}
{
  // after midnight Cairo the evening brief is over
  const { ctx, page } = await bell("2026-10-23T21:30:00Z", "granted");
  check("00:30 Cairo: no evening label", (await page.locator(LABEL).count()) === 0);
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
