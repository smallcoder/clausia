/**
 * The Word export of a draft (PR 6b). Print-ready: the text of the draft and nothing else: no source chips, no «Clausia», no «مصدر», no marks of any kind.
 * A value the case file did not have is a dotted line (the lawyer fills it in Word); a section only he writes (the grounds, the requests) is its heading
 * and, when it is empty, an empty paragraph.
 *
 * With an office style (the lawyer's own Word file): the file is KEPT and only its body is replaced. So the header, the footer (with any letterhead
 * picture), the margins, the paper size and the styles are exactly his; the paragraphs we write use the font and size read from the file.
 * Without one: a plain A4 page, right to left, in Traditional Arabic 16 pt (the app asks for the office style the first time).
 * The file's other leftovers are scrubbed (the title and author in its properties, comments, notes, custom properties): the file the lawyer gave as a
 * sample may come from another client's case, and nothing of that may travel into this draft.
 */
import JSZip from "jszip";
import type { DraftBody } from "@/lib/library/types";
import { DOCX_MIME, DocxError, escapeXml, openDocx, partText, printedText } from "./docx";
import { readOfficeStyle } from "./office-style";

export { DOCX_MIME };
/** what stands for a value the file did not have (and for any placeholder left in a text) */
export const BLANK = "……………";
const PLACEHOLDER = /\{\{[^{}]*\}\}/g;

export interface ExportBlock { kind: "title" | "h" | "p"; text: string }

/** The draft's blocks as plain paragraphs (a text with several lines becomes several paragraphs; a blank spot becomes a dotted line). */
export function exportBlocks(body: DraftBody): ExportBlock[] {
  const out: ExportBlock[] = [];
  const lines = (kind: ExportBlock["kind"], text: string) => { for (const l of text.replace(PLACEHOLDER, BLANK).split("\n")) out.push({ kind, text: l.trim() }); };
  for (const b of body.blocks) {
    if (b.t === "lawyer") {
      out.push({ kind: "h", text: b.heading });
      if (b.text.trim()) lines("p", b.text); else out.push({ kind: "p", text: "" });
    } else lines(b.t, b.text);
  }
  return out;
}

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const DEFAULT_FONT = "Traditional Arabic";
const DEFAULT_SIZE = 32; // half-points: 16 pt

function paragraph(b: ExportBlock, font: string | null, size: number | null): string {
  const sz = size === null ? "" : `<w:sz w:val="${b.kind === "title" ? size + 4 : size}"/><w:szCs w:val="${b.kind === "title" ? size + 4 : size}"/>`;
  const fonts = font ? `<w:rFonts w:ascii="${escapeXml(font)}" w:hAnsi="${escapeXml(font)}" w:cs="${escapeXml(font)}"/>` : "";
  const bold = b.kind === "p" ? "" : "<w:b/><w:bCs/>";
  const ppr = `<w:pPr>${b.kind === "h" || b.kind === "title" ? "<w:keepNext/>" : ""}<w:bidi/>${b.kind === "title" ? '<w:jc w:val="center"/>' : ""}</w:pPr>`;
  if (!b.text) return `<w:p>${ppr}</w:p>`;
  return `<w:p>${ppr}<w:r><w:rPr>${fonts}${bold}${sz}<w:rtl/></w:rPr><w:t xml:space="preserve">${escapeXml(b.text)}</w:t></w:r></w:p>`;
}

