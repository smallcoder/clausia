// Exact-layout pass, Chat: the same element boxes (x, y, w, h, font) measured on the mockup (docs/design/*Chat*.dc.html)
// and on the app thread, side by side, so the layout is compared in numbers rather than by eye.
// Needs the app running and the storage state from scripts/x-chat-shots.ts.
// Run: npx tsx --env-file=.env.local scripts/x-chat-measure.ts <threadId> [Light|Dark] [desktop|mobile]
import { chromium, type Page } from "@playwright/test";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [threadId, scheme = "Light", kind = "desktop"] = process.argv.slice(2);
const BASE = process.env.SHOT_BASE ?? "http://localhost:3402";
const state = join(process.env.SHOT_STATE_DIR ?? tmpdir(), "clausia-x-chat-state.json");
const mobile = kind === "mobile";

function measure(page: Page) {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    const box = (name: string, el: Element | null | undefined) => {
      if (!el) { out[name] = "—"; return; }
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out[name] = `x${Math.round(r.left)} y${Math.round(r.top + scrollY)} w${Math.round(r.width)} h${Math.round(r.height)} · ${cs.fontSize} ${cs.fontWeight} r${cs.borderTopLeftRadius}/${cs.borderBottomLeftRadius} pad ${cs.padding}`;
    };
    const all = [...document.querySelectorAll<HTMLElement>("body *")].filter((e) => e.getBoundingClientRect().width > 0);
    const text = (e: Element) => (e.textContent ?? "").trim();
    const btn = (re: RegExp) => all.find((e) => (e.tagName === "BUTTON" || e.tagName === "A") && re.test(text(e)));
    const pill = all.find((e) => /^محادثة/.test(text(e)) && Math.round(e.getBoundingClientRect().height) === 32);
    box("pill", pill);
    const thumb = all.find((e) => text(e) === "PDF" && e.children.length <= 1 && e.getBoundingClientRect().width === 30);
    box("paper chip", thumb?.parentElement);
    box("paper thumb", thumb);
    const bubble = all.find((e) => getComputedStyle(e).borderBottomLeftRadius === "6px" && getComputedStyle(e).borderTopLeftRadius === "22px");
    box("user bubble", bubble);
    const marks = all.filter((e) => text(e) === "C" && e.getBoundingClientRect().width >= 22 && e.getBoundingClientRect().width <= 28 && e.getBoundingClientRect().top + scrollY > 70);
    box("clausia mark 1", marks[0]);
    box("clausia text 1", all.find((e) => e.tagName === "P" && /^(قريت|قرأت|اقترحت)/.test(text(e))));
    const save = btn(/^احفظ/);
    let card: Element | null | undefined = save;
    while (card && getComputedStyle(card).borderTopLeftRadius !== "24px") card = card.parentElement;
    box("card", card);
    box("card header", card?.firstElementChild?.tagName === "DIV" && getComputedStyle(card.firstElementChild).borderBottomWidth !== "0px" ? card.firstElementChild : card?.querySelector("div"));
    const kindCell = all.find((e) => /^(الموكلة|الموكل)$/.test(text(e)));
    box("row 1 kind", kindCell);
    box("row 1", kindCell?.parentElement);
    box("check 1", all.find((e) => Math.round(e.getBoundingClientRect().width) === 22 && Math.round(e.getBoundingClientRect().height) === 22 && getComputedStyle(e).borderTopLeftRadius === "11px"));
    box("save btn", save);
    box("edit btn", btn(/^عدّل$/));
    box("footer", save?.parentElement?.parentElement?.tagName === "DIV" && card?.lastElementChild ? card.lastElementChild : save?.parentElement);
    const chips = all.filter((e) => e.tagName === "BUTTON" && Math.round(e.getBoundingClientRect().height) === 36);
    box("chip 1", chips[0]);
    box("chip last", chips[chips.length - 1]);
    const ta = document.querySelector("textarea");
    box("textarea", ta);
    let comp: Element | null | undefined = ta;
    while (comp && !/^2[46]px$/.test(getComputedStyle(comp).borderTopLeftRadius)) comp = comp.parentElement;
    box("composer box", comp);
    box("composer mark", comp?.querySelector("div,span"));
    box("attach", all.find((e) => /إضافة ورقة|إرفاق/.test(e.getAttribute("aria-label") ?? "")));
    box("mic", all.find((e) => /صوتية/.test(e.getAttribute("aria-label") ?? "")));
    box("send", all.find((e) => e.getAttribute("aria-label") === "إرسال"));
    box("hint", all.find((e) => /^(Clausia بتجهّز|مفيش حاجة)/.test(text(e)) && e.children.length === 0 && e.getBoundingClientRect().height > 0));
    out["page height"] = String(document.documentElement.scrollHeight);
    return out;
  });
}

const browser = await chromium.launch();
const vp = mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 };
const m = await (await browser.newContext({ viewport: vp })).newPage();
// tsx keeps function names with a __name helper that the page does not have
const shim = "window.__name = (f) => f";
await m.addInitScript(shim);
await m.goto("file://" + resolve(`docs/design/${scheme}${mobile ? "Mobile" : ""}Chat.dc.html`), { waitUntil: "load" });
await m.waitForTimeout(600);
const mock = await measure(m);
const ctx = await browser.newContext({ viewport: vp, storageState: state, colorScheme: scheme === "Dark" ? "dark" : "light", locale: "ar-EG", timezoneId: "Africa/Cairo" });
const a = await ctx.newPage();
await a.addInitScript(shim);
await a.goto(`${BASE}/chat/${threadId}`, { waitUntil: "load" });
// SHOT_SYSFONT=1: take Vazirmatn out of the app's stack, so Arabic falls back to the system SF Arabic like the
// mockup does (separates font-metric differences from layout ones)
if (process.env.SHOT_SYSFONT) await a.addStyleTag({ content: "html, body { --font-vazir: NoSuchFont !important; }" });
await a.waitForTimeout(900);
await a.evaluate(() => window.scrollTo({ top: 0 }));
const app = await measure(a);
for (const k of Object.keys(mock)) console.log(`${k.padEnd(15)} M ${mock[k]}\n${"".padEnd(15)} A ${app[k]}`);
await browser.close();
