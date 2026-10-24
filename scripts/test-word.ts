// PR 6b (ورق المكتب + Word): tests with FAKE Db and Word files made in code (scripts/word-fixtures.ts). Nothing is read from anywhere, nothing is written.
//  (a) the office style is READ from a Word file: header, footer, picture, font, size, margins, paper
//  (b) the export on the office's paper: it opens, the header, footer, picture, margins and section are the file's own, the paragraphs are the draft's,
//      NO «Clausia», no source chip, no placeholder, none of the sample's own text (another client), and every XML part is well-formed
//  (c) the export with no office style yet: a plain right-to-left A4 page that opens
//  (d) the lawyer's own Word template: placeholders (even split over runs) filled INTO the file, its formatting, tab and header kept; unknown ones empty
//  (e) a file that is not a Word file, is too big, or is a zip bomb is refused with a plain sentence
//  (f) set_office_style / add_office_template through applyOp (the lawyer's own uploads): rows, undo, refusals; the model can not make them
//  (g) exportDraft with a fake Db and a fake storage: which file is used when
//  (h) live, read-only: the new tables through RLS (the demo office has no style yet)
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-word.ts
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import JSZip from "jszip";
import type { DraftBody, DraftFill } from "@/lib/library/types";
import type { Db } from "@/lib/supabase/server";
import { applyOp, MANUAL } from "@/lib/tools/apply";
import { INTERNAL_TOOLS, writeToolSpecs } from "@/lib/tools/registry";
import { BLANK, buildDocx, exportBlocks } from "@/lib/word/build";
import { DocxError, MAX_DOCX_BYTES, MAX_PART_BYTES, MAX_TOTAL_BYTES, escapeXml, looksLikeDocx, openDocx, paragraphsOf, partText, printedText, unescapeXml } from "@/lib/word/docx";
import { exportDraft, loadOfficeStyle } from "@/lib/word/export";
import { readOfficeStyle, twipsToCm } from "@/lib/word/office-style";
import { extractTemplateBody, fillDocxTemplate, knownKey } from "@/lib/word/template";
import { LOGO_PNG, makeOfficeDocx, makeTemplateDocx } from "./word-fixtures";