const DEFAULT_SECT = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/><w:bidi/></w:sectPr>`;
const XML_HEAD = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;

const coreXml = (title: string) => `${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(title)}</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`;

/** a plain A4 right-to-left document: the lawyer has not given an office style yet */
async function plainDocx(blocks: ExportBlock[], title: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  zip.file("_rels/.rels", `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  zip.file("word/_rels/document.xml.rels", `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/styles" Target="styles.xml"/></Relationships>`);
  zip.file("word/styles.xml", `${XML_HEAD}<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${DEFAULT_FONT}" w:hAnsi="${DEFAULT_FONT}" w:cs="${DEFAULT_FONT}"/><w:sz w:val="${DEFAULT_SIZE}"/><w:szCs w:val="${DEFAULT_SIZE}"/><w:lang w:val="ar-EG" w:bidi="ar-EG"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`);
  zip.file("docProps/core.xml", coreXml(title));
  zip.file("word/document.xml", `${XML_HEAD}<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${blocks.map((b) => paragraph(b, null, null)).join("")}${DEFAULT_SECT}</w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

interface Rel { id: string; type: string; target: string; external: boolean; tag: string }

/** the relationships of a rels part, with the tag text each came from */
async function relsOf(zip: JSZip, relsPart: string): Promise<Rel[]> {
  const xml = await partText(zip, relsPart);
  return [...(xml ?? "").matchAll(/<Relationship\s[^>]*>/g)].map((m) => ({
    id: /\sId="([^"]*)"/.exec(m[0])?.[1] ?? "", type: /\sType="([^"]*)"/.exec(m[0])?.[1] ?? "", target: /\sTarget="([^"]*)"/.exec(m[0])?.[1] ?? "",
    external: /TargetMode="External"/.test(m[0]), tag: m[0],
  }));
}

/** removes the relationships of `relsPart` that `drop` picks; a rels part left with none is removed */
async function dropRels(zip: JSZip, relsPart: string, drop: (r: Rel) => boolean) {
  const xml = await partText(zip, relsPart);
  if (xml === null) return;
  const rels = await relsOf(zip, relsPart);
  let out = xml;
  for (const r of rels) if (drop(r)) out = out.replace(r.tag, "");
  if (!rels.some((r) => !drop(r))) zip.remove(relsPart); else zip.file(relsPart, out);
}

/** `a/b/` + `../c.xml` → `a/c.xml` (the part a relationship points at; a target starting with / is from the package root) */
function resolvePart(baseDir: string, target: string): string {
  const out: string[] = target.startsWith("/") ? [] : baseDir.split("/").filter(Boolean);
  for (const seg of target.replace(/^\//, "").split("/")) { if (seg === "..") out.pop(); else if (seg && seg !== ".") out.push(seg); }
  return out.join("/");
}

/** Removes every part nothing points at any more (walking the relationships from the package root) and the content-type entries of the removed parts. */
async function collect(zip: JSZip) {
  const keep = new Set<string>(["[Content_Types].xml"]);
  const queue: { part: string | null; rels: string; dir: string }[] = [{ part: null, rels: "_rels/.rels", dir: "" }];
  while (queue.length) {
    const { rels, dir } = queue.pop()!;
    if (keep.has(rels) || !zip.file(rels)) continue;
    keep.add(rels);
    for (const r of await relsOf(zip, rels)) {
      if (r.external) continue;
      const part = resolvePart(dir, r.target);
      if (!zip.file(part) || keep.has(part)) continue;
      keep.add(part);
      const i = part.lastIndexOf("/");
      queue.push({ part, rels: `${part.slice(0, i + 1)}_rels/${part.slice(i + 1)}.rels`, dir: part.slice(0, i + 1) });
    }
  }
  const gone = Object.keys(zip.files).filter((n) => !zip.files[n].dir && !keep.has(n));
  for (const n of gone) zip.remove(n);
  const ct = await partText(zip, "[Content_Types].xml");
  if (ct && gone.length) zip.file("[Content_Types].xml", ct.replace(/<Override\s[^>]*>/g, (m) => (gone.includes((/PartName="\/([^"]*)"/.exec(m)?.[1] ?? "")) ? "" : m)));
}

/** the parts a document needs whether or not its text points at them */
const KEEP_TYPE = /\/(styles|settings|theme|fontTable|webSettings|numbering|footnotes|endnotes|stylesWithEffects)$/;


/**
 * Takes the lawyer's sample (or template) file clean. The file may come from another client's case, and nothing of that may travel into a draft:
 *  - its properties (title, author, keywords), custom and extended properties (company, titles of parts), the thumbnail of its first page, its custom XML
 *    and the path of its attached template go;
 *  - its comments (and who wrote them) go;
 *  - every picture, embedded object, link and header / footer that the document text no longer points at goes (the body of a sample is replaced, so its
 *    pictures (a signature, an exhibit) are dropped; the header and footer the section still points at, with their pictures, stay);
 *  - unless `keepNotes` (a template is the lawyer's own document: its notes stay) the footnotes and endnotes are emptied.
 */
export async function scrub(zip: JSZip, title: string, opts: { keepNotes?: boolean } = {}) {
  if (zip.file("docProps/core.xml")) zip.file("docProps/core.xml", coreXml(title));
  await dropRels(zip, "_rels/.rels", (r) => /\/(custom-properties|extended-properties)$|\/thumbnail$/.test(r.type));
  const doc = (await partText(zip, "word/document.xml")) ?? "";
  const used = new Set([...doc.matchAll(/r:(?:id|embed|link|pict)="([^"]+)"/g)].map((m) => m[1]));
  await dropRels(zip, "word/_rels/document.xml.rels", (r) => /\/(comments|commentsExtended|commentsIds|commentsExtensible|people|customXml|glossaryDocument)$/.test(r.type) || (!KEEP_TYPE.test(r.type) && !used.has(r.id)));
  // the settings: the attached template (a path on the lawyer's own computer), the document variables and the mail merge (a data source, its fields and
  // values: the sample's own), and track changes (the draft starts clean). The relationships of the settings (they only point at those) go with them.
  const settings = await partText(zip, "word/settings.xml");
  if (settings) {
    zip.file("word/settings.xml", settings
      .replace(/<w:docVars\b[^>]*\/>|<w:docVars\b[^>]*>[\s\S]*?<\/w:docVars>/g, "")
      .replace(/<w:mailMerge\b[^>]*\/>|<w:mailMerge\b[^>]*>[\s\S]*?<\/w:mailMerge>/g, "")
      .replace(/<w:(?:attachedTemplate|trackRevisions)\b[^>]*\/>/g, "")
      .replace(/<w:\w+\b[^>]*\sr:id="[^"]*"[^>]*\/>/g, "")); // anything else that still names a relationship we are about to drop
  }
  await dropRels(zip, "word/_rels/settings.xml.rels", () => true);
  if (!opts.keepNotes) {
    for (const [p, tag] of [["footnotes", "footnote"], ["endnotes", "endnote"]] as const) {
      if (!zip.file(`word/${p}.xml`)) continue;
      zip.file(`word/${p}.xml`, `${XML_HEAD}<w:${p} xmlns:w="${W}"><w:${tag} w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:${tag}><w:${tag} w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:${tag}></w:${p}>`);
    }
  }
  await collect(zip);
  // the header and footer that stay: what they print
  for (const n of Object.keys(zip.files)) {
    if (!/^word\/(?:header|footer)\d*\.xml$/.test(n)) continue;
    const xml = await partText(zip, n);
    if (xml !== null) zip.file(n, printedText(xml));
  }
}

/** The lawyer's own file with a new body: his header, footer, margins and styles stay; the paragraphs use his font and size. */
async function onOfficePaper(blocks: ExportBlock[], title: string, office: Uint8Array): Promise<Uint8Array> {
  const zip = await openDocx(office);
  const style = await readOfficeStyle(zip);
  const doc = (await partText(zip, "word/document.xml")) ?? "";
  const open = doc.indexOf("<w:body>");
  const close = doc.lastIndexOf("</w:body>");
  if (open < 0 || close < open) throw new DocxError("ملف ورق المكتب شكله غير مفهوم");
  // the section of the body (header / footer references, margins, paper): the last one of the file, kept exactly
  const sects = [...doc.slice(open, close).matchAll(/<w:sectPr(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:sectPr>)/g)];
  const sect = sects.length ? sects[sects.length - 1][0] : DEFAULT_SECT;
  const paras = blocks.map((b) => paragraph(b, style.fonts.body, style.fonts.size ?? DEFAULT_SIZE)).join("");
  zip.file("word/document.xml", `${doc.slice(0, open)}<w:body>${paras}${sect}${doc.slice(close)}`);
  await scrub(zip, title);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/** The .docx bytes: on the office's paper when `office` (the bytes of the Word file the style came from) is given, else a plain page. */
export async function buildDocx(body: DraftBody, opts: { title: string; office?: Uint8Array | null }): Promise<Uint8Array> {
  const blocks = exportBlocks(body);
  return opts.office ? onOfficePaper(blocks, opts.title, opts.office) : plainDocx(blocks, opts.title);
}

