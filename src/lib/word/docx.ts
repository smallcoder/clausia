/**
 * Word files (PR 6b): the small shared part. JSZip is the one library: a .docx is a zip of XML parts, and everything the app does with Word is
 * "read a few parts" (the office style, the placeholders of an uploaded template) or "write the body and keep every other part" (the export).
 * Why JSZip alone and not `docx` (writer) + `mammoth` (reader): the office style is the lawyer's OWN file (letterhead image, header, footer, fonts, margins),
 * and the safest way to keep all of it is to keep the file and replace only the body; a writer library would rebuild a new document and lose it, and
 * `mammoth` turns a file into HTML and drops exactly the header, footer and margins we need. One dependency, one way to open a file, no rebuild.
 * Pure code: no server imports, so the tests and the browser-side checks can use it.
 */
import JSZip from "jszip";
import { replaceSpans, spans, textParts } from "./scan";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/** the biggest Word file we open (the storage bucket allows 25 MB; a letterhead and a few pages are far below this) */
export const MAX_DOCX_BYTES = 8 * 1024 * 1024;
const MAX_PARTS = 500;

export class DocxError extends Error {}

/** True for a file name or type that says Word (the browser reports an empty type for some .docx). */
export const looksLikeDocx = (name: string, type: string) => /\.docx$/i.test(name) || type === DOCX_MIME;

/** the biggest a part may really be, and all parts together, counted from the bytes that come out of the zip (never from the sizes the file declares) */
export const MAX_PART_BYTES = 20 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 80 * 1024 * 1024;

interface InternalStream { on(e: "data", f: (c: Uint8Array) => void): InternalStream; on(e: "end", f: () => void): InternalStream; on(e: "error", f: (err: Error) => void): InternalStream; pause(): InternalStream; resume(): InternalStream }

/**
 * THE way a part is read (every read of a part in this app goes through here): the bytes are counted as they come out of the decompressor, and the read
 * STOPS the moment a part goes over MAX_PART_BYTES or `budget` (the parts of this file together) goes over MAX_TOTAL_BYTES. The sizes a zip declares in its
 * headers are not trusted: a few KB can claim to be 1000 bytes and inflate to hundreds of MB. `keep: false` counts and discards.
 */
export async function readPart(zip: JSZip, name: string, budget: { used: number } = { used: 0 }, keep = true): Promise<Uint8Array | null> {
  const entry = zip.file(name);
  if (!entry) return null;
  const stream = (entry as unknown as { internalStream(t: "uint8array"): InternalStream }).internalStream("uint8array");
  return new Promise<Uint8Array | null>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let n = 0;
    let done = false;
    const fail = (e: Error) => { if (!done) { done = true; stream.pause(); reject(e); } };
    stream.on("data", (c) => {
      if (done) return;
      n += c.length; budget.used += c.length;
      if (n > MAX_PART_BYTES || budget.used > MAX_TOTAL_BYTES) return fail(new DocxError("ملف Word ده كبير زيادة عن اللزوم"));
      if (keep) chunks.push(c);
    });
    stream.on("error", () => fail(new DocxError("ده مش ملف Word (.docx) سليم")));
    stream.on("end", () => {
      if (done) return;
      done = true;
      const out = new Uint8Array(keep ? n : 0);
      let at = 0;
      for (const c of chunks) { out.set(c, at); at += c.length; }
      resolve(out);
    });
    stream.resume();
  });
}

/** Opens a .docx and checks it is one: a zip with `word/document.xml`, a sane number of parts, and parts that REALLY inflate to a sane size (every part is read once, counted, here). Plain Arabic errors. */
export async function openDocx(bytes: Uint8Array | ArrayBuffer): Promise<JSZip> {
  const size = bytes instanceof ArrayBuffer ? bytes.byteLength : bytes.length;
  if (size > MAX_DOCX_BYTES) throw new DocxError("الملف أكبر من 8 ميجابايت");
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); } catch { throw new DocxError("ده مش ملف Word (.docx) سليم"); }
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  if (!zip.file("word/document.xml")) throw new DocxError("ده مش ملف Word (.docx) سليم: مفيش فيه نص المستند");
  if (names.length > MAX_PARTS) throw new DocxError("ملف Word ده معقد زيادة عن اللزوم");
  const budget = { used: 0 };
  for (const n of names) await readPart(zip, n, budget, false);
  return zip;
}

/** the biggest `word/document.xml`, and any other XML part, that the readers parse (a letterhead and a few pages are far below: 4 MB is thousands of pages of text) */
export const MAX_DOCUMENT_XML = 4 * 1024 * 1024;
export const MAX_OTHER_XML = 3 * 1024 * 1024;
const TOO_BIG = "ملف Word ده كبير زيادة عن اللزوم";

