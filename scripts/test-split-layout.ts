// The chat-first split layout, against a running server (default http://localhost:4500), logged in as the demo user. NO model call:
// the sessions it needs are made with the demo login (RLS client) and removed again at the end.
// Checks: one composer on every page; the chat panel's width at 1440 / 1920 and full screen below 1280; the context (case vs general)
// and its sessions only; ?hearing= opens that hearing's session; the old URLs (/chat, /chat/<id>, ?tab=chat) still land; the phone's sheet
// (closed on Home and a case, open on the Roll, «افتح» opens, «رجوع للشات» closes) and the two-step context picker; the draft survives a page change.
// Run: npx tsx --env-file=.env.local scripts/test-split-layout.ts [baseUrl]
import { chromium, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] ?? "http://localhost:4500";
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const { error: le } = await db.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
if (le) throw new Error(`demo login: ${le.message}`);
const { data: c } = await db.from("cases").select("id, case_number").eq("case_number", "772").limit(1).maybeSingle();
const { data: otherCase } = await db.from("cases").select("id").neq("id", c!.id).limit(1).maybeSingle();
const { data: h } = await db.from("hearings").select("id, hearing_date").eq("case_id", c!.id).order("hearing_date", { ascending: false }).limit(1).maybeSingle();
if (!c || !h || !otherCase) throw new Error("demo data: case 772 with a hearing and a second case are needed");
const caseId = c.id;

// ---- sessions made without the model (a user + an assistant row each) ----
const made: string[] = [];
async function session(o: { caseId?: string; hearingId?: string; title: string }) {
  const { data: t, error } = await db.from("chat_threads").insert({ case_id: o.caseId ?? null, hearing_id: o.hearingId ?? null, title: o.title }).select("id").single();
  if (error || !t) throw new Error(`thread: ${error?.message}`);
  made.push(t.id);
  await db.from("chat_messages").insert([{ thread_id: t.id, role: "user", content: o.title }, { thread_id: t.id, role: "assistant", content: "تمام، مسجّلها." }]);
  return t.id;
}
const caseOld = await session({ caseId, title: "اختبار-تقسيم: جلسة قضية أقدم" });
const caseNew = await session({ caseId, title: "اختبار-تقسيم: جلسة قضية أحدث" });
const hearingS = await session({ caseId, hearingId: h.id, title: "اختبار-تقسيم: جلسة مرتبطة" });
const general = await session({ title: "اختبار-تقسيم: محادثة عامة" });
await db.from("chat_threads").update({ updated_at: "2026-01-01T10:00:00Z" }).eq("id", caseOld);
await db.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", caseNew);
await db.from("chat_threads").update({ updated_at: "2026-01-02T10:00:00Z" }).eq("id", hearingS);

async function login(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await page.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { waitUntil: "commit", timeout: 90_000 }), page.click('button:has-text("دخول")')]);
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

const box = (page: Page, sel: string) => page.locator(sel).first().boundingBox();
const visible = (page: Page, sel: string) => page.locator(sel).first().isVisible();

