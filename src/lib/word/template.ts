/**
 * The lawyer's own template (PR 6b, «+ ارفع صيغة مكتبك»): a Word file with {{placeholders}} where the case data goes.
 *  - `extractTemplateBody`: reads the file's paragraphs into a template body (so the library, the card and the read-only view treat it like a base template);
 *    the placeholders are written the lawyer's way, by name («{{المحكمة}}», «{{رقم الدعوى}}») or by key («{{court}}»).
 *  - `fillDocxTemplate`: the export. The values are put INTO the file: every run, tab, style, header, footer and margin stays as he made it (the file is
 *    kept; only the text of the placeholders changes), so an uploaded Word file keeps its own formatting through export.
 * A placeholder the app does not know («{{اسم البنك}}») is a spot only the lawyer fills: it stays empty (a dotted line) and is listed as needed.
 * «{{الأسباب}}» and «{{الطلبات}}» are the legal grounds and the requests: always the lawyer's, never filled by code.
 */
import type JSZip from "jszip";
import { FIELD_LABEL, MANUAL_LABEL } from "@/lib/library/fill";
import type { TemplateBlock, TemplateBody } from "@/lib/library/types";
import { escapeXml, paragraphsOf, partText, unescapeXml } from "./docx";
import { scrub } from "./build";
import { innerOf, replaceSpans, spans } from "./scan";

const TOKEN = /\{\{\s*([^{}]+?)\s*\}\}/g;
const KEY = /^[a-z_]+$/;

/** other ways a lawyer writes the same thing */
const ALIAS: Record<string, string> = {
  "الموكل": "client", "اسم الموكل": "client", "موكلنا": "our_parties", "الطرف الأول": "our_parties", "الخصم": "opponents", "الخصوم": "opponents", "الطرف الثاني": "opponents",
  "منطوق الحكم": "judgment_text", "الحكم": "judgment_text", "الوقائع": "facts_summary", "ملخص الوقائع": "facts_summary", "الجلسة القادمة": "next_hearing", "الجلسة": "next_hearing",
  "الأسباب": "grounds", "أسباب": "grounds", "الاسباب": "grounds", "الدفاع": "grounds", "الطلبات": "requests", "طلبات": "requests",
  "المحامي": "lawyer_name", "اسم المحامي": "lawyer_name", "رقم القضية": "case_number",
};
const BY_LABEL = new Map<string, string>([...Object.entries(FIELD_LABEL), ...Object.entries(MANUAL_LABEL)].map(([k, l]) => [l, k]));
/** the sections only the lawyer writes: their text goes where the placeholder stands */
export const LAWYER_KEYS = ["grounds", "requests"] as const;
const LAWYER_HEADING: Record<string, string> = { grounds: "الأسباب", requests: "الطلبات" };

/** A placeholder's name as written («المحكمة», «court», «اسم البنك») → its key; null when it is not one the app knows. */
export function knownKey(raw: string): string | null {
  const t = raw.trim();
  if (KEY.test(t) && (t in FIELD_LABEL || t in MANUAL_LABEL || (LAWYER_KEYS as readonly string[]).includes(t))) return t;
  return BY_LABEL.get(t) ?? ALIAS[t] ?? null;
}

/** letters-only keys for the placeholders the app does not know («field_a», «field_b»…): the body's keys are a-z and _ */
const unknownKey = (n: number) => { let s = ""; let k = n; do { s = String.fromCharCode(97 + (k % 26)) + s; k = Math.floor(k / 26) - 1; } while (k >= 0); return `field_${s}`; };

export interface ExtractedTemplate { body: TemplateBody; found: string[]; unknown: string[] }

/** Reads the paragraphs of the file into a template body. A text with no paragraph is refused by the caller (`found` and `blocks` say). */
export async function extractTemplateBody(zip: JSZip): Promise<ExtractedTemplate> {
  const doc = (await partText(zip, "word/document.xml")) ?? "";
  const unknownByLabel = new Map<string, string>();
  const found = new Set<string>();
  const blocks: TemplateBlock[] = [];
  for (const raw of paragraphsOf(doc)) {
    const text = raw.replace(/[ \t]+/g, " ").trim();
    if (!text) continue;
    const only = /^\{\{\s*([^{}]+?)\s*\}\}$/.exec(text);
    const k = only ? knownKey(only[1]) : null;
    if (k && (LAWYER_KEYS as readonly string[]).includes(k)) { blocks.push({ t: "lawyer", key: k, heading: LAWYER_HEADING[k], hint: "يكتبها المحامي" }); found.add(k); continue; }
    const norm = text.replace(TOKEN, (_, name: string) => {
      const key = knownKey(name);
      if (key && !(LAWYER_KEYS as readonly string[]).includes(key)) { found.add(key); return `{{${key}}}`; }
      // a grounds / requests token inside a longer line, or a name the app does not know: a spot only the lawyer fills
      const label = name.trim();
      if (!unknownByLabel.has(label)) unknownByLabel.set(label, unknownKey(unknownByLabel.size));
      return `{{${unknownByLabel.get(label)}}}`;
    });
    blocks.push({ t: "p", text: norm.slice(0, 4000) });
    if (blocks.length >= 200) break;
  }
  const manual = [...unknownByLabel].map(([label, key]) => ({ key, label: label.slice(0, 100) }));
  return { body: { version: 1, blocks, ...(manual.length ? { manual } : {}) }, found: [...found], unknown: [...unknownByLabel.keys()] };
}

/**
 * The file with the values in it. `value(name)` gives the text for a placeholder as the lawyer wrote it (the caller turns it into the key and the value, a
 * dotted line when there is none). Placeholders split over several runs are found (their characters are cut out of the runs that held them), and every
 * other run, tab and property of the paragraph stays. A value with several lines becomes line breaks.
 */
export async function fillDocxTemplate(zip: JSZip, value: (name: string) => string, title: string): Promise<void> {
  const doc = await partText(zip, "word/document.xml");
  if (doc === null) return;
  const done = replaceSpans(doc, "w:p", (p) => (p.includes("{{") && !p.includes("<w:txbxContent") ? fillParagraph(p, value) : p));
  zip.file("word/document.xml", done);
  await scrub(zip, title, { keepNotes: true });
}

function fillParagraph(p: string, value: (name: string) => string): string {
  const texts = spans(p, "w:t").map((n) => unescapeXml(innerOf(n.text, "w:t")));
  const starts: number[] = [];
  let all = "";
  for (const t of texts) { starts.push(all.length); all += t; }
  const found = [...all.matchAll(TOKEN)].map((m) => ({ s: m.index!, e: m.index! + m[0].length, name: m[1] }));
  if (!found.length) return p;
  /** the run that holds position `pos` (binary search: a paragraph may have very many runs) */
  const at = (pos: number) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; } return lo; };
  // from the last placeholder to the first, so the places of the earlier ones stay right
  for (const sp of found.reverse()) {
    const i = at(sp.s), j = at(sp.e - 1);
    const v = value(sp.name);
    texts[i] = texts[i].slice(0, sp.s - starts[i]) + v + (i === j ? texts[i].slice(sp.e - starts[i]) : "");
    for (let k = i + 1; k < j; k++) texts[k] = "";
    if (j > i) texts[j] = texts[j].slice(sp.e - starts[j]);
  }
  let n = 0;
  return replaceSpans(p, "w:t", () => {
    const t = texts[n++];
    return `<w:t xml:space="preserve">${t.split("\n").map(escapeXml).join('</w:t><w:br/><w:t xml:space="preserve">')}</w:t>`;
  });
}
