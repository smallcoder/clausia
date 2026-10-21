// Exact-layout pass, Chat: shoots /chat and two threads at 1440×960 and 390×844, light and dark, viewport + full
// page → screenshots/x-chat/<view>-<scheme>-<kind>[-full].png, then mockup | app side by side for the pending thread
// → screenshots/compare-x/<Light|Dark>[Mobile]Chat.png (full page, mockup left, app right).
// Logs in ONCE and reuses the storage state. Needs the app running (SHOT_BASE, default http://localhost:3402).
// Run: npx tsx --env-file=.env.local scripts/x-chat-shots.ts <pendingThreadId> <questionThreadId>
// SHOT_REUSE=1 skips the login; SHOT_ONLY=pending,question,list limits the views.
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [pendingId, questionId] = process.argv.slice(2);
const BASE = process.env.SHOT_BASE ?? "http://localhost:3402";
const only = process.env.SHOT_ONLY?.split(",");
const views = ([["pending", `/chat/${pendingId}`], ["question", `/chat/${questionId}`], ["list", "/chat"]] as [string, string][])
  .filter(([v]) => !only || only.includes(v));

mkdirSync("screenshots/x-chat", { recursive: true });
mkdirSync("screenshots/compare-x", { recursive: true });
const state = join(process.env.SHOT_STATE_DIR ?? tmpdir(), "clausia-x-chat-state.json");
const browser = await chromium.launch();

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

for (const scheme of ["light", "dark"] as const) for (const kind of ["desktop", "mobile"] as const) {
  const mobile = kind === "mobile";
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 }, deviceScaleFactor: 2,
    locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: scheme, storageState: state,
  });
  const page = await ctx.newPage();
  for (const [view, path] of views) {
    await page.goto(`${BASE}${path}`, { waitUntil: "load" });
    if (page.url().includes("/login")) throw new Error("not logged in");
    await page.waitForTimeout(900);
    const out = `screenshots/x-chat/${view}-${scheme}-${kind}`;
    await page.screenshot({ path: `${out}.png` });
    // full page: grow the viewport to the page's height, so the fixed composer sits at the end like in the mockup
    const vp = page.viewportSize()!;
    const sh = await page.evaluate("document.documentElement.scrollHeight") as number;
    await page.setViewportSize({ width: vp.width, height: Math.max(sh, vp.height) });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}-full.png` });
    await page.setViewportSize(vp);
    console.log(view, scheme, kind);
  }
  await ctx.close();
}

// side by side for the pending thread (mockup left, app right), full page at the mockup's width
if (!only || only.includes("pending")) for (const scheme of ["light", "dark"] as const) for (const kind of ["desktop", "mobile"] as const) {
  const mobile = kind === "mobile";
  const name = `${scheme === "dark" ? "Dark" : "Light"}${mobile ? "Mobile" : ""}Chat`;
  const w = mobile ? 390 : 1440;
  const mock = resolve(`/Users/smallcoder/Code/clausia/clausia-app/screenshots/mockups/${name}.png`);
  const app = resolve(`screenshots/x-chat/pending-${scheme}-${kind}-full.png`);
  const html = `<html><body style="margin:0;background:${scheme === "dark" ? "#05070c" : "#dfe2e8"};font:600 14px -apple-system,sans-serif;color:${scheme === "dark" ? "#ccc" : "#333"}">
    <div style="display:flex;gap:24px;padding:16px;align-items:flex-start">
      <div><div style="padding:0 0 8px">Mockup · ${name}</div><img src="data:image/png;base64,${readFileSync(mock).toString("base64")}" style="width:${w}px;display:block"></div>
      <div><div style="padding:0 0 8px">App · /chat/${pendingId} (${w}px)</div><img src="data:image/png;base64,${readFileSync(app).toString("base64")}" style="width:${w}px;display:block"></div>
    </div></body></html>`;
  const ctx = await browser.newContext({ viewport: { width: w * 2 + 56, height: 800 } });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: `screenshots/compare-x/${name}.png`, fullPage: true });
  await ctx.close();
  console.log("compare", name);
}
await browser.close();