const browser = await chromium.launch();
try {
  const state = await login(browser);
  const open = async (w: number, hgt: number) => {
    const ctx = await browser.newContext({ storageState: state, viewport: { width: w, height: hgt }, locale: "ar-EG", timezoneId: "Africa/Cairo" });
    return { ctx, page: await ctx.newPage() };
  };
  const go = async (page: Page, path: string) => { await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 90_000 }); await page.waitForSelector('aside[aria-label="محادثة Clausia"]'); await page.waitForTimeout(400); };

  // ---------- desktop ----------
  {
    const { ctx, page } = await open(1920, 1080);
    for (const p of ["/", "/hearings", "/cases", `/cases/${caseId}`, `/cases/${caseId}?tab=hearings`, "/brief"]) {
      await go(page, p);
      check(`one composer (one text box) on ${p}`, (await page.locator("textarea").count()) === 1, `${await page.locator("textarea").count()} text boxes`);
    }
    await go(page, `/cases/${caseId}`);
    const aside = await box(page, 'aside[aria-label="محادثة Clausia"]');
    check("1920: the chat panel is 760 wide", !!aside && Math.abs(aside.width - 760) <= 1, `${aside?.width}`);
    check("1920: the frame is 1760 centered (panel starts at 80)", !!aside && Math.abs(aside.x - 80) <= 1, `${aside?.x}`);
    check("the panel is on the left (the end side in RTL)", !!aside && aside.x < 960);
    const hdr = await box(page, "header");
    check("the top bar is above the page only (it starts right of the chat)", !!hdr && !!aside && hdr.x >= aside.x + aside.width, `${hdr?.x}`);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(1440, 900);
    await go(page, "/");
    const aside = await box(page, 'aside[aria-label="محادثة Clausia"]');
    check("1440: the chat panel is 560 wide", !!aside && Math.abs(aside.width - 560) <= 1, `${aside?.width}`);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(2560, 1440);
    await go(page, "/");
    const aside = await box(page, 'aside[aria-label="محادثة Clausia"]');
    check("2560: the chat panel is 760 and the frame stays 1760 (panel starts at 400)", !!aside && Math.abs(aside.width - 760) <= 1 && Math.abs(aside.x - 400) <= 1, `${aside?.width} @ ${aside?.x}`);
    await ctx.close();
  }

  // ---------- contexts and sessions ----------
  {
    const { ctx, page } = await open(1920, 1080);
    await go(page, `/cases/${caseId}`);
    check("a case page opens the case's LATEST session", await page.getByText("اختبار-تقسيم: جلسة قضية أحدث").first().isVisible());
    await page.getByRole("button", { name: "محادثات" }).click();
    const menu = page.locator("ul").filter({ hasText: "محادثة جديدة" }).first();
    const text = await menu.innerText();
    check("the sessions list shows this case's sessions", text.includes("جلسة قضية أقدم") && text.includes("جلسة قضية أحدث") && text.includes("جلسة"), text.slice(0, 120));
    check("the sessions list shows NO general session", !text.includes("محادثة عامة"));
    check("«+ محادثة جديدة» is on top", text.trim().startsWith("محادثة جديدة") || /^\s*\+?\s*محادثة جديدة/.test(text));
    check("a hearing session is labelled with its date", /جلسة \d+\/\d+/.test(text));
    await page.getByRole("link", { name: /جلسة قضية أقدم/ }).click();
    await page.waitForURL(/[?&]s=/);
    await page.waitForTimeout(800);
    check("picking a session opens it (?s=)", await page.getByText("اختبار-تقسيم: جلسة قضية أقدم").first().isVisible());
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(600);
    check("the chosen session survives a refresh", await page.getByText("اختبار-تقسيم: جلسة قضية أقدم").first().isVisible());
    await go(page, `/cases/${caseId}?s=${general}`);
    check("a session of another context in ?s= is ignored (the case's latest opens)", await page.getByText("اختبار-تقسيم: جلسة قضية أحدث").first().isVisible());
    await go(page, `/cases/${caseId}?hearing=${h.id}`);
    check("?hearing= opens that hearing's session", await page.getByText("اختبار-تقسيم: جلسة مرتبطة").first().isVisible());
    await go(page, `/cases/${caseId}?s=new`);
    check("?s=new is an empty session", (await page.getByText("اختبار-تقسيم").count()) === 0 && (await page.getByText("هجهّز لك اللي هيتحفظ").count()) > 0);
    await go(page, "/");
    // Home's chat starts with the day's brief (not a saved message: the message list is empty) and no session of the tests
    check("Home's chat starts with the brief and no saved message", (await page.locator('aside[aria-label="محادثة Clausia"] ol > li').count()) === 0 && (await page.getByText("النهارده ·").count()) > 0 && (await page.getByText("اختبار-تقسيم").count()) === 0);
    await page.getByRole("button", { name: "محادثات" }).click();
    const gtext = await page.locator("ul").filter({ hasText: "محادثة جديدة" }).first().innerText();
    check("Home's sessions list is the general context only", gtext.includes("محادثة عامة") && !gtext.includes("جلسة قضية"), gtext.slice(0, 120));
    await ctx.close();
  }

  // ---------- old URLs ----------
  {
    const { ctx, page } = await open(1920, 1080);
    await page.goto(`${BASE}/chat`, { waitUntil: "load" });
    check("/chat lands on Home", new URL(page.url()).pathname === "/");
    await page.goto(`${BASE}/chat/${caseNew}`, { waitUntil: "load" });
    check("/chat/<case session> lands on the case page with ?s=", page.url().includes(`/cases/${caseId}`) && page.url().includes(`s=${caseNew}`), page.url());
    await page.goto(`${BASE}/chat/${general}`, { waitUntil: "load" });
    check("/chat/<general session> lands on Home with ?s=", new URL(page.url()).pathname === "/" && page.url().includes(`s=${general}`), page.url());
    await page.waitForSelector('aside[aria-label="محادثة Clausia"]');
    await page.waitForTimeout(500);
    check("…and that general session is open", await page.getByText("اختبار-تقسيم: محادثة عامة").first().isVisible());
    await page.goto(`${BASE}/cases/${caseId}?tab=chat&q=${encodeURIComponent("اكتبلي مذكرة")}`, { waitUntil: "load" });
    await page.waitForURL((u) => !u.search.includes("tab=chat"), { timeout: 30_000 });
    await page.waitForSelector("textarea");
    await page.waitForTimeout(600);
    check("?tab=chat&q= lands on the case page with the sentence in the box (nothing sent)", !page.url().includes("tab=chat") && (await page.locator("textarea").inputValue()) === "اكتبلي مذكرة", page.url());
    // the draft survives moving between pages
    await page.locator("textarea").fill("مسودة نص");
    await page.getByRole("link", { name: "الجلسات", exact: true }).first().click();
    await page.waitForURL(/\/hearings/);
    await page.waitForTimeout(800);
    check("the draft survives a page change", (await page.locator("textarea").inputValue()) === "مسودة نص");
    await ctx.close();
  }

  // ---------- below 1280: the chat is the screen, the page is a sheet ----------
  {
    const { ctx, page } = await open(1000, 800);
    await go(page, "/");
    const a = await box(page, 'aside[aria-label="محادثة Clausia"]');
    check("below 1280 the chat is full screen", !!a && a.width >= 999 && a.height >= 799, `${a?.width}x${a?.height}`);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(390, 844);
    await go(page, "/");
    const a = await box(page, 'aside[aria-label="محادثة Clausia"]');
    check("phone: the chat is the main screen", !!a && a.width >= 389 && a.height >= 843);
    check("phone: Home shows no sheet (and no top bar)", !(await visible(page, "main")) && !(await visible(page, "header")));
    check("phone: the header has the context pill and the round Roll and Cases buttons", (await visible(page, 'button[aria-label="اختار المحادثة"]')) && (await visible(page, 'aside a[aria-label="الجلسات"]')) && (await visible(page, 'aside a[aria-label="القضايا"]')));
    check("phone: no mic button", (await page.locator('[aria-label*="صوت"], [aria-label*="mic" i]').count()) === 0);
    const send = await box(page, 'button[aria-label="إرسال"]');
    const plus = await box(page, 'label[for="file-panel"]');
    check("phone: the send button is at the start-opposite end where the mockup draws the mic (left), the plus on the right", !!send && !!plus && send.x < plus.x);
    await go(page, `/cases/${caseId}`);
    check("phone: a case shows the case strip with «افتح» and no sheet", (await visible(page, 'a:has-text("افتح")')) && !(await visible(page, "main")));
    await page.click('a:has-text("افتح")');
    await page.waitForSelector("main", { state: "visible" });
    check("phone: «افتح» opens the page as a bottom sheet", await visible(page, "main") && page.url().includes("sheet=1"));
    await page.getByRole("link", { name: "رجوع للشات" }).last().click();
    await page.waitForURL((u) => !u.search.includes("sheet=1"), { timeout: 30_000 });
    await page.waitForTimeout(400);
    check("phone: «رجوع للشات» closes the sheet", !(await visible(page, "main")) && !page.url().includes("sheet=1"), page.url());
    await go(page, "/hearings");
    check("phone: the Roll opens as a sheet", await visible(page, "main"));
    await go(page, `/cases/${caseId}`);
    await page.click('button[aria-label="اختار المحادثة"]');
    await page.waitForSelector('[role="dialog"]');
    await page.waitForTimeout(600);
    const step1 = await page.locator('[role="dialog"]').innerText();
    check("phone picker step 1: «محادثة عامة» and the cases", step1.includes("محادثة عامة") && step1.includes("القضايا"));
    await page.locator('[role="dialog"] button', { hasText: "عادل النموذجي" }).first().click();
    await page.waitForTimeout(800);
    const step2 = await page.locator('[role="dialog"]').innerText();
    check("phone picker step 2: that case's sessions with «+ محادثة جديدة»", step2.includes("محادثة جديدة") && step2.includes("جلسة قضية أحدث") && !step2.includes("محادثة عامة:"), step2.slice(0, 200));
    await ctx.close();
  }
} finally {
  await browser.close();
  if (made.length) await db.from("chat_threads").delete().in("id", made);
}
console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
