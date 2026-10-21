// Exact-layout check for the roll: prints the boxes of the same landmarks in the mockup (docs/design/*Roll.dc.html)
// and in the app (/hearings), so spacing/size differences are numbers, not eyeballing.
// Needs the app running + a storage state from x-roll-shots.ts. Run:
//   SHOT_STATE_DIR=… npx tsx --env-file=.env.local scripts/x-roll-measure.ts [baseUrl] [Light|Dark] [path]
import { chromium, type Page } from "@playwright/test";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [BASE = "http://localhost:3404", SCHEME = "Light", PATH = "/hearings"] = process.argv.slice(2);
const state = join(process.env.SHOT_STATE_DIR ?? tmpdir(), "clausia-xroll-state.json");

async function measure(page: Page) {
  await page.evaluate("window.__name = (f) => f");
  return page.evaluate(() => {
    const all = [...document.querySelectorAll<HTMLElement>("body *")].filter((e) => {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    });
    const box = (e: Element | null | undefined) => {
      if (!e) return null;
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return `x${Math.round(r.left)}-${Math.round(r.right)} y${Math.round(r.top + scrollY)} w${Math.round(r.width)} h${Math.round(r.height)} fs${s.fontSize} fw${s.fontWeight}`;
    };
    const smallest = (pred: (t: string, e: HTMLElement) => boolean) => {
      const m = all.filter((e) => pred((e.innerText ?? "").trim(), e));
      return m.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height)[0];
    };
    const card = (e: Element | null | undefined) => {
      for (let x = e as HTMLElement | null; x; x = x.parentElement) {
        const s = getComputedStyle(x);
        if (parseFloat(s.borderTopLeftRadius) >= 20 && s.backgroundColor !== "rgba(0, 0, 0, 0)" && x.getBoundingClientRect().width > 150) return x;
      }
      return null;
    };
    const out: Record<string, string | null> = {};
    const h1 = document.querySelector("h1");
    out.eyebrow = box(smallest((t, e) => /أكتوبر|نوفمبر/.test(t) && e.getBoundingClientRect().top < (h1?.getBoundingClientRect().top ?? 0)));
    out.h1 = box(h1);
    out.weekCount = box(smallest((t) => t.endsWith("جلسات الأسبوع")));
    out.pill = box(smallest((t, e) => /^\d+\s*محتاجة قرار$/.test(t) && e.getBoundingClientRect().top < 320));
    const strip = smallest((t) => /سبت/.test(t) && /خميس/.test(t));
    out.strip = box(strip);
    out.stripTile1 = box(strip?.firstElementChild?.tagName === "A" || strip?.firstElementChild?.getBoundingClientRect().width! < 80 ? strip?.firstElementChild : strip?.children[1]);
    out.dayHeading = box(smallest((t, e) => t === "النهارده" && e.getBoundingClientRect().top > 250));
    out.dayCount = box(smallest((t) => /^\S+ ·\s*\S+ محاكم|محكمتين|محكمة$/.test(t) && t.length < 30));
    out.nextLabel = box(smallest((t) => t.startsWith("الجلسة الجاية")));
    const btn = smallest((t, e) => t === "سجّل قرار الجلسة دي" && (e.tagName === "BUTTON"));
    out.nextBtn = box(btn);
    out.nextCard = box(card(btn));
    const cards = [...new Set(all.map((e) => card(e)).filter(Boolean))] as HTMLElement[];
    cards.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).forEach((c, i) => { out[`card${i}`] = `${box(c)} «${(c.innerText ?? "").trim().slice(0, 24).replace(/\s+/g, " ")}»`; });
    out.side = box(card(smallest((t) => t.startsWith("جلسات فاتت"))));
    out.says = box(smallest((t) => t.startsWith("بعد كل جلسة")));
    const input = document.querySelector("textarea, input[placeholder]");
    out.composer = box(card(input) ?? input?.parentElement);
    out.chip1 = box(smallest((t, e) => t === "اتأجلت لـ…" && (e.tagName === "BUTTON")));
    out.scrollH = String(document.documentElement.scrollHeight);
    return out;
  });
}

const browser = await chromium.launch();
for (const mobile of [false, true]) {
  const view = `${SCHEME}${mobile ? "Mobile" : ""}Roll`;
  const opts = { viewport: { width: mobile ? 390 : 1440, height: mobile ? 844 : 960 }, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: SCHEME === "Dark" ? "dark" as const : "light" as const };
  const m = await (await browser.newContext(opts)).newPage();
  await m.goto("file://" + resolve(`docs/design/${view}.dc.html`), { waitUntil: "load" });
  await m.waitForTimeout(500);
  const a = await (await browser.newContext({ ...opts, storageState: state })).newPage();
  await a.goto(BASE + PATH, { waitUntil: "load" });
  // MOCK_FONT=1: drop the Vazirmatn web font, so Arabic falls back to SF Arabic like the mockup render does
  // (Chromium only reaches SF Arabic by system fallback) — separates layout deltas from font-metric deltas.
  if (process.env.MOCK_FONT) await a.addStyleTag({ content: ":root:root { --font-vazir: no-such-font !important }" });
  await a.waitForTimeout(800);
  const [mm, aa] = [await measure(m), await measure(a)];
  console.log(`\n== ${view}`);
  for (const k of new Set([...Object.keys(mm), ...Object.keys(aa)])) console.log(`${k.padEnd(11)} M ${mm[k] ?? "—"}\n${"".padEnd(11)} A ${aa[k] ?? "—"}`);
}
await browser.close();
