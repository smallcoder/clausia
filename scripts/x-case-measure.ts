// Exact-layout pass, Case screen: prints the boxes (x, y, w, h), font size / weight / line height and the enclosing card's
// box for the same anchors in the mockup (docs/design/<View>.dc.html) and the app (/cases/<772>), so the differences are numbers.
// Needs the app running. Run: npx tsx --env-file=.env.local scripts/x-case-measure.ts [baseUrl] [statePath]   (VIEWS=LightCase,LightMobileCase)
import { chromium, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";

const [BASE = "http://localhost:3403", STATE = "/tmp/clausia-x-case-state.json"] = process.argv.slice(2);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await db.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
const id = (await db.from("cases").select("id").eq("case_number", process.env.CASE ?? "772").limit(1).maybeSingle()).data?.id as string;

const PROBES: [string, string][] = [
  ["back", "[aria-label='رجوع']"], ["eyebrow", "text=موكلنا"], ["status", "text=متداولة"], ["h1", "h1"], ["against", "text=/^ضد /"],
  ["spec:number", "text=رقم الدعوى"], ["spec:court", "text=المحكمة"], ["stat:facts", "text=/^وقائع$/"], ["stat:review", "text=/محتاجة مراجعة$/"],
  ["hearing", "text=/^(الجلسة الجاية|آخر جلسة)/"], ["summary", "text=ملخص Clausia"], ["banner", "a:has-text('محتاجة')"],
  ["tabs", "[role=tablist]"], ["facts:note", "text=/بيحدد نسخة القانون/"], ["ours", "text=لنا · طلباتنا"], ["theirs", "text=ضدنا · دفوع الخصم"],
  ["parties", "text=/^الأطراف$/"], ["docs", "text=/^المستندات$/"], ["composer", "input[aria-label^='اكتب'], textarea"], ["chip:add", "button:has-text('أضف مستند')"],
];

async function measure(page: Page) {
  const out: Record<string, string> = {};
  for (const [k, sel] of PROBES) {
    const loc = page.locator(sel).filter({ visible: true }).first();
    if (!(await loc.count())) { out[k] = "—"; continue; }
    out[k] = await loc.evaluate((el) => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      let card: Element | null = el.parentElement;
      while (card && !(parseFloat(getComputedStyle(card).borderTopLeftRadius) >= 18 && getComputedStyle(card).backgroundColor !== "rgba(0, 0, 0, 0)")) card = card.parentElement;
      const c = card?.getBoundingClientRect();
      return `${Math.round(r.x)},${Math.round(r.y + scrollY)} ${Math.round(r.width)}×${Math.round(r.height)} ${cs.fontSize}/${cs.fontWeight}/${cs.lineHeight}` + (c ? ` | card ${Math.round(c.x)},${Math.round(c.y + scrollY)} ${Math.round(c.width)}×${Math.round(c.height)} r${getComputedStyle(card!).borderTopLeftRadius} p${getComputedStyle(card!).padding}` : "");
    });
  }
  return out;
}

const browser = await chromium.launch();
for (const view of (process.env.VIEWS ?? "LightCase,LightMobileCase").split(",")) {
  const mobile = view.includes("Mobile");
  const opts = { viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 }, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: view.startsWith("Dark") ? "dark" as const : "light" as const };
  const m = await (await browser.newContext(opts)).newPage();
  await m.goto("file://" + resolve(`docs/design/${view}.dc.html`), { waitUntil: "load" });
  await m.waitForTimeout(600);
  const a = await (await browser.newContext({ ...opts, storageState: STATE })).newPage();
  await a.goto(`${BASE}/cases/${id}`, { waitUntil: "load", timeout: 60_000 });
  await a.waitForTimeout(800);
  const [mm, am] = [await measure(m), await measure(a)];
  console.log(`\n=== ${view}`);
  for (const [k] of PROBES) console.log(`${k.padEnd(13)} M ${mm[k]}\n${"".padEnd(13)} A ${am[k]}`);
}
await browser.close();
