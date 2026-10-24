// Chat send feedback (owner item 5): after the lawyer taps send, the message bubble and the «Clausia بيفكّر…» line must be on screen at once,
// before the server answers. This run NEVER lets a send through: EVERY POST (the chat's sends are server actions, which are POSTs) is aborted in the browser by
// page.route, whatever its headers, and the script fails if none was aborted (then it would prove nothing).
//   npx next build && npx next start -p 3417
//   npx tsx --env-file=.env.local scripts/test-chat-send-feedback.ts 3417
import { chromium } from "@playwright/test";

const arg = process.argv[2] ?? "3417";
const BASE = /^https?:/.test(arg) ? arg : `http://localhost:${arg}`;
const email = process.env.DEMO_EMAIL, password = process.env.DEMO_PASSWORD;
if (!email || !password) throw new Error("DEMO_EMAIL / DEMO_PASSWORD missing (run with --env-file=.env.local)");
if (new URL(BASE).port === "3000") throw new Error("port 3000 is the owner's dev server");

const TEXT = "رسالة تجربة لن تُرسل";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "ar-EG" })).newPage();

await page.addInitScript("window.__name = (f) => f"); // tsx (esbuild keepNames) wraps functions in __name(); evaluate() needs it in the page
await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', password);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click('button:has-text("دخول")')]);
await page.goto(`${BASE}/`);
const box = page.locator('textarea[aria-label="رسالة لـ Clausia"]');
await box.waitFor();
await page.waitForTimeout(1500);

// from here on: NO POST of any kind leaves the browser (the chat's sends are server actions, which are POSTs); the guard does not look at headers
let aborted = 0;
await page.route("**/*", (route) => {
  if (route.request().method() === "POST") { aborted++; return route.abort(); }
  return route.continue();
});

await box.fill(TEXT);
await page.evaluate((text) => {
  const w = window as unknown as { __send: { t0: number | null; bubble: number | null; status: number | null } };
  w.__send = { t0: null, bubble: null, status: null };
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && w.__send.t0 === null) w.__send.t0 = performance.now(); }, true);
  const check = () => {
    if (w.__send.t0 === null) return;
    const aside = document.querySelector('aside[aria-label="محادثة Clausia"]');
    if (!aside) return;
    const stamp = (k: "bubble" | "status") => requestAnimationFrame(() => { if (w.__send[k] === null) w.__send[k] = performance.now(); });
    if (w.__send.bubble === null && [...aside.querySelectorAll("li div")].some((d) => d.textContent?.trim() === text)) stamp("bubble");
    if (w.__send.status === null && [...aside.querySelectorAll("li[aria-live=polite] p")].some((p) => /Clausia بيفكّر|بقرا|بدوّر/.test(p.textContent ?? ""))) stamp("status");
  };
  new MutationObserver(check).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
}, TEXT);
await box.press("Enter");
await page.waitForTimeout(1500);

const r = await page.evaluate(() => (window as unknown as { __send: { t0: number; bubble: number | null; status: number | null } }).__send);
const bubble = r.bubble === null ? null : Math.round(r.bubble - r.t0), status = r.status === null ? null : Math.round(r.status - r.t0);
console.log(`aborted POSTs: ${aborted}`);
console.log(`send -> message bubble: ${bubble ?? "NOT SEEN"} ms | send -> «Clausia بيفكّر…» line: ${status ?? "NOT SEEN"} ms`);
await browser.close();
const ok = aborted >= 1 && bubble !== null && bubble < 100 && status !== null && status < 100;
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
