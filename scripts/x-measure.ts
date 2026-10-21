// Dumps boxes of the Cases list landmarks in the mockup (docs/design) and in the app, for exact-layout checks.
// Run: SHOT_STATE_DIR=… npx tsx --env-file=.env.local scripts/x-measure.ts [baseUrl]   (MPATH=/cases?… for another URL)
import { chromium } from "@playwright/test";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3405";
const state = join(process.env.SHOT_STATE_DIR ?? tmpdir(), "clausia-x-cases-state.json");
const browser = await chromium.launch();
// tsx (esbuild keepNames) wraps functions in __name(); define it in the page so evaluate() works
const shim = "window.__name = (f) => f";

const probe = () => {
  const out: Record<string, string> = {};
  const txt = (e: Element) => (e as HTMLElement).innerText?.trim() ?? "";
  const leaf = (t: string) => [...document.querySelectorAll("body *")].filter((e) => txt(e) === t && ![...e.children].some((c) => txt(c) === t)) as HTMLElement[];
  const box = (k: string, e?: Element | null) => {
    if (!e) { out[k] = "MISSING"; return; }
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    out[k] = `x${Math.round(r.left)}-${Math.round(r.right)} y${Math.round(r.top)}-${Math.round(r.bottom)} (w${Math.round(r.width)} h${Math.round(r.height)}) fs${s.fontSize} lh${s.lineHeight} fw${s.fontWeight}`;
  };
  box("eyebrow", leaf("كل قضايا المكتب")[0]);
  box("h1", document.querySelector("h1"));
  const nums = [...document.querySelectorAll("body *")].filter((e) => /^\d\d$/.test(txt(e)) && e.children.length === 0);
  nums.slice(0, 3).forEach((e, i) => { box(`stat${i}`, e); box(`stat${i}-block`, e.parentElement); box(`stat${i}-label`, e.nextElementSibling); });
  const n = document.body.innerText.match(/الكل · (\d+)/)?.[1] ?? "";
  const all = leaf(`الكل · ${n}`)[0] ?? [...document.querySelectorAll("nav a > span")].find((e) => txt(e).startsWith("الكل"));
  box("cap-all", all?.closest("a > span") ?? all); // app: the visible capsule, not the inner text run
  const card = [...document.querySelectorAll("body *")].find((e) => {
    const s = getComputedStyle(e);
    return (s.borderTopLeftRadius === "28px" || s.borderTopLeftRadius === "24px") && txt(e).includes("لسنة") && e.getBoundingClientRect().width > 300;
  });
  box("card", card);
  box("th-case", leaf("القضية")[0]); box("th-court", leaf("المحكمة")[0]); box("th-next", leaf("الجلسة الجاية")[0]);
  const rows = card ? [...card.querySelectorAll("a")] : [];
  rows.slice(0, 3).forEach((a, i) => { box(`row${i}`, a); const t = a.firstElementChild; box(`row${i}-title`, t?.children[0]); box(`row${i}-sub`, t?.children[1]); box(`row${i}-col2`, a.children[1]); box(`row${i}-col3`, a.children[2]); });
  box("row-last", rows[rows.length - 1]);
  box("row-chip", leaf("محتاجة قرار").filter((e) => e.closest("a") && e.getBoundingClientRect().width > 0)[0]);
  const ta = document.querySelector("textarea,input[placeholder]");
  box("composer-input", ta); box("composer-pill", ta?.parentElement);
  box("send", document.querySelector('[aria-label="إرسال"]'));
  return out;
};

for (const mobile of [false, true]) {
  const vp = mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 };
  const m = await (await browser.newContext({ viewport: vp })).newPage();
  await m.addInitScript(shim);
  await m.goto("file://" + resolve(`docs/design/Light${mobile ? "Mobile" : ""}Cases.dc.html`));
  await m.waitForTimeout(600);
  const a = await (await browser.newContext({ viewport: vp, storageState: state, locale: "ar-EG", timezoneId: "Africa/Cairo" })).newPage();
  await a.addInitScript(shim);
  await a.goto(BASE + (process.env.MPATH ?? "/cases"));
  await a.waitForTimeout(900);
  const [mo, ao] = [await m.evaluate(probe), await a.evaluate(probe)];
  console.log(`\n===== ${mobile ? "MOBILE" : "DESKTOP"}`);
  for (const k of new Set([...Object.keys(mo), ...Object.keys(ao)])) console.log(`${k}\n  M ${mo[k]}\n  A ${ao[k]}`);
}
await browser.close();
