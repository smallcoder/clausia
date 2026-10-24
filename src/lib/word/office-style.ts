/**
 * The office style (PR 6b, «ورق المكتب»): read from ANY Word file the lawyer uploads from his work. No form, no fields: the header, the footer, the
 * font and size of the text and the margins are taken from the file, shown back to him, and applied to every new draft, every export and the receipt.
 *
 * What is read (all from the file, nothing assumed):
 *  - header / footer: the text lines of the DEFAULT header and footer of the last section (and whether they hold a picture, e.g. a logo);
 *  - font and size: the one most used by the text of the document (runs), else the document's defaults (styles, theme);
 *  - margins and paper size: the last section's `pgMar` and `pgSz` (twips: 1/20 point; 1440 = 1 inch).
 * The file itself is kept (the export keeps its header, footer, margins and picture as they are) and this summary is what the pages show.
 */
import type JSZip from "jszip";
import { attr, bodySectPr, hasPicture, paragraphsOf, partText, relationships } from "./docx";

export interface OfficeStyle {
  header: { lines: string[]; picture: boolean };
  footer: { lines: string[]; picture: boolean };
  /** the font of the text (null = the file names none: the export then leaves it to the file's own defaults); size in half-points (28 = 14 pt) */
  fonts: { body: string | null; size: number | null };
  /** twips (1/20 pt); null = the file has no value */
  margins: { top: number | null; bottom: number | null; left: number | null; right: number | null; header: number | null; footer: number | null };
  page: { w: number | null; h: number | null };
}

const num = (s: string | null) => (s !== null && /^-?\d+$/.test(s) ? Number(s) : null);
const clean = (lines: string[]) => lines.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

/** the most frequent value of `attrName` on the `<w:rFonts>` / `<w:sz>` tags of the text runs */
function mostUsed(xml: string, tag: string, attrNames: string[]): string | null {
  const count = new Map<string, number>();
  for (const m of xml.matchAll(new RegExp(`<${tag}\\s[^>]*>`, "g"))) {
    for (const a of attrNames) { const v = attr(m[0], a); if (v) { count.set(v, (count.get(v) ?? 0) + 1); break; } }
  }
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** the theme's font for a theme name like `minorHAnsi` / `minorBidi` (Arabic: the `Arab` script entry) */
function themeFont(theme: string | null, ref: string | null): string | null {
  if (!theme || !ref) return null;
  const major = /major/i.test(ref);
  const block = new RegExp(`<a:${major ? "majorFont" : "minorFont"}>([\\s\\S]*?)</a:${major ? "majorFont" : "minorFont"}>`).exec(theme)?.[1];
  if (!block) return null;
  if (/Bidi|Cs/i.test(ref)) return (/<a:font\s+script="Arab"\s+typeface="([^"]+)"/.exec(block)?.[1] ?? /<a:cs\s+typeface="([^"]+)"/.exec(block)?.[1]) || null;
  return /<a:latin\s+typeface="([^"]+)"/.exec(block)?.[1] || null;
}

export async function readOfficeStyle(zip: JSZip): Promise<OfficeStyle> {
  const doc = (await partText(zip, "word/document.xml")) ?? "";
  const rels = relationships(await partText(zip, "word/_rels/document.xml.rels"));
  const sect = bodySectPr(doc) ?? "";

  /** the default header / footer part of the last section */
  const part = async (kind: "header" | "footer") => {
    for (const m of sect.matchAll(new RegExp(`<w:${kind}Reference\\s[^>]*>`, "g"))) {
      if ((attr(m[0], "w:type") ?? "default") !== "default") continue;
      const target = rels.get(attr(m[0], "r:id") ?? "")?.target;
      const xml = target ? await partText(zip, `word/${target.replace(/^\/?(word\/)?/, "")}`) : null;
      if (xml) return { lines: clean(paragraphsOf(xml).flatMap((p) => p.split("\n"))), picture: hasPicture(xml) };
    }
    return { lines: [] as string[], picture: false };
  };
  const [header, footer] = await Promise.all([part("header"), part("footer")]);

  // the font of the text: what the runs of the document use most; else the styles' defaults (a theme font resolved from the theme part)
  const styles = (await partText(zip, "word/styles.xml")) ?? "";
  const theme = await partText(zip, "word/theme/theme1.xml");
  const fromStyles = () => {
    const normal = /<w:style\s[^>]*w:default="1"[^>]*w:styleId="Normal"[\s\S]*?<\/w:style>|<w:style\s[^>]*w:styleId="Normal"[\s\S]*?<\/w:style>/.exec(styles)?.[0] ?? "";
    const defaults = /<w:rPrDefault>[\s\S]*?<\/w:rPrDefault>/.exec(styles)?.[0] ?? "";
    for (const block of [normal, defaults]) {
      const f = /<w:rFonts\s[^>]*>/.exec(block)?.[0];
      if (!f) continue;
      const font = attr(f, "w:cs") ?? attr(f, "w:ascii") ?? attr(f, "w:hAnsi") ?? themeFont(theme, attr(f, "w:cstheme")) ?? themeFont(theme, attr(f, "w:asciiTheme"));
      const sz = /<w:szCs?\s[^>]*w:val="(\d+)"/.exec(block)?.[1] ?? null;
      if (font || sz) return { font: font ?? null, size: num(sz) };
    }
    return { font: null, size: null };
  };
  const dflt = fromStyles();
  const font = mostUsed(doc, "w:rFonts", ["w:cs", "w:ascii", "w:hAnsi"]) ?? dflt.font;
  const size = num(mostUsed(doc, "w:szCs", ["w:val"]) ?? mostUsed(doc, "w:sz", ["w:val"])) ?? dflt.size;

  const mar = /<w:pgMar\s[^>]*>/.exec(sect)?.[0] ?? "";
  const pg = /<w:pgSz\s[^>]*>/.exec(sect)?.[0] ?? "";
  return {
    header, footer,
    fonts: { body: font, size },
    margins: { top: num(attr(mar, "w:top")), bottom: num(attr(mar, "w:bottom")), left: num(attr(mar, "w:left")), right: num(attr(mar, "w:right")), header: num(attr(mar, "w:header")), footer: num(attr(mar, "w:footer")) },
    page: { w: num(attr(pg, "w:w")), h: num(attr(pg, "w:h")) },
  };
}

/** twips → centimetres, one decimal at most («2.5», «2») */
export const twipsToCm = (t: number) => String(Math.round(t / 56.69) / 10);
