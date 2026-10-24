// Word files made in code for the tests and the screenshots (PR 6b): a lawyer's sample «ورق المكتب» (header with a logo picture, footer, fonts, margins, and
// text about ANOTHER client that must never reach an export) and a template with placeholders (one split over three runs). No file is read from anywhere.
import JSZip from "jszip";
import { crc32, deflateSync } from "node:zlib";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const H = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
/** a real 48×48 PNG, made here: a dark ring with a gold centre (the «logo») */
function png(size: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5);
      const c = d < size * 0.22 ? [0xd6, 0xc0, 0x8f] : d < size * 0.5 ? [0x14, 0x1c, 0x2e] : [0xff, 0xff, 0xff];
      row[1 + x * 3] = c[0]; row[2 + x * 3] = c[1]; row[3 + x * 3] = c[2];
    }
    rows.push(row);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}
export const LOGO_PNG = png(48);

const rels = (items: [string, string, string][]) => `${H}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`).join("")}</Relationships>`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const run = (t: string, rpr = "") => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const para = (inner: string, ppr = "") => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${inner}</w:p>`;
const FONT = `<w:rFonts w:ascii="Simplified Arabic" w:hAnsi="Simplified Arabic" w:cs="Simplified Arabic"/><w:sz w:val="28"/><w:szCs w:val="28"/><w:rtl/>`;