let fails = 0;
const check = (ok: boolean, what: string, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`); if (!ok) fails++; };
const eq = (got: unknown, want: unknown, what: string) => check(JSON.stringify(got) === JSON.stringify(want), what, `got ${JSON.stringify(got)}${JSON.stringify(got) === JSON.stringify(want) ? "" : `, want ${JSON.stringify(want)}`}`);
const rejects = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e instanceof Error ? e.message : String(e); } };
const text = async (z: JSZip, n: string) => (await z.file(n)?.async("string")) ?? "";
const parts = (z: JSZip) => Object.keys(z.files).filter((n) => !z.files[n].dir);
const allText = async (z: JSZip) => (await Promise.all(parts(z).filter((n) => /\.(xml|rels)$/.test(n)).map((n) => text(z, n)))).join("\n");

/** every XML part is well-formed (xmllint, which is on every Mac and Linux box) */
async function wellFormed(z: JSZip): Promise<string[]> {
  const dir = mkdtempSync(join(tmpdir(), "docx-"));
  const bad: string[] = [];
  try {
    for (const n of parts(z).filter((p) => /\.(xml|rels)$/.test(p))) {
      const f = join(dir, n.replace(/[^\w.]/g, "_"));
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, await z.file(n)!.async("uint8array"));
      try { execFileSync("xmllint", ["--noout", f], { stdio: "pipe" }); } catch (e) { bad.push(`${n}: ${String((e as { stderr?: Buffer }).stderr ?? e).slice(0, 120)}`); }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return bad;
}
/** every relationship points at a part that exists (an external link is skipped), every content-type override at a part that exists */
async function consistent(z: JSZip): Promise<string[]> {
  const bad: string[] = [];
  for (const rn of parts(z).filter((p) => p.endsWith(".rels"))) {
    const base = rn.replace(/_rels\/[^/]*\.rels$/, "");
    for (const m of (await text(z, rn)).matchAll(/<Relationship\s[^>]*>/g)) {
      const t = /Target="([^"]+)"/.exec(m[0])?.[1];
      if (!t || /TargetMode="External"/.test(m[0])) continue;
      const path = t.startsWith("/") ? t.slice(1) : `${base}${t}`;
      if (!z.file(path)) bad.push(`${rn} → ${t} is missing`);
    }
  }
  for (const m of (await text(z, "[Content_Types].xml")).matchAll(/<Override\s[^>]*PartName="\/([^"]+)"/g)) if (!z.file(m[1])) bad.push(`content type of ${m[1]} but no such part`);
  return bad;
}

/** a zip whose entry `name` declares `size` as its uncompressed size in the central directory AND the local header (the real data is unchanged) */
function lyingSizes(zip: Uint8Array, name: string, size: number): Uint8Array {
  const b = Buffer.from(zip);
  let p = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); // end of central directory
  p = b.readUInt32LE(p + 16); // where the central directory starts
  let done = false;
  while (b.readUInt32LE(p) === 0x02014b50) {
    const nl = b.readUInt16LE(p + 28), el = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32);
    if (b.subarray(p + 46, p + 46 + nl).toString("utf8") === name) {
      b.writeUInt32LE(size, p + 24);
      b.writeUInt32LE(size, b.readUInt32LE(p + 42) + 22);
      done = true;
    }
    p += 46 + nl + el + cl;
  }
  if (!done) throw new Error(`no entry ${name}`);
  return new Uint8Array(b);
}

const BODY: DraftBody = {
  version: 1,
  blocks: [
    { t: "title", text: "صحيفة استئناف" },
    { t: "p", text: "محكمة الاستئناف: {{court}}" },
    { t: "p", text: "الدعوى المستأنف حكمها: 4512 لسنة 2024" },
    { t: "h", text: "الوقائع" },
    { t: "p", text: "1/9/2022: حرر الطرفان عقد بيع الشقة.\n15/3/2026: امتنع البائع عن التوقيع." },
    { t: "lawyer", key: "grounds", heading: "أسباب الاستئناف", hint: "يكتبها المحامي", text: "", state: "empty" },
    { t: "lawyer", key: "requests", heading: "الطلبات", text: "الحكم بقبول الاستئناف شكلا.", state: "needs_confirmation" },
    { t: "p", text: "وكيل المستأنف: {{lawyer_name}}" },
  ],
};
const FILL: DraftFill = {
  filled: [{ key: "judgment_text", label: "منطوق الحكم", value: "حكمت المحكمة برفض الدعوى.", source: "حكم · ص 3" }, { key: "our_parties", label: "موكلنا", value: "سامح التجريبي", source: "الأطراف في الملف" }],
  missing: [{ key: "court", label: "المحكمة", reason: "x" }, { key: "lawyer_name", label: "اسم المحامي", reason: "x" }],
  lawyer: [{ key: "grounds", heading: "أسباب الاستئناف", state: "empty" }, { key: "requests", heading: "الطلبات", state: "needs_confirmation" }],
};

// ---------------------------------------------------------------- (a) the office style is read from a Word file
console.log("\n-- (a) the office style, read from a Word file --");
const OFFICE = await makeOfficeDocx();
{
  const st = await readOfficeStyle(await openDocx(OFFICE));
  eq(st.header.lines, ["مكتب الأستاذ التجريبي للمحاماة", "محامون ومستشارون قانونيون"], "the header's lines are read");
  eq(st.header.picture, true, "the header's picture (the logo) is noticed");
  eq(st.footer.lines, ["القاهرة — مدينة نصر — 01000000000"], "the footer's lines are read (the page-number field is not text)");
  eq(st.footer.picture, false, "the footer has no picture");
  eq(st.fonts, { body: "Simplified Arabic", size: 28 }, "the font and size are what the TEXT uses (not the styles' Calibri 11)");
  eq(st.margins, { top: 1701, bottom: 1418, left: 1134, right: 1134, header: 567, footer: 567 }, "the margins come from the last section");
  eq(st.page, { w: 11906, h: 16838 }, "the paper size (A4)");
  eq([twipsToCm(1701), twipsToCm(1134), twipsToCm(1418), twipsToCm(1440)], ["3", "2", "2.5", "2.5"], "twips shown as centimetres");
  // a file with no header, footer or run fonts: the styles' defaults
  const z = await JSZip.loadAsync(OFFICE);
  z.file("word/document.xml", (await text(z, "word/document.xml")).replace(/<w:rFonts[^>]*\/>|<w:sz [^>]*\/>|<w:szCs [^>]*\/>|<w:headerReference[^>]*\/>|<w:footerReference[^>]*\/>/g, ""));
  const bare = await readOfficeStyle(await openDocx(await z.generateAsync({ type: "uint8array" })));
  eq([bare.header.lines, bare.footer.lines, bare.fonts], [[], [], { body: "Arial", size: 22 }], "no header / footer / run fonts → empty lines and the document defaults (the Arabic font and size of the styles)");
}

// the header as it PRINTS: tracked insertions kept, tracked deletions and hidden text dropped
{
  const tracked = await makeOfficeDocx({ tracked: true });
  const st = await readOfficeStyle(await openDocx(tracked));
  eq(st.header.lines.at(-1), "نص مضاف ظاهر", "the office style's header lines are what prints: «نص مضاف» (an insertion) and «ظاهر» are in");
  check(!st.header.lines.join(" ").includes("محذوف") && !st.header.lines.join(" ").includes("مخفي"), "…a tracked deletion and a hidden run are not");
  const z = await openDocx(await buildDocx(BODY, { title: "x", office: tracked }));
  const hdr = await text(z, "word/header1.xml");
  check(hdr.includes("نص مضاف") && hdr.includes("ظاهر") && !hdr.includes("نص محذوف") && !hdr.includes("نص مخفي") && !hdr.includes("<w:ins") && !hdr.includes("<w:del") && !hdr.includes("vanish"), "the exported header keeps the insertion's text and has no deleted text, no hidden text, no revision marks");
  eq(await wellFormed(z), [], "…and is well-formed");
  eq(printedText("<w:p><w:r><w:t>a</w:t></w:r></w:p>"), "<w:p><w:r><w:t>a</w:t></w:r></w:p>", "printedText leaves a plain paragraph alone");
  eq(printedText('<w:p><w:pPr><w:rPr><w:del w:id="1"/></w:rPr></w:pPr><w:del w:id="2"><w:r><w:delText>gone</w:delText></w:r></w:del><w:r><w:t>kept</w:t></w:r></w:p>').includes("gone"), false, "a self-closing tracked mark does not swallow the text after it");
  check(printedText('<w:p><w:r><w:rPr><w:vanish w:val="0"/></w:rPr><w:t>shown</w:t></w:r></w:p>').includes("shown"), "vanish val=0 is not hidden");
  check(printedText('<w:p><w:r><w:rPr><w:rPrChange w:id="1"><w:rPr><w:b/></w:rPr></w:rPrChange></w:rPr><w:t>x</w:t></w:r></w:p>').includes("rPrChange") === false, "the old values of a tracked property change are dropped");
}
// XML-invalid characters never reach a part; a character reference can not throw
{
  const nasty = "أ\u0000ب\u0008ج\u000Bد\u000Cه\u000Ew\u001Fz\uD800y\uDC00x😀ok\uFFFE";
  eq(escapeXml(nasty), "أبجدهwzyx😀ok", "escapeXml drops control characters (kept: tab, newline, CR) and lone surrogates; a real emoji stays");
  const z = await openDocx(await buildDocx({ version: 1, blocks: [{ t: "p", text: nasty }, { t: "title", text: nasty }] }, { title: nasty, office: OFFICE }));
  eq(await wellFormed(z), [], "an export of text full of control characters and lone surrogates is well-formed");
  eq(paragraphsOf(await text(z, "word/document.xml")), ["أبجدهwzyx😀ok", "أبجدهwzyx😀ok"], "…and reads back without them");
  const plain = await openDocx(await buildDocx({ version: 1, blocks: [{ t: "p", text: nasty }] }, { title: nasty }));
  eq(await wellFormed(plain), [], "the plain page too");
  const tz = await openDocx(await makeTemplateDocx());
  await fillDocxTemplate(tz, () => nasty, nasty);
  eq(await wellFormed(tz), [], "a template filled with such a value is well-formed");
  let threw = false;
  let out: string[] = [];
  try { out = [unescapeXml("&#99999999;"), unescapeXml("&#xD800;"), unescapeXml("&#0;"), unescapeXml("&#x110000;"), unescapeXml("&#8;"), unescapeXml("&#65;&#x42;&#x1F600;"), unescapeXml("&#9;")]; } catch { threw = true; }
  check(!threw, "unescapeXml does not throw on an impossible character reference");
  eq(out, ["", "", "", "", "", "AB😀", "\t"], "…it drops them (a surrogate, a control code, past U+10FFFF) and reads the valid ones");
}

// ---------------------------------------------------------------- (b) the export on the office's paper
console.log("\n-- (b) the export on the office's paper --");
{
  const out = await buildDocx(BODY, { title: "صحيفة استئناف · سامح التجريبي", office: OFFICE });
  const z = await openDocx(out);
  check(true, "the export opens as a Word file (a zip with word/document.xml)");
  eq(await wellFormed(z), [], "every XML part is well-formed (xmllint)");
  eq(await consistent(z), [], "every relationship and content type points at a part that exists");
  const before = await openDocx(OFFICE);
  eq(await text(z, "word/header1.xml"), await text(before, "word/header1.xml"), "the HEADER part is the office's own, byte for byte");
  eq(await text(z, "word/footer1.xml"), await text(before, "word/footer1.xml"), "the FOOTER part is the office's own, byte for byte");
  check(!!z.file("word/media/logo.png") && Buffer.from(await z.file("word/media/logo.png")!.async("uint8array")).equals(LOGO_PNG), "the logo picture of the header is kept, byte for byte");
  eq(await text(z, "word/styles.xml"), await text(before, "word/styles.xml"), "the styles are the office's own");
  const doc = await text(z, "word/document.xml");
  const sect = /<w:sectPr[\s\S]*<\/w:sectPr>/.exec(doc)?.[0] ?? "";
  check(sect.includes('<w:headerReference w:type="default" r:id="rId2"/>') && sect.includes('<w:footerReference w:type="default" r:id="rId3"/>'), "the section still points at the header and the footer");
  check(sect.includes('w:top="1701"') && sect.includes('w:left="1134"') && sect.includes('w:w="11906"'), "the margins and the paper size are the file's own");
  const st = await readOfficeStyle(z);
  eq(st, await readOfficeStyle(before), "ROUND TRIP: reading the export gives the same header, footer, font, size, margins and paper as the file it was made on");
  const paras = paragraphsOf(doc);
  eq(paras, ["صحيفة استئناف", "محكمة الاستئناف: " + BLANK, "الدعوى المستأنف حكمها: 4512 لسنة 2024", "الوقائع", "1/9/2022: حرر الطرفان عقد بيع الشقة.", "15/3/2026: امتنع البائع عن التوقيع.", "أسباب الاستئناف", "", "الطلبات", "الحكم بقبول الاستئناف شكلا.", "وكيل المستأنف: " + BLANK], "the paragraphs are the draft's, a blank spot is a dotted line, an empty section is its heading and an empty paragraph");
  check(/w:rFonts w:ascii="Simplified Arabic"/.test(doc) && /<w:sz w:val="28"\/>/.test(doc) && /<w:rtl\/>/.test(doc) && /<w:bidi\/>/.test(doc), "the paragraphs use the office's font and size, right to left");
  // no marks
  const all = await allText(z);
  for (const bad of ["Clausia", "clausia", "كلاوزيا", "مصدر", "{{", "}}", "محتاجة تأكيدك", "يكتبها المحامي", "needs_confirmation", "الأطراف في الملف", "حكم · ص"]) check(!all.includes(bad), `the export has no «${bad}» anywhere`);
  // nothing of the sample's own text (it is about another client)
  for (const leak of ["عادل", "وليد التجريبي", "772", "سامح الافتراضي", "الإخلاء", "اسأل"]) check(!all.includes(leak), `nothing of the sample file leaks: «${leak}»`);
  check(!z.file("word/comments.xml") && !z.file("docProps/custom.xml"), "the sample's comments and custom properties are gone");
  check(!z.file("docProps/app.xml") && !z.file("docProps/thumbnail.jpeg") && !z.file("customXml/item1.xml"), "…and its extended properties (company, titles), the thumbnail of its first page and its custom XML");
  check(!z.file("word/media/signature.png"), "a picture in the sample's BODY (a signature, an exhibit of another client) is gone: nothing points at it any more");
  check(!(await allText(z)).includes("مكتب سامح") && !(await allText(z)).includes("example.com") && !(await allText(z)).includes("Normal.dotm"), "no company name, no link of the sample, no path of its attached template");
  check(!z.file("word/_rels/settings.xml.rels") && !(await text(z, "word/settings.xml")).includes("attachedTemplate") && (await text(z, "word/settings.xml")).includes("defaultTabStop"), "the attached template is cut out of the settings (the other settings stay)");
  check(!!z.file("word/media/logo.png") && !!z.file("word/_rels/header1.xml.rels"), "the header's own picture and its relationship stay");
  check(!z.file("word/glossary/document.xml") && !(await text(z, "word/_rels/document.xml.rels")).includes("glossary") && !(await text(z, "[Content_Types].xml")).includes("glossary"), "the sample's GLOSSARY (building blocks / AutoText: another client's text) is gone: part, relationship and content type");
  const st2 = await text(z, "word/settings.xml");
  check(!st2.includes("docVar") && !st2.includes("mailMerge") && !st2.includes("trackRevisions") && !/r:id=/.test(st2) && st2.includes("defaultTabStop"), "the settings lose the document variables, the mail merge and track changes (the other settings stay)");
  check(!z.file("word/_rels/settings.xml.rels") && !(await allText(z)).includes("عملاء-سامح") && !(await allText(z)).includes("نص تلقائي"), "…and the mail-merge data source and the glossary text are nowhere in the file");
  check(!(await text(z, "[Content_Types].xml")).includes("comments.xml") && !(await text(z, "[Content_Types].xml")).includes("docProps/app.xml") && !(await text(z, "[Content_Types].xml")).includes("customXml"), "the content types of the removed parts are gone");
  check(!(await text(z, "word/footnotes.xml")).includes("عادل") && (await text(z, "word/footnotes.xml")).includes("separator"), "the sample's footnotes are emptied (the separators stay: Word needs them)");
  const core = await text(z, "docProps/core.xml");
  check(core.includes("صحيفة استئناف · سامح التجريبي") && !core.includes("creator") && !core.includes("keywords"), "the file's properties carry only the draft's title (no author, no keywords of the sample)");
  eq(exportBlocks(BODY).filter((b) => b.text.includes("{{")).length, 0, "no placeholder is left in the blocks");
  // special characters
  const odd = await buildDocx({ version: 1, blocks: [{ t: "p", text: "شركة <أ> & ب \"ج\" 'د'" }] }, { title: "عنوان <&>", office: OFFICE });
  eq(await wellFormed(await openDocx(odd)), [], "text with < > & and quotes stays well-formed (escaped)");
  eq(paragraphsOf(await text(await openDocx(odd), "word/document.xml")), ["شركة <أ> & ب \"ج\" 'د'"], "…and reads back as typed");
}

// ---------------------------------------------------------------- (c) no office style yet
console.log("\n-- (c) the export with no office style --");
{
  const z = await openDocx(await buildDocx(BODY, { title: "صحيفة استئناف" }));
  eq(await wellFormed(z), [], "a plain export is well-formed");
  eq(await consistent(z), [], "…and consistent");
  const doc = await text(z, "word/document.xml");
  check(/<w:bidi\/>/.test(doc) && /w:w="11906"/.test(doc), "right to left, A4");
  check((await text(z, "word/styles.xml")).includes("Traditional Arabic"), "the default font is Traditional Arabic");
  check(!z.file("word/header1.xml") && !z.file("word/footer1.xml"), "no header and no footer (the office has not given its paper yet)");
  eq(paragraphsOf(doc).length, 11, "the same eleven paragraphs");
  const all = await allText(z);
  for (const bad of ["Clausia", "مصدر", "{{"]) check(!all.includes(bad), `no «${bad}»`);
}

// ---------------------------------------------------------------- (d) the lawyer's own Word template
console.log("\n-- (d) the lawyer's own Word template --");
const TEMPLATE = await makeTemplateDocx();
{
  const ex = await extractTemplateBody(await openDocx(TEMPLATE));
  eq(ex.found.sort(), ["case_number", "court", "facts_summary", "grounds", "our_parties", "requests"], "the placeholders the app knows are found, by their Arabic names («المحكمة» split over three runs, «رقم الدعوى», «موكلنا») and by key");
  eq(ex.unknown, ["اسم البنك"], "a placeholder the app does not know («اسم البنك») is listed as unknown");
  eq(ex.body.manual, [{ key: "field_a", label: "اسم البنك" }], "…and becomes a spot only the lawyer fills");
  eq(ex.body.blocks.filter((b) => b.t === "lawyer").map((b) => b.t === "lawyer" && b.key), ["grounds", "requests"], "{{الأسباب}} and {{الطلبات}} on a line of their own are the lawyer's sections");
  const p2 = ex.body.blocks[1];
  eq(p2.t === "p" && p2.text, "المحكمة: {{court}}", "a placeholder split over three runs reads as one");
  check(ex.body.blocks.every((b) => b.t === "lawyer" || !b.text.includes("{{الأسباب}}")), "the grounds placeholder is not left in a text block");
  eq(knownKey("المحكمة"), "court", "knownKey: a field name");
  eq(knownKey("court"), "court", "knownKey: a key");
  eq(knownKey("الموكل"), "client", "knownKey: an alias");
  eq(knownKey("اسم البنك"), null, "knownKey: unknown");

  const z = await openDocx(TEMPLATE);
  const values: Record<string, string> = { court: "محكمة استئناف القاهرة", case_number: "4512 لسنة 2024", our_parties: "سامح التجريبي", facts_summary: "وقعت واقعة.\nوتلتها أخرى." };
  await fillDocxTemplate(z, (name) => { const k = knownKey(name); return k === "grounds" ? "الدفع بعدم القبول" : k === "requests" ? BLANK : (k && values[k]) || BLANK; }, "صحيفة استئناف");
  const doc = await text(z, "word/document.xml");
  eq(await wellFormed(z), [], "the filled template is well-formed");
  const paras = paragraphsOf(doc);
  eq(paras[1], "المحكمة: محكمة استئناف القاهرة", "the court is in the paragraph (it was split over three runs)");
  eq(paras[2], `رقم الدعوى: 4512 لسنة 2024 / المنذر: سامح التجريبي / البنك: ${BLANK}`, "several placeholders on one line; the unknown one is a dotted line");
  eq(paras[3], "الوقائع: وقعت واقعة.\nوتلتها أخرى.", "a value of two lines is two lines (a line break in Word)");
  eq([paras[4], paras[5]], ["الدفع بعدم القبول", BLANK], "the grounds the lawyer asked for are in; the requests are a dotted line");
  eq(paras[6], "ملاحظة <بين> قوسين & علامة", "text with < > & is untouched and still well-formed");
  check(doc.includes("<w:b/><w:bCs/>") && doc.includes("<w:tab/>") && doc.includes("<w:i/>") && doc.includes('<w:jc w:val="center"/>'), "the file's own formatting stays: bold, italic, the tab, the centred title");
  check(!doc.includes("{{") && !doc.includes("}}"), "no placeholder is left");
  const before = await openDocx(TEMPLATE);
  eq(await text(z, "word/header1.xml"), await text(before, "word/header1.xml"), "its header is its own");
  eq(await text(z, "word/styles.xml"), await text(before, "word/styles.xml"), "its styles are its own");
  eq(await readOfficeStyle(z), await readOfficeStyle(before), "its margins, fonts, header and footer read back the same");
  const all = await allText(z);
  check(!all.includes("Clausia") && !all.includes("مصدر"), "no Clausia mark in a filled template");
  check(!z.file("word/comments.xml") && !z.file("docProps/custom.xml") && !(await text(z, "docProps/core.xml")).includes("عادل"), "the comments and the properties of the file are scrubbed too");
  check(!z.file("docProps/thumbnail.jpeg") && !z.file("docProps/app.xml") && !z.file("customXml/item1.xml") && !z.file("word/_rels/settings.xml.rels"), "the thumbnail, the extended properties, the custom XML and the attached template of the template file are scrubbed too");
  check(!z.file("word/glossary/document.xml") && !(await text(z, "word/settings.xml")).includes("docVar") && !(await text(z, "word/settings.xml")).includes("mailMerge") && !(await text(z, "word/settings.xml")).includes("trackRevisions"), "the template's glossary, document variables, mail merge and track changes are scrubbed too");
  // a template whose BODY points at a picture and a link keeps them (only what nothing points at goes)
  const own = await openDocx(OFFICE);
  await fillDocxTemplate(own, () => BLANK, "x");
  check(!!own.file("word/media/signature.png") && (await text(own, "word/_rels/document.xml.rels")).includes("example.com"), "a picture and a link the template's text DOES point at are kept");
  check(!own.file("docProps/thumbnail.jpeg") && !own.file("word/comments.xml"), "…while its thumbnail and comments are still scrubbed");
  eq(await wellFormed(own), [], "…and it stays well-formed");
  eq(await consistent(own), [], "…and consistent");
  eq(await consistent(z), [], "…and the package is consistent");
}

// ---------------------------------------------------------------- (e) refusals
console.log("\n-- (e) a file that is not a good Word file --");
{
  check(looksLikeDocx("مذكرة.docx", ""), "looksLikeDocx: the extension");
  check(looksLikeDocx("x", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "looksLikeDocx: the type");
  check(!looksLikeDocx("x.pdf", "application/pdf") && !looksLikeDocx("x.doc", "application/msword"), "looksLikeDocx: a PDF or an old .doc is not");
  const bad = await rejects(openDocx(new TextEncoder().encode("this is not a zip")));
  check(!!bad && /مش ملف Word/.test(bad), "text that is not a zip is refused", bad ?? "");
  const nodoc = new JSZip(); nodoc.file("hello.txt", "x");
  check(/مفيش فيه نص المستند/.test((await rejects(openDocx(await nodoc.generateAsync({ type: "uint8array" })))) ?? ""), "a zip with no word/document.xml is refused");
  check(/8 ميجابايت/.test((await rejects(openDocx(new Uint8Array(MAX_DOCX_BYTES + 1)))) ?? ""), "a file over 8 MB is refused");
  const bomb = await JSZip.loadAsync(OFFICE);
  bomb.file("word/media/zeros.bin", new Uint8Array(90 * 1024 * 1024)); // 90 MB of zeros: a few KB in the zip
  const bombBytes = await bomb.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  check(bombBytes.length < MAX_DOCX_BYTES, "the bomb is small in the zip", `${bombBytes.length} bytes`);
  check(/كبير زيادة/.test((await rejects(openDocx(bombBytes))) ?? ""), "…but it claims 90 MB inflated: refused before anything is inflated");
  // a LYING header: a part that declares 1000 bytes (central directory AND local header) and really inflates to 100 MB
  const lie = await JSZip.loadAsync(OFFICE);
  lie.file("word/media/big.xml", Buffer.alloc(100 * 1024 * 1024, 97));
  const lieBytes = lyingSizes(await lie.generateAsync({ type: "uint8array", compression: "DEFLATE" }), "word/media/big.xml", 1000);
  check(lieBytes.length < MAX_DOCX_BYTES, "the lying file is small", `${lieBytes.length} bytes`);
  const before = process.memoryUsage();
  let peak = 0;
  const timer = setInterval(() => { const m = process.memoryUsage(); peak = Math.max(peak, m.arrayBuffers + m.heapUsed - before.arrayBuffers - before.heapUsed); }, 2);
  const lieMsg = await rejects(openDocx(lieBytes));
  clearInterval(timer);
  check(!!lieMsg && /كبير زيادة/.test(lieMsg), "a part that DECLARES 1000 bytes and inflates to 100 MB is refused (the declared size is not trusted)", lieMsg ?? "");
  check(peak < 3 * MAX_PART_BYTES, "…and it is refused before it uses much memory", `peak +${Math.round(peak / 1048576)} MB (the part cap is ${MAX_PART_BYTES / 1048576} MB)`);
  const lieDoc = await JSZip.loadAsync(OFFICE);
  lieDoc.file("word/document.xml", Buffer.alloc(60 * 1024 * 1024, 97));
  const docBytes = lyingSizes(await lieDoc.generateAsync({ type: "uint8array", compression: "DEFLATE" }), "word/document.xml", 1000);
  check(/كبير زيادة/.test((await rejects(openDocx(docBytes))) ?? ""), "the same lie in word/document.xml (the part readOfficeStyle unpacks) is refused at open");
  // each part under its cap, together over the total
  const fat = await JSZip.loadAsync(OFFICE);
  const part18 = Buffer.alloc(18 * 1024 * 1024, 98);
  for (let i = 0; i < Math.ceil(MAX_TOTAL_BYTES / part18.length) + 1; i++) fat.file(`word/media/f${i}.xml`, part18);
  check(/كبير زيادة/.test((await rejects(openDocx(await fat.generateAsync({ type: "uint8array", compression: "DEFLATE" })))) ?? ""), `parts of 18 MB each (under the cap) are refused when together they pass ${MAX_TOTAL_BYTES / 1048576} MB`);
  check((await partText(await openDocx(OFFICE), "word/document.xml"))?.includes("<w:body>") === true, "an honest file still opens and reads (partText goes through the same counting read)");
  const many = await JSZip.loadAsync(OFFICE);
  for (let i = 0; i < 520; i++) many.file(`word/media/p${i}.png`, "x");
  check(/معقد/.test((await rejects(openDocx(await many.generateAsync({ type: "uint8array" })))) ?? ""), "a file with over 500 parts is refused");
  check((await rejects(buildDocx(BODY, { title: "x", office: new TextEncoder().encode("junk") }))) !== null, "an office file that is junk is refused by the export (nothing is made)");
}

// ---------------------------------------------------------------- (f) applyOp
type Rows = Record<string, Record<string, unknown>[]>;
function fakeDb(rows: Rows, files: Record<string, Uint8Array> = {}) {
  const writes: { op: string; table: string; payload?: Record<string, unknown> }[] = [];
  const db = {
    from(table: string) {
      const list = rows[table] ?? [];
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "in", "is", "order", "limit", "not", "or", "gte", "lte", "range"]) q[m] = () => q;
      for (const m of ["insert", "update", "delete", "upsert"]) q[m] = (payload?: Record<string, unknown>) => { writes.push({ op: m, table, payload }); return q; };
      const first = () => (writes.some((w) => w.table === table && w.op === "insert") ? { id: "new-row-id" } : list[0] ?? null);
      q.single = async () => ({ data: first(), error: null });
      q.maybeSingle = async () => ({ data: first(), error: null });
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: writes.some((w) => w.table === table && w.op !== "select") ? [{ id: "x" }] : list, error: null }).then(res);
      return q;
    },
    storage: { from: () => ({ download: async (path: string) => (files[path] ? { data: new Blob([files[path] as BlobPart]), error: null } : { data: null, error: { message: "not found" } }) }) },
  };
  return { db: db as unknown as Db, writes };
}
const OFFICE_ID = "3d6f1860-3a1c-4ee3-babb-21cb05e57a76";
const STYLE_PATH = `${OFFICE_ID}/office-style/11111111-1111-4111-8111-111111111111/office-style.docx`;
const TPL_PATH = `${OFFICE_ID}/templates/22222222-2222-4222-8222-222222222222/template.docx`;
console.log("\n-- (f) the lawyer's own uploads through applyOp --");
{
  const style = await readOfficeStyle(await openDocx(OFFICE));
  const args = { file_name: "ورق المكتب.docx", storage_path: STYLE_PATH, style };
  const a = fakeDb({ office_style: [] });
  const r = await applyOp(a.db, "set_office_style", args, MANUAL);
  const ins = a.writes.find((w) => w.op === "insert")?.payload;
  eq([ins?.file_name, ins?.storage_path], ["ورق المكتب.docx", STYLE_PATH], "the first style is a new row (office_id is the database's default)");
  eq((ins?.style as { header: { lines: string[] } }).header.lines[0], "مكتب الأستاذ التجريبي للمحاماة", "…with the summary read from the file");
  eq(r.steps?.[0] && { op: r.steps[0].op, table: r.steps[0].table }, { op: "delete", table: "office_style" }, "its undo deletes the row");
  const old = { id: "00000000-0000-4000-8000-000000000001", file_name: "قديم.docx", storage_path: `${OFFICE_ID}/office-style/33333333-3333-4333-8333-333333333333/old.docx`, style: { header: { lines: [], picture: false } }, updated_at: "2026-10-01T00:00:00Z" };
  const b = fakeDb({ office_style: [old] });
  const r2 = await applyOp(b.db, "set_office_style", args, MANUAL);
  const upd = b.writes.find((w) => w.op === "update")?.payload;
  eq([b.writes.some((w) => w.op === "insert"), upd?.storage_path], [false, STYLE_PATH], "a second style REPLACES the first in place (one row per office), no new row");
  eq(r2.steps?.[0], { op: "restore", table: "office_style", id: old.id, cols: { file_name: old.file_name, storage_path: old.storage_path, style: old.style, updated_at: old.updated_at }, after: r2.steps?.[0].after }, "its undo puts the old file and summary back");
  for (const bad of [`${OFFICE_ID}/templates/22222222-2222-4222-8222-222222222222/x.docx`, "../x.docx", `${OFFICE_ID}/office-style/11111111-1111-4111-8111-111111111111/x.pdf`, `${OFFICE_ID}/office-style/11111111-1111-4111-8111-111111111111/a b.docx`]) {
    check((await rejects(applyOp(fakeDb({ office_style: [] }).db, "set_office_style", { ...args, storage_path: bad }, MANUAL))) !== null, `a style path that is not {office}/office-style/{id}/name.docx is refused: «${bad.slice(-34)}»`);
  }
  const ex = await extractTemplateBody(await openDocx(TEMPLATE));
  const t = fakeDb({ templates: [] });
  await applyOp(t.db, "add_office_template", { office: OFFICE_ID, name: "صحيفة استئناف المكتب", category: "appeal", description: "من ملف المكتب", storage_path: TPL_PATH, body: ex.body }, MANUAL);
  const ti = t.writes.find((w) => w.op === "insert")?.payload;
  eq([ti?.office_id, ti?.name, ti?.category, ti?.storage_path, ti?.needs_lawyer_review], [OFFICE_ID, "صحيفة استئناف المكتب", "appeal", TPL_PATH, false], "an office template: its office, name, category, file; not flagged (it is the lawyer's own)");
  const bt = await rejects(applyOp(fakeDb({}).db, "add_office_template", { office: OFFICE_ID, name: "صيغة", category: "memo", storage_path: TPL_PATH, body: { version: 1, blocks: [{ t: "script", text: "x" }] } }, MANUAL));
  check(bt !== null, "a template body of the wrong shape is refused", String(bt).slice(0, 40));
  const empty = await rejects(applyOp(fakeDb({}).db, "add_office_template", { office: OFFICE_ID, name: "صيغة", category: "memo", storage_path: TPL_PATH, body: { version: 1, blocks: [] } }, MANUAL));
  check(empty !== null && /مفيش نص/.test(empty), "a template with no text is refused");
  check((await rejects(applyOp(fakeDb({}).db, "add_office_template", { office: "x", name: "صيغة", category: "memo", storage_path: TPL_PATH, body: ex.body }, MANUAL))) !== null, "an office that is not a uuid is refused");
  const names = writeToolSpecs().map((s) => s.name);
  check(!names.includes("set_office_style") && !names.includes("add_office_template"), "the model is NOT offered either tool");
  check((INTERNAL_TOOLS as readonly string[]).includes("set_office_style") && (INTERNAL_TOOLS as readonly string[]).includes("add_office_template"), "both are internal (refused if the model names them)");
}

// ---------------------------------------------------------------- (g) exportDraft
console.log("\n-- (g) exportDraft: which file is used --");
{
  const draft = { id: "d1", case_id: "c1", title: "صحيفة استئناف · سامح التجريبي", body: BODY, fill: FILL, template_id: "t1" };
  const styleRow = { id: "s1", file_name: "ورق.docx", storage_path: STYLE_PATH, style: await readOfficeStyle(await openDocx(OFFICE)), updated_at: "2026-10-26T00:00:00Z" };
  // a base template (no file) + the office style
  const a = fakeDb({ drafts: [draft], templates: [{ storage_path: null }], office_style: [styleRow] }, { [STYLE_PATH]: OFFICE });
  const ra = await exportDraft(a.db, "d1");
  check(!!ra && ra.officeStyle && !ra.ownTemplate && (await text(await openDocx(ra.bytes), "word/header1.xml")).includes("مكتب الأستاذ التجريبي للمحاماة"), "a base-template draft goes on the office's paper (its header is in the file)");
  eq(ra?.title, draft.title, "…and the title is the draft's");
  check(a.writes.length === 0, "exporting writes nothing");
  // no office style yet
  const b = fakeDb({ drafts: [draft], templates: [{ storage_path: null }], office_style: [] });
  const rb = await exportDraft(b.db, "d1");
  check(!!rb && !rb.officeStyle && !(await openDocx(rb.bytes)).file("word/header1.xml"), "with no office style: the plain page");
  // the lawyer's own Word template
  const c = fakeDb({ drafts: [draft], templates: [{ storage_path: TPL_PATH }], office_style: [styleRow] }, { [TPL_PATH]: TEMPLATE, [STYLE_PATH]: OFFICE });
  const rc = await exportDraft(c.db, "d1");
  const zc = rc ? await openDocx(rc.bytes) : null;
  check(!!rc && rc.ownTemplate && !rc.officeStyle, "a draft from the lawyer's own template keeps THAT file's formatting (the office paper is not applied over it)");
  if (zc) {
    const ps = paragraphsOf(await text(zc, "word/document.xml"));
    eq([ps[2], ps[4], ps[5]], [`رقم الدعوى: ${BLANK} / المنذر: سامح التجريبي / البنك: ${BLANK}`, BLANK, "الحكم بقبول الاستئناف شكلا."], "the filled values are the draft's (a missing one is a dotted line; the grounds slot is empty; the requests are the confirmed text)");
    eq(await text(zc, "word/header1.xml"), await text(await openDocx(TEMPLATE), "word/header1.xml"), "its header is the template's own");
  }
  // the template's file is gone: back to the office paper
  const d = fakeDb({ drafts: [draft], templates: [{ storage_path: TPL_PATH }], office_style: [styleRow] }, { [STYLE_PATH]: OFFICE });
  check(!!(await exportDraft(d.db, "d1"))?.officeStyle, "the template's file is gone → the office paper");
  // a draft that is not visible
  const e = fakeDb({ drafts: [] });
  eq(await exportDraft(e.db, "d1"), null, "a draft this lawyer can not read (another office's) is null");
  // the style file is gone
  const f = fakeDb({ drafts: [draft], templates: [{ storage_path: null }], office_style: [styleRow] });
  const m = await rejects(exportDraft(f.db, "d1"));
  check(!!m && /ورق المكتب/.test(m), "the office style file is missing → a plain sentence, not a half-made file", m ?? "");
  const g = fakeDb({ office_style: [] });
  eq(await loadOfficeStyle(g.db), null, "loadOfficeStyle: none yet is null");
}

// ---------------------------------------------------------------- (h) live, read-only
console.log("\n-- (h) live, read-only: the new tables through RLS --");
{
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const as = async (email: string, password: string) => {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`sign-in failed: ${error.message}`);
    return sb;
  };
  const demo = await as(process.env.DEMO_EMAIL!, process.env.DEMO_PASSWORD!);
  const other = await as(process.env.OTHER_EMAIL!, process.env.OTHER_PASSWORD!);
  for (const [who, sb] of [["demo", demo], ["other", other]] as const) {
    const r = await sb.from("office_style").select("id, file_name, storage_path, style, updated_at");
    check(!r.error, `${who} can read office_style (the table and its columns exist)`, r.error?.message ?? `${r.data?.length} rows`);
    check((r.data?.length ?? 0) <= 1, `${who} sees at most ONE row (its own office's)`);
    const s = await loadOfficeStyle(sb as unknown as Db);
    check(s === null || !!s.style.header, `${who}: loadOfficeStyle runs on the real table`, s ? "has a style" : "none yet");
  }
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exitCode = fails ? 1 : 0;
