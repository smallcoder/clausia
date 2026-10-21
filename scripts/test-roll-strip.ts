// The roll's continuous day strip (owner request 2026-10-21), against a running server, logged in as the demo user.
// Reads the demo hearings (publishable key + demo login, read-only) to pick the days and Fridays it checks.
// Run: npx tsx --env-file=.env.local scripts/test-roll-strip.ts [baseUrl]   (default http://localhost:3100)
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] ?? "http://localhost:3100";
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

// ---- dates ---------------------------------------------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, "0");
const add = (iso: string, n: number) => { const [y, m, d] = iso.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
const wd = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const sat = (iso: string) => add(iso, -((wd(iso) + 1) % 7));
const dmy = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d}/${m}/${y}`; };
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function hearingDays() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { error } = await db.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
  if (error) throw new Error(`demo login: ${error.message}`);
  const { data } = await db.from("hearings").select("hearing_date").neq("review_status", "rejected");
  const m = new Map<string, number>();
  for (const r of data ?? []) m.set(r.hearing_date, (m.get(r.hearing_date) ?? 0) + 1);
  return m;
}

// ---- browser helpers -----------------------------------------------------------------------------------------------
async function login(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await page.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { waitUntil: "commit", timeout: 60_000 }), page.click('button:has-text("دخول")')]);
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

/** counts navigations: document loads and RSC (server component) fetches; server-action POSTs are the data loader */
function watchNav(page: Page) {
  const n = { count: 0, urls: [] as string[] };
  page.on("request", (r) => {
    const rsc = r.url().includes("_rsc=") || (r.headers()["rsc"] === "1" && !r.headers()["next-action"]);
    if ((r.resourceType() === "document" && r.frame() === page.mainFrame()) || rsc) { n.count++; n.urls.push(r.url()); }
  });
  return n;
}

const urlDate = (page: Page) => new URL(page.url()).searchParams.get("date");
const selected = (page: Page) => page.evaluate(() => document.querySelector<HTMLElement>('[data-day][aria-current="date"]')?.dataset.day ?? null);
const shownDay = (page: Page) => page.evaluate(() => document.querySelector<HTMLElement>("[data-roll-day]:not([inert])")?.dataset.rollDay ?? null);
/** the start-most tile in view and its distance from the strip's start edge (scroll-padding included) */
const firstInView = (page: Page) => page.evaluate(() => {
  const sc = document.querySelector<HTMLElement>("[data-roll-scroller]")!;
  const r = sc.getBoundingClientRect();
  const ps = parseFloat(getComputedStyle(sc).scrollPaddingInlineStart) || 0;
  const start = r.right - ps;
  const t = [...document.querySelectorAll<HTMLElement>("[data-day]")].find((el) => { const q = el.getBoundingClientRect(); return (q.left + q.right) / 2 < start; })!;
  return { day: t.dataset.day!, off: t.getBoundingClientRect().right - start, x: t.getBoundingClientRect().left };
});
const inView = (page: Page, iso: string) => page.evaluate((d) => {
  const sc = document.querySelector<HTMLElement>("[data-roll-scroller]")!.getBoundingClientRect();
  const el = document.querySelector<HTMLElement>(`[data-day="${d}"]`);
  if (!el) return false;
  const q = el.getBoundingClientRect();
  return q.left >= sc.left - 1 && q.right <= sc.right + 1;
}, iso);
const tile = (page: Page, iso: string) => page.locator(`[data-day="${iso}"]`);
const chip = (page: Page) => page.getByRole("button", { name: "النهارده", exact: true });

async function open(ctx: BrowserContext, path: string) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check(`no page error (${e.message.slice(0, 80)})`, false));
  await page.goto(BASE + path, { waitUntil: "load" });
  if (page.url().includes("/login")) throw new Error("not logged in");
  await page.waitForTimeout(800);
  return page;
}

async function main() {
  const counts = await hearingDays();
  const browser = await chromium.launch();
  const state = await login(browser);
  const ctxOpts = { storageState: state, locale: "ar-EG", timezoneId: "Africa/Cairo" } as const;
  const desktop = await browser.newContext({ ...ctxOpts, viewport: { width: 1440, height: 960 } });

  // ---- first paint (before hydration): the chosen week's Saturday sits at the strip's start ---------------------------
  {
    const ctx = await browser.newContext({ ...ctxOpts, viewport: { width: 1440, height: 960 } });
    const page = await ctx.newPage();
    // no app bundles → no hydration; the inline streaming scripts still put the server HTML in place
    await page.route(/\/_next\/static\/chunks\//, (r) => r.abort());
    await page.goto(`${BASE}/hearings?view=day&date=${dmy(today)}`, { waitUntil: "load" });
    await page.waitForSelector("[data-day]", { state: "visible", timeout: 15_000 });
    const f = await firstInView(page);
    check("SSR first paint: the chosen week's Saturday at the start edge", f.day === sat(today) && Math.abs(f.off) < 2, JSON.stringify(f));
    check("SSR first paint: the chosen day is selected", (await selected(page)) === today);
    await ctx.close();
  }

  const page = await open(desktop, `/hearings?view=day&date=${dmy(today)}`);
  const nav = watchNav(page);
  {
    const f = await firstInView(page);
    check("after hydration: still the same week at the start (nothing jumped)", f.day === sat(today) && Math.abs(f.off) < 2, JSON.stringify(f));
    check("month label above the strip", /\S+ \d{4}/.test((await page.locator("[data-roll-month]").innerText()).trim()));
    check("no «النهارده» chip while today is in view", (await chip(page).count()) === 0);
  }

  // ---- tap selects a day: the hearings change at once, the URL follows, no navigation ---------------------------------
  const wk = sat(today);
  const weekDays = Array.from({ length: 7 }, (_, i) => add(wk, i)).filter((d) => d !== today && (wd(d) !== 5 || counts.get(d)));
  const target = weekDays.find((d) => (counts.get(d) ?? 0) !== (counts.get(today) ?? 0)) ?? weekDays[0];
  {
    const before = await page.locator("[data-roll-day]").first().innerText();
    await tile(page, target).click();
    await page.waitForTimeout(40);
    check("tap: the new day's hearings are on screen within 40ms (no round-trip)", (await shownDay(page)) === target, String(await shownDay(page)));
    await page.waitForTimeout(400);
    check("tap: the tile is selected", (await selected(page)) === target);
    check("tap: ?date= updated", urlDate(page) === dmy(target), page.url());
    const after = await page.locator("[data-roll-day]").first().innerText();
    check("tap: the hearings below changed", after !== before);
    check("tap: one content layer left after the crossfade", (await page.locator("[data-roll-day]").count()) === 1 && (await page.locator(".roll-out").count()) === 0);
    const pill = await page.evaluate((d) => {
      const p = document.querySelector<HTMLElement>("[data-roll-scroller] span[aria-hidden].absolute")!.getBoundingClientRect();
      const t = document.querySelector<HTMLElement>(`[data-day="${d}"]`)!.getBoundingClientRect();
      return Math.abs(p.left - t.left) + Math.abs(p.width - t.width);
    }, target);
    check("tap: the selected pill sits under the new tile", pill < 2, String(pill));
  }

  // ---- next button: one week, no navigation -------------------------------------------------------------------------
  {
    const f0 = await firstInView(page);
    const url0 = page.url();
    await page.getByRole("button", { name: "الأسبوع الجاي" }).click();
    await page.waitForTimeout(90);
    const mid = await firstInView(page);
    await page.waitForTimeout(600);
    const f1 = await firstInView(page);
    const same = (a: typeof f0, b: typeof f0) => a.day === b.day && Math.abs(a.off - b.off) < 1;
    check("next: the strip moves smoothly (mid-way after 90ms)", !same(mid, f0) && !same(mid, f1), JSON.stringify(mid));
    check("next: next week's Saturday lands at the start", f1.day === add(sat(f0.day), 7) && Math.abs(f1.off) < 2, JSON.stringify(f1));
    check("next: URL and selection unchanged", page.url() === url0 && (await selected(page)) === target);
    await page.getByRole("button", { name: "الأسبوع اللي فات" }).click();
    await page.waitForTimeout(600);
    const f2 = await firstInView(page);
    check("prev: back to the first week", f2.day === sat(f0.day) && Math.abs(f2.off) < 2, JSON.stringify(f2));
  }

  // ---- keyboard: ArrowLeft = next day, ArrowRight = previous day -----------------------------------------------------
  {
    const days = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-day]")].map((e) => e.dataset.day!));
    const i = days.indexOf(target);
    await tile(page, target).focus();
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(350);
    check("ArrowLeft → next day selected", (await selected(page)) === days[i + 1], `${await selected(page)} vs ${days[i + 1]}`);
    const focus = await page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.day ?? null);
    check("ArrowLeft → focus moves with it (roving tabindex)", focus === days[i + 1] && (await tile(page, days[i + 1]).getAttribute("tabindex")) === "0");
    check("ArrowLeft → focus ring visible", await page.evaluate(() => document.activeElement?.matches(":focus-visible") ?? false));
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(350);
    check("ArrowRight → previous day selected", (await selected(page)) === target);
    check("keyboard: URL follows", urlDate(page) === dmy(target), page.url());
  }

  // ---- «النهارده» chip --------------------------------------------------------------------------------------------
  {
    for (let i = 0; i < 2; i++) { await page.getByRole("button", { name: "الأسبوع الجاي" }).click(); await page.waitForTimeout(450); }
    check("chip appears when today is scrolled away", await chip(page).isVisible());
    await chip(page).click();
    await page.waitForTimeout(600);
    check("chip: today selected and back in view", (await selected(page)) === today && (await inView(page, today)) && urlDate(page) === dmy(today));
    check("chip: gone again", (await chip(page).count()) === 0);
  }

  // ---- back / forward ------------------------------------------------------------------------------------------------
  {
    const a = today, b = target;
    const c = weekDays.find((d) => d !== b) ?? add(today, 1);
    await tile(page, b).click(); await page.waitForTimeout(300);
    await tile(page, c).click(); await page.waitForTimeout(300);
    await page.goBack(); await page.waitForTimeout(500);
    check("back → previous day restored", (await selected(page)) === b && (await shownDay(page)) === b && urlDate(page) === dmy(b), `${await selected(page)} ${page.url()}`);
    await page.goBack(); await page.waitForTimeout(500);
    check("back again → the day before", (await selected(page)) === a && (await shownDay(page)) === a, String(await selected(page)));
    await page.goForward(); await page.waitForTimeout(500);
    check("forward → next day restored", (await selected(page)) === b && (await shownDay(page)) === b, String(await selected(page)));
  }
  check("no navigation or server-component fetch during any of the above", nav.count === 0, nav.urls.join(", "));

  // ---- mouse drag scrolls and does not select ------------------------------------------------------------------------
  {
    const f0 = await firstInView(page);
    const sel0 = await selected(page);
    const box = (await page.locator("[data-roll-scroller]").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2 - 150, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 - 150 + i * 40, box.y + box.height / 2);
    await page.mouse.up();
    await page.waitForTimeout(500);
    const f1 = await firstInView(page);
    check("mouse drag scrolls the strip and settles on a day", f1.day !== f0.day && Math.abs(f1.off) < 2, JSON.stringify(f1));
    check("mouse drag does not select the day it ends on", (await selected(page)) === sel0);
  }

  // ---- far weeks: counts load ahead and nothing in view moves when they arrive ----------------------------------------
  {
    const far = add(sat(today), 7 * 12);
    await page.evaluate((d) => document.querySelector<HTMLElement>(`[data-day="${d}"]`)!.scrollIntoView({ inline: "start", block: "nearest", behavior: "instant" }), far);
    await page.waitForTimeout(50);
    const f0 = await firstInView(page);
    await page.waitForTimeout(2500);
    const f1 = await firstInView(page);
    check("far week: the view stays still while counts load", f0.day === f1.day && Math.abs(f0.x - f1.x) < 1, `${JSON.stringify(f0)} → ${JSON.stringify(f1)}`);
    const want = Array.from({ length: 7 }, (_, i) => add(far, i)).filter((d) => wd(d) !== 5).map((d) => counts.get(d) ?? 0);
    const got = await page.evaluate((d) => [0, 1, 2, 3, 4, 6].map((i) => { const [y, m, dd] = d.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, dd + i)); const iso = t.toISOString().slice(0, 10); return document.querySelectorAll(`[data-day="${iso}"] > span[aria-hidden] > span`).length; }), far);
    check("far week: its dots match the database", JSON.stringify(got) === JSON.stringify(want.map((n) => Math.min(n, 6))), `${got} vs ${want}`);
  }

  // ---- Friday ------------------------------------------------------------------------------------------------------
  {
    // Fridays with a hearing: one near today (in the first render's ±3 weeks) and the farthest one in the past ≤ 20 weeks
    const fridays = [...counts.keys()].filter((d) => wd(d) === 5 && d < add(sat(today), 7 * 4) && d >= add(sat(today), -7 * 20)).sort();
    const near = fridays.filter((d) => d >= add(sat(today), -7 * 3)).pop();
    const far = fridays.find((d) => d < add(sat(today), -7 * 5));
    let without = add(sat(today), 6);
    while (counts.get(without)) without = add(without, 7);
    const p2 = await open(desktop, `/hearings?view=day&date=${dmy(today)}`);
    if (near) check(`Friday ${near} (has a hearing) is shown`, (await tile(p2, near).count()) === 1);
    else console.log("SKIP  no Friday hearing within ±3 weeks in the demo data");
    check(`Friday ${without} (no hearing) is hidden`, (await tile(p2, without).count()) === 0);
    if (far) {
      // step back week by week: when the far Friday's week first comes into view, its Friday must already be there
      let seen: boolean | null = null;
      for (let i = 0; i < 20 && seen === null; i++) {
        await p2.getByRole("button", { name: "الأسبوع اللي فات" }).click();
        await p2.waitForTimeout(420);
        const weekInView = await p2.evaluate(([lo, hi]) => {
          const sc = document.querySelector<HTMLElement>("[data-roll-scroller]")!.getBoundingClientRect();
          return [...document.querySelectorAll<HTMLElement>("[data-day]")].some((el) => {
            const q = el.getBoundingClientRect();
            return el.dataset.day! >= lo && el.dataset.day! <= hi && q.right > sc.left && q.left < sc.right;
          });
        }, [sat(far), add(sat(far), 6)]);
        if (weekInView) seen = (await tile(p2, far).count()) === 1;
      }
      check(`far Friday ${far}: loaded before its week scrolled into view`, seen === true, String(seen));
    }
    await p2.close();
    const p3 = await open(desktop, `/hearings?view=day&date=${dmy(without)}`);
    check("a Friday chosen by ?date= is shown and selected", (await selected(p3)) === without);
    await p3.close();
  }

  // ---- ?view=week and ?filter=undecided still work ------------------------------------------------------------------
  {
    const p4 = await open(desktop, `/hearings?view=week&date=${dmy(today)}`);
    check("?view=week: the week list, no selected pill", (await p4.locator('a[aria-current="page"]', { hasText: "جلسات الأسبوع" }).count()) === 1 && (await selected(p4)) === null);
    await p4.close();
    const p5 = await open(desktop, "/hearings?filter=undecided");
    check("?filter=undecided: «محتاجة قرار»", (await p5.locator("h1").innerText()).includes("محتاجة قرار"));
    await p5.close();
  }
  await desktop.close();

  // ---- reduced motion: instant --------------------------------------------------------------------------------------
  {
    const ctx = await browser.newContext({ ...ctxOpts, viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
    const p = await open(ctx, `/hearings?view=day&date=${dmy(today)}`);
    const f0 = await firstInView(p);
    await p.getByRole("button", { name: "الأسبوع الجاي" }).click();
    await p.waitForTimeout(30);
    const f1 = await firstInView(p);
    check("reduced motion: next is instant", f1.day === add(sat(f0.day), 7) && Math.abs(f1.off) < 2, JSON.stringify(f1));
    await p.getByRole("button", { name: "الأسبوع اللي فات" }).click();
    await p.waitForTimeout(30);
    await tile(p, target).click();
    await p.waitForTimeout(20);
    check("reduced motion: the day changes with no crossfade layer", (await p.locator(".roll-out, .roll-in").count()) === 0 && (await shownDay(p)) === target);
    await ctx.close();
  }

  // ---- mobile: touch scroll moves the strip, a tap selects ---------------------------------------------------------
  {
    const ctx = await browser.newContext({ ...ctxOpts, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await open(ctx, `/hearings?view=day&date=${dmy(today)}`);
    check("mobile: no week buttons", !(await p.getByRole("button", { name: "الأسبوع الجاي" }).isVisible()));
    await tile(p, target).tap();
    await p.waitForTimeout(400);
    check("mobile: tap selects", (await selected(p)) === target && urlDate(p) === dmy(target));
    await ctx.close();
  }

  await browser.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASS");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
