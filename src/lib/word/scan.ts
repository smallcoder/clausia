/**
 * Linear scans of Word XML (PR 7a review). A regex like `<w:p[\s>][\s\S]*?<\/w:p>` costs the SQUARE of the text when the file has many opens and no close
 * (80,000 unclosed `<w:p><w:r>`: 16 s from a 2 KB file): every open tries to reach a close that is not there, and the scan restarts at the next open.
 * Here one `indexOf` per element walks forward only, and an open with no close ends the scan (if no close follows this open, none follows a later one either),
 * so the whole text is read a bounded number of times. Pure code (no server imports).
 */

export interface Span { start: number; end: number; text: string }

/** `<name` followed by a space, `>` or `/`  (so `<w:p` is not `<w:pPr`); from `from`; -1 when there is none */
function openAt(xml: string, name: string, from: number): number {
  const needle = `<${name}`;
  for (let i = xml.indexOf(needle, from); i >= 0; i = xml.indexOf(needle, i + 1)) {
    const c = xml.charCodeAt(i + needle.length);
    if (c === 32 || c === 62 || c === 47 || c === 9 || c === 10 || c === 13) return i;
  }
  return -1;
}

/**
 * Every `<name …>…</name>` in order, not overlapping (the first close after the open ends it, like a lazy match), and every self-closing `<name …/>` as an empty
 * element. An open that is never closed ends the scan.
 */
export function spans(xml: string, name: string): Span[] {
  const out: Span[] = [];
  const close = `</${name}>`;
  let at = 0;
  for (;;) {
    const s = openAt(xml, name, at);
    if (s < 0) break;
    const gt = xml.indexOf(">", s);
    if (gt < 0) break;
    if (xml.charCodeAt(gt - 1) === 47) { out.push({ start: s, end: gt + 1, text: xml.slice(s, gt + 1) }); at = gt + 1; continue; } // <name … />
    const c = xml.indexOf(close, gt + 1);
    if (c < 0) break;
    const end = c + close.length;
    out.push({ start: s, end, text: xml.slice(s, end) });
    at = end;
  }
  return out;
}

/** the XML with every span of `name` replaced by `fn(span text)` */
export function replaceSpans(xml: string, name: string, fn: (text: string) => string): string {
  let out = "";
  let at = 0;
  for (const s of spans(xml, name)) { out += xml.slice(at, s.start) + fn(s.text); at = s.end; }
  return out + xml.slice(at);
}

/** the first span of `name`, or null */
export const firstSpan = (xml: string, name: string): string | null => spans(xml, name)[0]?.text ?? null;

/** the number of `<name` opens (a cap on how many paragraphs a file may have, counted before anything is parsed) */
export function countOpens(xml: string, name: string): number {
  let n = 0;
  for (let i = openAt(xml, name, 0); i >= 0; i = openAt(xml, name, i + 1)) n++;
  return n;
}

/** the inside of a span (between its start tag's `>` and its end tag), '' for a self-closing one */
export function innerOf(span: string, name: string): string {
  const gt = span.indexOf(">");
  if (gt < 0 || span.charCodeAt(gt - 1) === 47) return "";
  return span.slice(gt + 1, span.length - `</${name}>`.length);
}

/**
 * The text parts of a run or paragraph, in order: `<w:t>text</w:t>` (text), a tab, a line break. One pass: the tokens are found by a regex with no lazy
 * span; the text inside a `<w:t>` is read with indexOf. An unclosed `<w:t>` ends the scan.
 */
export function textParts(xml: string, cb: (kind: "t" | "tab" | "br", text: string) => void) {
  const re = /<w:t[\s>]|<w:tab\s*\/>|<w:br\s*\/>|<w:cr\s*\/>/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    if (m[0].startsWith("<w:tab")) { cb("tab", ""); continue; }
    if (m[0].startsWith("<w:br") || m[0].startsWith("<w:cr")) { cb("br", ""); continue; }
    const gt = xml.indexOf(">", m.index);
    if (gt < 0) return;
    if (xml.charCodeAt(gt - 1) === 47) continue; // <w:t/>
    const c = xml.indexOf("</w:t>", gt + 1);
    if (c < 0) return;
    cb("t", xml.slice(gt + 1, c));
    re.lastIndex = c + 6;
  }
}