/**
 * Is every `<` closed by a `>` before the next `<`? Word never writes anything else (a `<` inside text or an attribute is escaped). One pass. It is what keeps
 * every `[^>]*` of the readers inside ITS OWN tag: with it a tag can not run on to the end of the part, so no regex of the readers can cost more than one pass
 * (80,000 `<w:a ` with no `>` after them would otherwise make each of them read to the end: the square of the size).
 */
export function wellFormedTags(xml: string): boolean {
  let i = xml.indexOf("<");
  while (i >= 0) {
    const gt = xml.indexOf(">", i + 1);
    if (gt < 0) return false;
    const next = xml.indexOf("<", i + 1);
    if (next >= 0 && next < gt) return false;
    i = next;
  }
  return true;
}

/** A part as text. The size is capped and the tags must be well formed (see above): a part that is not is refused with a plain sentence, before any reader sees it. */
export async function partText(zip: JSZip, name: string): Promise<string | null> {
  const bytes = await readPart(zip, name);
  if (!bytes) return null;
  if (bytes.length > (name === "word/document.xml" ? MAX_DOCUMENT_XML : MAX_OTHER_XML)) throw new DocxError(TOO_BIG);
  const text = new TextDecoder("utf-8").decode(bytes);
  if (!wellFormedTags(text)) throw new DocxError("ده مش ملف Word (.docx) سليم");
  return text;
}

/** characters XML 1.0 does not allow (most control characters) and lone surrogates: dropped from any text that goes into a part */
const BAD_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
export const xmlSafe = (s: string) => s.replace(BAD_XML_CHARS, "");
export const escapeXml = (s: string) => xmlSafe(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** a character reference is read only when it is a valid XML character (a number past 0x10FFFF, a surrogate or a control code is dropped, never thrown on) */
const fromCode = (code: number) => (Number.isInteger(code) && code >= 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? xmlSafe(String.fromCodePoint(code)) : "");
export const unescapeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d{1,8});/g, (_, n) => fromCode(Number(n))).replace(/&#x([0-9a-f]{1,8});/gi, (_, n) => fromCode(parseInt(n, 16))).replace(/&amp;/g, "&");

/** an attribute of an XML start tag, namespace prefix included (`w:val`, `r:id`) */
export function attr(tag: string, name: string): string | null {
  const m = new RegExp(`(?:^|[\\s<])${name.replace(":", "\\:")}="([^"]*)"`).exec(tag);
  return m ? unescapeXml(m[1]) : null;
}

/** The paragraphs of a part: each one's text (runs joined, tabs as a space, line breaks as a newline). Empty paragraphs are kept as "". */
export function paragraphsOf(xml: string): string[] {
  return spans(xml, "w:p").map((p) => {
    let text = "";
    textParts(p.text, (kind, t) => { text += kind === "t" ? unescapeXml(t) : kind === "tab" ? " " : "\n"; });
    return text;
  });
}

/** a paragraph-level check that a part has pictures (a logo in a letterhead) */
export const hasPicture = (xml: string) => /<w:drawing[\s>]|<w:pict[\s>]|<v:imagedata/.test(xml);

/** The relationships of a part: id → { type, target }. */
export function relationships(xml: string | null): Map<string, { type: string; target: string }> {
  const out = new Map<string, { type: string; target: string }>();
  for (const m of (xml ?? "").matchAll(/<Relationship\s[^>]*>/g)) {
    const id = attr(m[0], "Id"), type = attr(m[0], "Type"), target = attr(m[0], "Target");
    if (id && type && target) out.set(id, { type, target });
  }
  return out;
}

/** The section properties of the BODY (the last `sectPr` of the document: the earlier ones are inside paragraphs, they belong to earlier sections). */
export function bodySectPr(documentXml: string): string | null {
  const all = spans(documentXml, "w:sectPr");
  return all.length ? all[all.length - 1].text : null;
}

/**
 * The text of a kept header or footer as it prints: an insertion is kept (its text), a deletion is dropped (a tracked deletion is still in the file), a run
 * marked hidden (`w:vanish`) is dropped, and the old values a tracked property change keeps are dropped. Nothing is touched that could leave the XML unbalanced.
 */
export function printedText(xml: string): string {
  let s = xml
    .replace(/<w:(?:del|moveFrom)\s[^>]*\/>/g, "").replace(/<w:(?:ins|moveTo)\s[^>]*\/>/g, "") // a tracked paragraph mark
    .replace(/<\/?w:(?:ins|moveTo)(?:\s[^>]*)?>/g, "");
  for (const tag of ["w:del", "w:moveFrom", "w:rPrChange", "w:pPrChange", "w:sectPrChange", "w:tblPrChange", "w:tcPrChange", "w:trPrChange", "w:numPrChange"]) s = replaceSpans(s, tag, () => "");
  return replaceSpans(s, "w:r", (run) => (/<w:vanish(?:\s+w:val="(?:1|true|on)")?\s*\/>/.test(run) && !/<w:r[\s>]/.test(run.slice(4)) ? "" : run));
}
