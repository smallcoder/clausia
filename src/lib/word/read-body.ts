/**
 * Opening a Word file as a draft (PR 7). The simplest version that is honest: the body's PARAGRAPHS, their kind (title / heading / paragraph), bold and
 * direction. Everything else is counted as «dropped» (tables, pictures and shapes, footnotes) so the editor can say so; none of it is guessed at.
 * The file is opened only through `openDocx` / `partText` (src/lib/word/docx.ts), which count the real bytes that come out of the zip: a file that lies about
 * its size is refused before this code sees a byte of it.
 */
import type JSZip from "jszip";
import type { DraftBlock, DraftImport, Mark } from "@/lib/library/types";
import { MAX_BLOCKS, MAX_TEXT, normalizeBlock } from "@/lib/draft/model";
import { DocxError, attr, partText, printedText, unescapeXml } from "./docx";
import { countOpens, firstSpan, replaceSpans, spans, textParts } from "./scan";

/** the most paragraphs (`<w:p`) a file may have, counted before anything is parsed (500 blocks is the limit of a draft; the rest are empty lines and the like) */
const MAX_PARAGRAPHS = 20_000;

export interface WordBody { blocks: DraftBlock[]; dropped: DraftImport["dropped"] }

/** the XML with every `<w:tag>…</w:tag>` removed (tags may nest, as a table in a table does); returns how many outermost ones were removed */
function stripNested(xml: string, tag: string): { xml: string; count: number } {
  const open = new RegExp(`<w:${tag}[\\s>]`, "g");
  const close = `</w:${tag}>`;
  let out = "";
  let at = 0;
  let count = 0;
  for (;;) {
    open.lastIndex = at;
    const m = open.exec(xml);
    if (!m) break;
    out += xml.slice(at, m.index);
    // walk to the matching close: every inner open adds one, every close takes one
    let depth = 1;
    let p = m.index + m[0].length;
    const inner = new RegExp(`<w:${tag}[\\s>]|</w:${tag}>`, "g");
    inner.lastIndex = p;
    for (let n = inner.exec(xml); n; n = inner.exec(xml)) {
      depth += n[0] === close ? -1 : 1;
      p = inner.lastIndex;
      if (!depth) break;
    }
    at = depth ? xml.length : p; // an unclosed tag swallows the rest: nothing after it is read
    count++;
  }
  return { xml: out + xml.slice(at), count };
}

/** the style ids of the file that are headings or the title (by id, and by the name the styles part gives them) */
function headingStyles(styles: string): { title: Set<string>; heading: Set<string> } {
  const title = new Set<string>(["Title"]);
  const heading = new Set<string>();
  for (const s of spans(styles, "w:style")) {
    const id = /^<w:style\s[^>]*w:styleId="([^"]+)"/.exec(s.text)?.[1];
    if (!id) continue;
    const name = /<w:name\s+w:val="([^"]+)"/.exec(s.text)?.[1] ?? "";
    if (/^title$/i.test(name) || /^عنوان$/.test(name)) title.add(id);
    else if (/^heading\s*\d$/i.test(name) || /^عنوان\s*\d$/.test(name) || /^Subtitle$/i.test(name)) heading.add(id);
  }
  return { title, heading };
}

const BOLD = /<w:b(?:\s+w:val="([^"]*)")?\s*\/>|<w:bCs(?:\s+w:val="([^"]*)")?\s*\/>/;
const isBold = (rpr: string) => {
  const m = BOLD.exec(rpr);
  if (!m) return false;
  const v = (m[1] ?? m[2] ?? "1").toLowerCase();
  return !(v === "0" || v === "false" || v === "off");
};

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿ]/;
const LATIN = /[A-Za-z]/;

/** Reads the document part of a Word file into blocks. Throws DocxError with a plain sentence when there is nothing to read. */
export async function readWordBody(zip: JSZip): Promise<WordBody> {
  const doc = await partText(zip, "word/document.xml");
  const open = doc?.indexOf("<w:body>") ?? -1;
  const close = doc?.lastIndexOf("</w:body>") ?? -1;
  if (!doc || open < 0 || close < open) throw new DocxError("ده مش ملف Word (.docx) سليم: مفيش فيه نص المستند");
  let xml = printedText(doc.slice(open + "<w:body>".length, close)); // what prints: no deleted or hidden text, no tracked-change leftovers

  const dropped = new Set<DraftImport["dropped"][number]>();
  const tables = stripNested(xml, "tbl");
  if (tables.count) dropped.add("tables");
  xml = tables.xml;
  // pictures and drawn shapes (a text box's text is inside the drawing, so it goes with it); the fallback copy of a shape is inside AlternateContent
  // (every cut below is one pass with indexOf, src/lib/word/scan.ts: a file of unclosed tags costs one read, not the square of its size)
  const shapes = replaceSpans(xml, "mc:AlternateContent", () => "<w:drawing/>");
  if (/<w:drawing[\s>/]|<w:pict[\s>]|<w:object[\s>]/.test(shapes)) dropped.add("images");
  xml = replaceSpans(replaceSpans(replaceSpans(shapes, "w:drawing", () => ""), "w:pict", () => ""), "w:object", () => "");
  if (/<w:(?:footnote|endnote)Reference[\s/]/.test(xml)) dropped.add("footnotes");
  if (countOpens(xml, "w:p") > MAX_PARAGRAPHS) throw new DocxError("الملف طويل زيادة عن اللزوم");

  const styles = headingStyles((await partText(zip, "word/styles.xml")) ?? "");
  const blocks: DraftBlock[] = [];
  for (const para of spans(xml, "w:p")) {
    const p = para.text;
    const ppr = firstSpan(p, "w:pPr") ?? "";
    let text = "";
    const marks: Mark[] = [];
    // runs and the parts of a run, in order: text, a tab (a space), a line break
    for (const run of spans(p, "w:r")) {
      const rpr = firstSpan(run.text, "w:rPr") ?? "";
      const from = text.length;
      textParts(rpr ? run.text.replace(rpr, "") : run.text, (kind, t) => { text += kind === "t" ? unescapeXml(t) : kind === "tab" ? " " : "\n"; });
      if (text.length > from && isBold(rpr)) marks.push({ k: "b", s: from, e: text.length });
    }
    // a paragraph is cut at its edges like the export does (the marks move with the cut)
    const lead = text.length - text.trimStart().length;
    const clean = text.trim();
    if (!clean) continue;
    if (clean.length > MAX_TEXT) throw new DocxError("فيه فقرة في الملف طويلة زيادة عن اللزوم");
    const style = attr(/<w:pStyle\s[^>]*>/.exec(ppr)?.[0] ?? "", "w:val");
    const outline = /<w:outlineLvl\s+w:val="[0-8]"/.test(ppr);
    const t: "title" | "h" | "p" = style && styles.title.has(style) ? "title" : (style && (styles.heading.has(style) || /^Heading\d$/i.test(style))) || outline ? "h" : "p";
    const ltr = !/<w:bidi(?:\s+w:val="(?:0|false|off)")?\s*\/>/.test(ppr) && !ARABIC.test(clean) && LATIN.test(clean);
    blocks.push(normalizeBlock({ t, text: clean, marks: marks.map((k) => ({ ...k, s: k.s - lead, e: k.e - lead })), ...(ltr ? { dir: "ltr" as const } : {}) }));
    if (blocks.length > MAX_BLOCKS) throw new DocxError("الملف طويل زيادة عن اللزوم (أكتر من 500 فقرة)");
  }
  if (!blocks.length) throw new DocxError("مفيش نص في الملف ده");
  return { blocks, dropped: [...dropped] };
}
