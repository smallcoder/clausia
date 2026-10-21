// Owner decisions, Chat: shoots the pending thread before and after «عدّل», and /chat, at 1440×960 and 390×844, light
// and dark → screenshots/d-chat/<view>-<scheme>-<kind>.png, and checks (without deciding anything) that every decision
// mode is reachable: confirm-all («احفظ … · N»), one row («احفظ ده» in a row's expand), save as suggestions and reject
// all (the footer's second line, only after «عدّل»). Never taps a decision button.
// Logs in ONCE and reuses the storage state. Needs the app running (SHOT_BASE, default http://localhost:3504).
// Run: npx tsx --env-file=.env.local scripts/d-chat-shots.ts <pendingThreadId>
import { chromium, type Locator, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [pendingId] = process.argv.slice(2);
const BASE = process.env.SHOT_BASE ?? "http://localhost:3504";
mkdirSync("screenshots/d-chat", { recursive: true });
const state = join(process.env.SHOT_STATE_DIR ?? tmpdir(), "clausia-d-chat-state.json");
const browser = await chromium.launch();
const fails: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) fails.push(what); };

if (!process.env.SHOT_REUSE || !existsSync(state)) {
  const login = await browser.newContext({ locale: "ar-EG", timezoneId: "Africa/Cairo" });
  const page = await login.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await page.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }), page.click('button:has-text("دخول")')]);
  await login.storageState({ path: state });
  await login.close();
}

const visible = async (l: Locator) => (await l.count()) > 0 && (await l.first().isVisible());
const btn = (scope: Page | Locator, name: string | RegExp) => scope.getByRole("button", { name, exact: typeof name === "string" });

async function full(page: Page, path: string) {
  const vp = page.viewportSize()!;
  const sh = await page.evaluate("document.documentElement.scrollHeight") as number;
  await page.setViewportSize({ width: vp.width, height: Math.max(sh, vp.height) });
  await page.waitForTimeout(400);
  await page.screenshot({ path });
  await page.setViewportSize(vp);
}

for (const scheme of ["light", "dark"] as const) for (const kind of ["desktop", "mobile"] as const) {
  const mobile = kind === "mobile";
  const tag = `${scheme}-${kind}`;
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 }, deviceScaleFactor: 2,
    locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: scheme, storageState: state,
  });
  const page = await ctx.newPage();

  // the pending thread, before «عدّل»
  await page.goto(`${BASE}/chat/${pendingId}`, { waitUntil: "load" });
  if (page.url().includes("/login")) throw new Error("not logged in");
  await page.waitForTimeout(900);
  const edit = btn(page, "عدّل").first();
  await edit.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `screenshots/d-chat/pending-${tag}.png` });
  await full(page, `screenshots/d-chat/pending-${tag}-full.png`);
  check(await visible(btn(page, /^احفظ (الملف )?· /)), `${tag}: confirm-all «احفظ … · N» shown`);
  check(await btn(page, /^احفظ (الملف )?· /).first().isEnabled(), `${tag}: confirm-all enabled`);
  check(!(await visible(btn(page, "احفظ كمقترحات"))), `${tag}: «احفظ كمقترحات» hidden before «عدّل»`);
  check(!(await visible(btn(page, "ارفض الكل"))), `${tag}: «ارفض الكل» hidden before «عدّل»`);

  // one row, without «عدّل»: tap a row → its own «احفظ ده» / «ارفض» (then close it again)
  const row = page.locator('button[aria-expanded="false"][title="اعرض التفاصيل"]').first();
  await row.click();
  await page.waitForTimeout(250);
  check(await visible(btn(page, "احفظ ده")), `${tag}: one row «احفظ ده» reachable by tapping a row`);
  check(!(await visible(btn(page, "احفظ كمقترحات"))), `${tag}: second line still hidden with one row open`);
  await page.locator('button[aria-expanded="true"][title="اقفل التفاصيل"]').first().click();
  await page.waitForTimeout(250);

  // after «عدّل»: desktop expands the rows in place, mobile opens the sheet
  await edit.click();
  await page.waitForTimeout(700);
  const scope: Page | Locator = mobile ? page.getByRole("dialog") : page;
  if (mobile) check(await visible(page.getByRole("dialog")), `${tag}: «عدّل» opens the sheet`);
  const sugg = btn(scope, "احفظ كمقترحات");
  check(await visible(sugg), `${tag}: «احفظ كمقترحات» shown after «عدّل»`);
  check(await visible(btn(scope, "ارفض الكل")), `${tag}: «ارفض الكل» shown after «عدّل»`);
  check(await visible(btn(scope, /^احفظ (الملف )?· /)), `${tag}: confirm-all still shown after «عدّل»`);
  check((await btn(scope, "احفظ ده").count()) > 0, `${tag}: per-row «احفظ ده» shown after «عدّل»`);
  await sugg.first().evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `screenshots/d-chat/pending-${tag}-edit.png` });
  if (!mobile) await full(page, `screenshots/d-chat/pending-${tag}-edit-full.png`);
  // «اقفل» hides the second line again (desktop / in the sheet)
  await btn(scope, "اقفل").first().click();
  await page.waitForTimeout(300);
  check(!(await visible(btn(scope, "احفظ كمقترحات"))), `${tag}: «اقفل» hides the second line again`);

  // /chat (the thread's style)
  await page.goto(`${BASE}/chat`, { waitUntil: "load" });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `screenshots/d-chat/list-${tag}.png` });
  await full(page, `screenshots/d-chat/list-${tag}-full.png`);
  check(await visible(page.getByRole("textbox", { name: "رسالة لـ Clausia" })), `${tag}: /chat has the thread's two-row composer`);
  check(await visible(page.locator('label[for="file-new"]')), `${tag}: /chat composer has attach`);

  // no mic anywhere in chat
  for (const p of [`/chat/${pendingId}`, "/chat"]) {
    await page.goto(`${BASE}${p}`, { waitUntil: "load" });
    const mic = await page.locator('[aria-label*="صوت"], [aria-label*="ميكروفون"], [aria-label*="تسجيل"], [title*="صوت"], svg.lucide-mic').count();
    check(mic === 0, `${tag}: no mic on ${p}`);
  }
  await ctx.close();
}
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nall checks passed");
process.exit(fails.length ? 1 : 0);