/** the office's sample Word file. Its body talks about a client of the office («عادل النموذجي»): the export must carry none of it. */
export async function makeOfficeDocx(opts: { headerLines?: string[]; footerLines?: string[]; logo?: boolean; tracked?: boolean } = {}): Promise<Uint8Array> {
  const headerLines = opts.headerLines ?? ["مكتب الأستاذ التجريبي للمحاماة", "محامون ومستشارون قانونيون"];
  const footerLines = opts.footerLines ?? ["القاهرة — مدينة نصر — 01000000000"];
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `${H}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/customXml/item1.xml" ContentType="application/xml"/><Override PartName="/word/glossary/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.glossary+xml"/></Types>`);
  zip.file("_rels/.rels", rels([["rId1", `${R}/officeDocument`, "word/document.xml"], ["rId2", "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", "docProps/core.xml"], ["rId3", `${R}/custom-properties`, "docProps/custom.xml"], ["rId4", `${R}/extended-properties`, "docProps/app.xml"], ["rId5", "http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail", "docProps/thumbnail.jpeg"]]));
  zip.file("docProps/core.xml", `${H}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>مذكرة عادل النموذجي</dc:title><dc:creator>أ. سامح الافتراضي</dc:creator><cp:keywords>عادل النموذجي؛ إخلاء</cp:keywords></cp:coreProperties>`);
  zip.file("docProps/custom.xml", `${H}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="Client"><vt:lpwstr xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">عادل النموذجي</vt:lpwstr></property></Properties>`);
  zip.file("word/_rels/document.xml.rels", rels([["rId1", `${R}/styles`, "styles.xml"], ["rId2", `${R}/header`, "header1.xml"], ["rId3", `${R}/footer`, "footer1.xml"], ["rId4", `${R}/comments`, "comments.xml"], ["rId5", `${R}/footnotes`, "footnotes.xml"], ["rId6", `${R}/settings`, "settings.xml"], ["rId7", `${R}/image`, "media/signature.png"], ["rId8", `${R}/customXml`, "../customXml/item1.xml"], ["rId9", `${R}/hyperlink`, "https://example.com/عادل-النموذجي"], ["rId10", `${R}/glossaryDocument`, "glossary/document.xml"]]).replace("Target=\"https://", "TargetMode=\"External\" Target=\"https://"));
  zip.file("word/styles.xml", `${H}<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`);
  zip.file("word/comments.xml", `${H}<w:comments xmlns:w="${W}"><w:comment w:id="0" w:author="سامح"><w:p><w:r><w:t>اسأل عادل عن العقد</w:t></w:r></w:p></w:comment></w:comments>`);
  zip.file("word/footnotes.xml", `${H}<w:footnotes xmlns:w="${W}"><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:id="1"><w:p><w:r><w:t>هامش عن عادل النموذجي</w:t></w:r></w:p></w:footnote></w:footnotes>`);
  const pic = opts.logo === false ? "" : `<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="540000" cy="540000"/><wp:docPr id="1" name="logo"/><a:graphic xmlns:a="${A}"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="${R}" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="540000" cy="540000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  zip.file("word/header1.xml", `${H}<w:hdr xmlns:w="${W}" xmlns:r="${R}">${para(pic, '<w:jc w:val="center"/>')}${headerLines.map((l, i) => para(run(l, i === 0 ? `${FONT}<w:b/><w:bCs/>` : FONT), '<w:bidi/><w:jc w:val="center"/>')).join("")}${opts.tracked ? para(`<w:ins w:id="1" w:author="سامح"><w:r><w:t>نص مضاف</w:t></w:r></w:ins><w:del w:id="2" w:author="سامح"><w:r><w:delText>نص محذوف</w:delText></w:r></w:del><w:r><w:rPr><w:vanish/></w:rPr><w:t>نص مخفي</w:t></w:r><w:r><w:t> ظاهر</w:t></w:r>`, "<w:bidi/>") : ""}</w:hdr>`);
  if (opts.logo !== false) {
    zip.file("word/_rels/header1.xml.rels", rels([["rId1", `${R}/image`, "media/logo.png"]]));
    zip.file("word/media/logo.png", LOGO_PNG);
  }
  zip.file("word/footer1.xml", `${H}<w:ftr xmlns:w="${W}">${footerLines.map((l) => para(run(l, FONT), '<w:bidi/><w:jc w:val="center"/>')).join("")}${para(`<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`, '<w:jc w:val="center"/>')}</w:ftr>`);
  zip.file("docProps/app.xml", `${H}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Company>مكتب سامح الافتراضي</Company><TitlesOfParts><vt:vector xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes" size="1" baseType="lpstr"><vt:lpstr>مذكرة عادل النموذجي</vt:lpstr></vt:vector></TitlesOfParts></Properties>`);
  zip.file("docProps/thumbnail.jpeg", Buffer.from("thumbnail of the first page of عادل's memo"));
  zip.file("customXml/item1.xml", `${H}<client>عادل النموذجي</client>`);
  zip.file("word/media/signature.png", LOGO_PNG);
  zip.file("word/settings.xml", `${H}<w:settings xmlns:w="${W}" xmlns:r="${R}"><w:trackRevisions/><w:attachedTemplate r:id="rId1"/><w:defaultTabStop w:val="720"/><w:docVars><w:docVar w:name="Client" w:val="عادل النموذجي"/></w:docVars><w:mailMerge><w:mainDocumentType w:val="formLetters"/><w:dataSource r:id="rId2"/></w:mailMerge></w:settings>`);
  zip.file("word/_rels/settings.xml.rels", rels([["rId1", `${R}/attachedTemplate`, "file:///C:/Users/sameh/Documents/عادل/Normal.dotm"], ["rId2", `${R}/mailMergeSource`, "file:///C:/clients/عملاء-سامح.xlsx"]]).replace(/Target="file/g, 'TargetMode="External" Target="file'));
  zip.file("word/glossary/document.xml", `${H}<w:glossaryDocument xmlns:w="${W}"><w:docParts><w:docPart><w:docPartPr><w:name w:val="AutoText1"/></w:docPartPr><w:docPartBody><w:p><w:r><w:t>نص تلقائي لعادل النموذجي</w:t></w:r></w:p></w:docPartBody></w:docPart></w:docParts></w:glossaryDocument>`);
  const body = [
    "مذكرة بدفاع في الدعوى رقم 772 لسنة 2025 مدني كلي شمال القاهرة",
    "مقدمة من السيد/ عادل النموذجي ضد السيد/ وليد التجريبي",
    "الوقائع: استأجر المدعى عليه الشقة بموجب عقد مؤرخ 1/9/2022 وامتنع عن السداد.",
  ].map((t) => para(run(t, FONT), "<w:bidi/>")).join("") + para(`<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="900000" cy="400000"/><wp:docPr id="2" name="signature"/><a:graphic xmlns:a="${A}"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="sig.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="${R}" r:embed="rId7"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`) + para(`<w:hyperlink r:id="rId9">${run("رابط", FONT)}</w:hyperlink>`);
  zip.file("word/document.xml", `${H}<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}<w:sectPr><w:headerReference w:type="default" r:id="rId2"/><w:footerReference w:type="default" r:id="rId3"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1701" w:right="1134" w:bottom="1418" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/><w:bidi/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/** the lawyer's own template: bold «المحكمة:» then a tab, a placeholder split over THREE runs, a placeholder by key, an unknown one, the grounds on a line of their own */
export async function makeTemplateDocx(): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(await makeOfficeDocx({ headerLines: ["مكتب الأستاذ التجريبي"], footerLines: ["صيغة المكتب"], logo: false }));
  const B = `${FONT}<w:b/><w:bCs/>`;
  const body = [
    para(run("صحيفة استئناف", B), '<w:bidi/><w:jc w:val="center"/>'),
    para(`${run("المحكمة:", B)}<w:r><w:tab/></w:r>${run("{{", FONT)}${run("المحكمة", `${FONT}<w:i/>`)}${run("}}", FONT)}`, "<w:bidi/>"),
    para(`${run("رقم الدعوى: {{رقم الدعوى}} / المنذر: {{موكلنا}} / البنك: {{اسم البنك}}", FONT)}`, "<w:bidi/>"),
    para(run("الوقائع: {{facts_summary}}", FONT), "<w:bidi/>"),
    para(run("{{الأسباب}}", FONT), "<w:bidi/>"),
    para(run("{{الطلبات}}", FONT), "<w:bidi/>"),
    para(run("ملاحظة <بين> قوسين & علامة", FONT), "<w:bidi/>"),
  ].join("");
  const doc = await zip.file("word/document.xml")!.async("string");
  zip.file("word/document.xml", doc.replace(/<w:body>[\s\S]*?(<w:sectPr)/, `<w:body>${body}$1`));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
