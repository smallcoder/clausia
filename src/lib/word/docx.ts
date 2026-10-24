/**
 * Word files (PR 6b): the small shared part. JSZip is the one library: a .docx is a zip of XML parts, and everything the app does with Word is
 * "read a few parts" (the office style, the placeholders of an uploaded template) or "write the body and keep every other part" (the export).
 * Why JSZip alone and not `docx` (writer) + `mammoth` (reader): the office style is the lawyer's OWN file (letterhead image, header, footer, fonts, margins),
 * and the safest way to keep all of it is to keep the file and replace only the body; a writer library would rebuild a new document and lose it, and
 * `mammoth` turns a file into HTML and drops exactly the header, footer and margins we need. One dependency, one way to open a file, no rebuild.
 * Pure code: no server imports, so the tests and the browser-side checks can use it.
 */
import JSZip from "jszip";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/** the biggest Word file we open (the storage bucket allows 25 MB; a letterhead and a few pages are far below this) */
export const MAX_DOCX_BYTES = 8 * 1024 * 1024;
const MAX_PARTS = 500;
/** what all the parts together may inflate to (a «zip bomb» check, done from the sizes in the zip's index before anything is inflated) */
const MAX_INFLATED_BYTES = 80 * 1024 * 1024;

export class DocxError extends Error {}

/** True for a file name or type that says Word (the browser reports an empty type for some .docx). */
export const looksLikeDocx = (name: string, type: string) => /\.docx$/i.test(name) || type === DOCX_MIME;

/** Opens a .docx and checks it is one: a zip with `word/document.xml`, a sane number of parts and a sane inflated size. Plain Arabic errors. */
export async function openDocx(bytes: Uint8Array | ArrayBuffer): Promise<JSZip> {
  const size = bytes instanceof ArrayBuffer ? bytes.byteLength : bytes.length;
  if (size > MAX_DOCX_BYTES) throw new DocxError("الملف أكبر من 8 ميجابايت");
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); } catch { throw new DocxError("ده مش ملف Word (.docx) سليم"); }
  const names = Object.keys(zip.files);
  if (!zip.file("word/document.xml")) throw new DocxError("ده مش ملف Word (.docx) سليم: مفيش فيه نص المستند");
  if (names.length > MAX_PARTS) throw new DocxError("ملف Word ده معقد زيادة عن اللزوم");
  // JSZip keeps the size from the zip's index on each entry (`_data.uncompressedSize`); a file that claims more than we accept is not opened
  const inflated = names.reduce((n, k) => n + ((zip.files[k] as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0), 0);
  if (inflated > MAX_INFLATED_BYTES) throw new DocxError("ملف Word ده كبير زيادة عن اللزوم");
  return zip;
}

export async function partText(zip: JSZip, name: string): Promise<string | null> {
  const f = zip.file(name);
  return f ? f.async("string") : null;
}

export const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const unescapeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");

/** an attribute of an XML start tag, namespace prefix included (`w:val`, `r:id`) */
export function attr(tag: string, name: string): string | null {
  const m = new RegExp(`(?:^|[\\s<])${name.replace(":", "\\:")}="([^"]*)"`).exec(tag);
  return m ? unescapeXml(m[1]) : null;
}

/** The paragraphs of a part: each one's text (runs joined, tabs as a space, line breaks as a newline). Empty paragraphs are kept as "". */
export function paragraphsOf(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)) {
    const p = m[0];
    let text = "";
    for (const r of p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>|<w:cr\s*\/>/g)) {
      if (r[1] !== undefined) text += unescapeXml(r[1]);
      else text += r[0].startsWith("<w:tab") ? " " : "\n";
    }
    out.push(text);
  }
  return out;
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
  const all = [...documentXml.matchAll(/<w:sectPr(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:sectPr>)/g)];
  return all.length ? all[all.length - 1][0] : null;
}
