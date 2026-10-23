// Screenshots for transparency (split layout PR 4) → screenshots/compare/split/ (light and dark), prefix Trans-:
//   Trans-live-…   live steps mid-turn (the page's send is held; the steps are rows in chat_turn_steps read by the real route);
//   Trans-live-real-…   the same, from a REAL turn (the step the model's reads were on when the shot was taken);
//   Trans-footer-… / Trans-footer-open-…   the «استخدمت:» footer under a real answer, and a chip open (the paper panel);
//   Trans-drop-…   the drop overlay «ارمي الورقة هنا»;  Trans-drop-error-…  a wrong type dropped (error, nothing uploaded);
//   Trans-picker-…   the case picker after a drop in the general context;
//   Trans-upload-…   «بقرا الورقة… صفحة N من M» after choosing a case;  Trans-card-…  the confirm card after the drop.
// at 1440 / 1920 / 2560 and 390 (M). Paid steps (run each once): `real-turn` (1 short turn), `real-drop` (1 paper). Free: `shots`. Then `cleanup`.
// Needs the app running. Run: npx tsx --conditions=react-server --env-file=.env.local scripts/transparency-shots.ts <real-turn|real-drop|shots|cleanup> [baseUrl]
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";
import { readStepLabel } from "@/lib/assistant/step-labels";

const STEP = process.argv[2] ?? "shots";
const BASE = process.argv[3] ?? "http://localhost:5200";
const OUT = "screenshots/compare/split";
const STATE_FILE = "/private/tmp/claude-501/-Users-smallcoder-Code-clausia-clausia-app/8ad32453-e873-4944-8c30-61efb9bfe63f/scratchpad/trans-state.json";
mkdirSync(OUT, { recursive: true });

const CASE_READ = "64386d44-1cca-4ecf-a9ae-f81c5abc998a"; // 4471/2026: has the claim sheet (2 pages, read)
const CASE_DROP = "7daceaa8-fd4e-40a2-a621-273cdc18d471"; // 98/2026: the paper dropped in the general context goes here
const FIXED_TURN = "11111111-2222-4333-8444-555555555555";
const state: { turnThread?: string; dropThread?: string; dropDoc?: string } = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {};
const save = () => writeFileSync(STATE_FILE, JSON.stringify(state));

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const db = sb as unknown as Db;

const browser = await chromium.launch();
const loginState = await (async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', process.env.DEMO_EMAIL!);
  await page.fill('input[name="password"]', process.env.DEMO_PASSWORD!);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90_000 }), page.click('button:has-text("دخول")')]);
  const s = await ctx.storageState();
  await ctx.close();
  return s;
})();

async function ctxOf(w: number, hgt: number, dark: boolean): Promise<[BrowserContext, Page]> {
  const touch = w < 600;
  const ctx = await browser.newContext({ storageState: loginState, viewport: { width: w, height: hgt }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: dark ? "dark" : "light" });
  await ctx.addInitScript((d) => { try { localStorage.setItem("theme", d ? "dark" : "light"); } catch { /* none */ } }, dark);
  const page = await ctx.newPage();
  await page.addInitScript(() => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s)); });
  return [ctx, page];
}
async function go(page: Page, path: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 90_000 });
  await page.waitForSelector('aside[aria-label="محادثة Clausia"]');
  await page.waitForTimeout(1800);
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` });
const SIZES = [[1440, 900, "1440"], [1920, 1080, "1920"], [2560, 1440, "2560"], [390, 844, "M"]] as const;

/** dragging a file over the window (the overlay) — no drop yet */
async function dragIn(page: Page, name = "claim-sheet.pdf", type = "application/pdf") {
  await page.evaluate(({ name, type }) => {
    const dt = new DataTransfer();
    dt.items.add(new File(["x"], name, { type }));
    for (const t of ["dragenter", "dragover"]) document.body.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, { name, type });
  await page.waitForTimeout(400);
}
/** dropping a file (bytes from the fixture, or a stand-in) */
async function dropFile(page: Page, name: string, type: string, b64: string) {
  await page.evaluate(({ name, type, b64 }) => {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], name, { type }));
    for (const t of ["dragenter", "dragover", "drop"]) document.body.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, { name, type, b64 });
}
const PDF = readFileSync("tests/fixtures/claim-sheet.pdf").toString("base64");

async function newThread(caseId: string | null, title: string) {
  const { data } = await db.from("chat_threads").insert({ case_id: caseId, title }).select("id").single();
  return data!.id;
}

async function cleanup() {
  await db.from("chat_turn_steps").delete().eq("turn_id", FIXED_TURN);
  for (const t of [state.turnThread, state.dropThread]) {
    if (!t) continue;
    await db.from("proposals").delete().eq("thread_id", t);
    const { data: docs } = await db.from("documents").select("id, storage_path").eq("thread_id", t);
    for (const d of docs ?? []) { await db.storage.from("documents").remove([d.storage_path]); await db.from("documents").delete().eq("id", d.id); }
    await db.from("chat_threads").delete().eq("id", t);
  }
  if (state.dropDoc) {
    const { data: d } = await db.from("documents").select("storage_path").eq("id", state.dropDoc).maybeSingle();
    if (d) { await db.storage.from("documents").remove([d.storage_path]); await db.from("documents").delete().eq("id", state.dropDoc); }
  }
  delete state.turnThread; delete state.dropThread; delete state.dropDoc;
  save();
  console.log("cleaned up");
}

try {
  // ---------- paid: ONE short real turn in case 4471: the model reads the case and a page of the claim sheet ----------
  if (STEP === "real-turn") {
    state.turnThread = await newThread(CASE_READ, "اختبار-شفافية: قراءة الصحيفة");
    save();
    const [ctx, page] = await ctxOf(1440, 900, false);
    await go(page, `/cases/${CASE_READ}?s=${state.turnThread}`);
    await page.getByLabel("رسالة لـ Clausia").fill("اقرأ صفحة 1 من الصحيفة المرفوعة في القضية دي، وقولّي مين المدعي ومين المدعى عليه.");
    await page.getByLabel("إرسال").click();
    const seen: string[] = [];
    const live = page.locator('li[aria-live="polite"] p.animate-pulse');
    let shotTaken = false;
    for (let i = 0; i < 400; i++) {
      await page.waitForTimeout(150);
      const txt = (await live.first().textContent({ timeout: 500 }).catch(() => null))?.trim();
      if (txt && seen.at(-1) !== txt) {
        seen.push(txt);
        if (!/بيكتب/.test(txt) && !shotTaken) { await shot(page, "Trans-live-real-1440-light"); shotTaken = true; }
      }
      if (!txt && seen.length && i > 20 && (await page.locator("text=استخدمت:").count())) break;
      if (!txt && i > 300) break;
    }
    console.log("statuses seen while the turn ran:", JSON.stringify(seen));
    await page.waitForTimeout(2500);
    const { data: rows } = await db.from("chat_messages").select("role, content, sources").eq("thread_id", state.turnThread).order("created_at");
    console.log("messages:", JSON.stringify(rows?.map((r) => ({ role: r.role, c: r.content.slice(0, 80), sources: r.sources }))));
    console.log("footer visible:", await page.locator("text=استخدمت:").count());
    await shot(page, "Trans-footer-real-1440-light");
    await ctx.close();
  }

  // ---------- paid: ONE paper dropped in the general context: the picker, a case, the page progress, the card ----------
  if (STEP === "real-drop") {
    const [ctx, page] = await ctxOf(1440, 900, false);
    await go(page, "/");
    await dropFile(page, "claim-sheet.pdf", "application/pdf", PDF);
    await page.locator('section[aria-label="اختار القضية"]').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    await shot(page, "Trans-picker-real-1440-light");
    await page.locator('section[aria-label="اختار القضية"] button').filter({ hasText: /\b98\b/ }).first().click();
    const live = page.locator('li[aria-live="polite"] p.animate-pulse');
    const seen: string[] = [];
    let got = false;
    for (let i = 0; i < 600; i++) {
      await page.waitForTimeout(250);
      const txt = (await live.first().textContent({ timeout: 400 }).catch(() => null))?.trim();
      if (txt && seen.at(-1) !== txt) {
        seen.push(txt);
        if (/صفحة \d+ من \d+/.test(txt) && !got) { await shot(page, "Trans-upload-1440-light"); got = true; }
      }
      if (/\/cases\//.test(page.url())) break;
    }
    console.log("upload statuses seen:", JSON.stringify(seen), "→", page.url());
    await page.waitForSelector("text=اقتراح", { timeout: 30_000 }).catch(() => null);
    await page.waitForTimeout(2500);
    const m = /\/cases\/[^?]+\?s=([0-9a-f-]+)/.exec(page.url());
    if (m) state.dropThread = m[1];
    const { data: docs } = await db.from("documents").select("id, case_id, thread_id, read_status").eq("thread_id", state.dropThread ?? "").limit(1);
    if (docs?.[0]) state.dropDoc = docs[0].id;
    save();
    console.log("drop thread:", state.dropThread, "doc:", JSON.stringify(docs?.[0]));
    await shot(page, "Trans-card-real-1440-light");
    await ctx.close();
  }

  // ---------- free: every state, every size, light and dark ----------
  if (STEP === "shots") {
    for (const dark of [false, true]) {
      const t = dark ? "dark" : "light";
      for (const [w, hgt, tag] of SIZES) {
        const mobile = w < 600;

        // live steps mid-turn: the model's turn is held; the steps are real rows read through the real route
        {
          const [ctx, page] = await ctxOf(w, hgt, dark);
          await page.addInitScript((id) => { crypto.randomUUID = (() => id) as typeof crypto.randomUUID; }, FIXED_TURN);
          const held: string[] = [];
          await page.route("**/*", (route) => {
            const r = route.request();
            if (r.method() === "POST" && r.headers()["next-action"]) { held.push(r.url()); return; } // never answered: the turn "keeps running"
            return route.continue();
          });
          await db.from("chat_turn_steps").delete().eq("turn_id", FIXED_TURN);
          await db.from("chat_turn_steps").insert([
            { turn_id: FIXED_TURN, seq: 1, label: readStepLabel("get_case", {})! },
            { turn_id: FIXED_TURN, seq: 2, label: readStepLabel("get_document_text", { pages: [1] }, "صحيفة دعوى")! },
          ]);
          await go(page, `/cases/${CASE_READ}?s=${state.turnThread}`);
          await page.getByLabel("رسالة لـ Clausia").fill("وإيه الطلبات في الصحيفة؟");
          await page.getByLabel("إرسال").click();
          await page.waitForTimeout(2900); // the first step stays ~1.3s, then the second
          const label = (await page.locator('li[aria-live="polite"] p.animate-pulse').first().textContent())?.trim();
          console.log(`${tag} ${t}: live line = ${label}  (held ${held.length} send)`);
          await shot(page, `Trans-live-${tag}-${t}`);
          await db.from("chat_turn_steps").delete().eq("turn_id", FIXED_TURN);
          await ctx.close();
        }

        // the footer under the real answer, and a chip open
        if (state.turnThread) {
          const [ctx, page] = await ctxOf(w, hgt, dark);
          await go(page, `/cases/${CASE_READ}?s=${state.turnThread}`);
          await page.locator("text=استخدمت:").first().scrollIntoViewIfNeeded();
          await shot(page, `Trans-footer-${tag}-${t}`);
          await page.locator('[role="group"][aria-label="المصادر المستخدمة"] button').first().click();
          await page.waitForTimeout(1500);
          await shot(page, `Trans-footer-open-${tag}-${t}`);
          await ctx.close();
        }

        // the drop overlay (a file dragged over the page / the chat), and a wrong type dropped
        {
          const [ctx, page] = await ctxOf(w, hgt, dark);
          await go(page, mobile ? "/" : `/cases/${CASE_READ}`);
          await dragIn(page);
          await shot(page, `Trans-drop-${tag}-${t}`);
          await dropFile(page, "مذكرة.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "eA==");
          await page.waitForTimeout(700);
          console.log(`${tag} ${t}: wrong type → ${(await page.getByRole("alert").first().textContent().catch(() => null))?.trim()}`);
          await shot(page, `Trans-drop-error-${tag}-${t}`);
          await ctx.close();
        }

        // the picker: a paper dropped in the general context asks which case (nothing is uploaded)
        {
          const [ctx, page] = await ctxOf(w, hgt, dark);
          await go(page, "/");
          await dropFile(page, "claim-sheet.pdf", "application/pdf", PDF);
          await page.locator('section[aria-label="اختار القضية"]').waitFor({ timeout: 15_000 });
          await page.waitForTimeout(1500);
          await shot(page, `Trans-picker-${tag}-${t}`);
          await ctx.close();
        }

        // the card after the drop (the real one made by `real-drop`)
        if (state.dropThread) {
          const [ctx, page] = await ctxOf(w, hgt, dark);
          await go(page, `/cases/${CASE_DROP}?s=${state.dropThread}`);
          await shot(page, `Trans-card-${tag}-${t}`);
          await ctx.close();
        }
      }
    }
  }

  if (STEP === "cleanup") await cleanup();
} finally {
  await browser.close();
}
