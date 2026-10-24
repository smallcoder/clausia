/**
 * The editor's two-way bridge between a block of the draft model (text + marks) and the DOM of one editable box (PR 7).
 *  - `blockHtml`: the model → the box's innerHTML. Bold is <strong>; a quoted span is a locked island (contenteditable=false, with its source in data-*);
 *    a blank the case file could not fill ({{court}}) is a gold island with the name of the missing value.
 *  - `readBlock`: the DOM → the model. What the lawyer typed becomes text; bold, quoted islands and blanks become marks / {{keys}} again.
 *  - `selectionOffsets` / `setSelection`: a caret or selection as POSITIONS IN THE TEXT, so the editor can apply bold, split a block or ask about a
 *    selection with the model's own functions, and put the caret back after it re-draws the box.
 * Browser code (it touches the DOM); the model functions it relies on are pure and tested in scripts/test-draft-editor.ts.
 */
import type { DraftBlock, Mark } from "@/lib/library/types";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ESC[c]);
const PH = /\{\{([a-z_]+)\}\}/g;

export const PH_CLASS = "mx-0.5 inline-block min-w-20 rounded-sm border-b border-dashed border-gold-edge bg-gold-bg px-1.5 text-center text-sm text-gold-text-small";
export const LOCK_CLASS = "text-doc rounded-sm border-b border-border-strong bg-card-2 px-1";

/** the text of one stretch with its line breaks as <br> */
const lines = (s: string) => esc(s).replace(/\n/g, "<br>");

/** The box's innerHTML for a block. `labels`: the name of each missing value, by key. */
export function blockHtml(b: DraftBlock, labels: Map<string, string>): string {
  const text = b.text;
  const ph = [...text.matchAll(PH)].map((m) => ({ s: m.index!, e: m.index! + m[0].length, key: m[1] }));
  const locks = (b.marks ?? []).filter((m): m is Extract<Mark, { k: "lock" }> => m.k === "lock");
  const bold = (b.marks ?? []).filter((m) => m.k === "b");
  const inside = (p: number) => ph.some((x) => p > x.s && p < x.e);
  const cuts = [...new Set([0, text.length, ...(b.marks ?? []).flatMap((m) => [m.s, m.e]), ...ph.flatMap((x) => [x.s, x.e])])]
    .filter((p) => p >= 0 && p <= text.length && !inside(p)).sort((a, c) => a - c);
  let out = "";
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [s, e] = [cuts[i], cuts[i + 1]];
    const piece = text.slice(s, e);
    const key = ph.find((x) => x.s === s && x.e === e)?.key;
    if (key) { out += `<span data-ph="${key}" contenteditable="false" class="${PH_CLASS}">${esc(labels.get(key) ?? "……")}</span>`; continue; }
    let html = lines(piece);
    if (bold.some((m) => m.s <= s && m.e >= e)) html = `<strong>${html}</strong>`;
    const lock = locks.find((m) => m.s <= s && m.e >= e);
    if (lock) html = `<span data-lock="1" data-src="${esc(lock.src)}"${lock.doc ? ` data-doc="${lock.doc}"` : ""}${lock.page ? ` data-page="${lock.page}"` : ""} contenteditable="false" class="${LOCK_CLASS}">${html}</span>`;
    out += html;
  }
  return text.endsWith("\n") ? `${out}<br>` : out; // a last empty line needs a filler to show
}

type El = HTMLElement;
const isEl = (n: Node): n is El => n.nodeType === 1;

/**
 * The model of what is in the box. `filler`: drop ONE trailing line break when the box ends with a <br> (the browser's own filler, and the one `blockHtml`
 * adds after a final newline) — off when reading a cut-out piece of the box to count positions.
 */
export function readBlock(root: Node, filler = true): { text: string; marks: Mark[] } {
  let text = "";
  const marks: Mark[] = [];
  const addBold = (s: number, e: number) => { if (e > s) marks.push({ k: "b", s, e }); };
  const walk = (n: Node, bold: boolean) => {
    if (n.nodeType === 3) {
      const t = (n.textContent ?? "").replace(/ /g, " ").replace(/[​﻿]/g, "");
      if (t) { if (bold) addBold(text.length, text.length + t.length); text += t; }
      return;
    }
    if (!isEl(n)) return;
    if (n.dataset.ph) { text += `{{${n.dataset.ph}}}`; return; }
    if (n.dataset.lock !== undefined) {
      const s = text.length;
      const t = (n.textContent ?? "").replace(/ /g, " ");
      text += t;
      marks.push({ k: "lock", s, e: text.length, src: n.dataset.src ?? "", ...(n.dataset.doc ? { doc: n.dataset.doc } : {}), ...(n.dataset.page ? { page: Number(n.dataset.page) } : {}) });
      if (n.querySelector("strong, b")) addBold(s, text.length);
      return;
    }
    if (n.tagName === "BR") { text += "\n"; return; }
    const isBold = bold || n.tagName === "B" || n.tagName === "STRONG" || /^(bold|[6-9]00)$/.test(n.style.fontWeight);
    const block = n.tagName === "DIV" || n.tagName === "P";
    if (block && text && !text.endsWith("\n")) text += "\n";
    n.childNodes.forEach((c) => walk(c, isBold));
  };
  root.childNodes.forEach((c) => walk(c, false));
  if (filler && root.lastChild && isEl(root.lastChild) && root.lastChild.tagName === "BR" && text.endsWith("\n")) text = text.slice(0, -1);
  return { text, marks };
}

/** a position inside the box (node + offset) as a position in the text */
function offsetAt(root: El, node: Node, off: number): number {
  const r = document.createRange();
  r.selectNodeContents(root);
  r.setEnd(node, off);
  const div = document.createElement("div");
  div.appendChild(r.cloneContents());
  return readBlock(div, false).text.length;
}

/** the selection as positions in the text of THIS box; null when the selection is not inside it */
export function selectionOffsets(root: El): { from: number; to: number } | null {
  const sel = document.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
  const a = offsetAt(root, r.startContainer, r.startOffset);
  const b = offsetAt(root, r.endContainer, r.endOffset);
  return { from: Math.min(a, b), to: Math.max(a, b) };
}

/** where a position in the text is in the box (a blank or a quoted island is never entered: the caret goes before or after it) */
function locate(root: El, target: number): [Node, number] {
  let acc = 0;
  let found: [Node, number] | null = null;
  const at = (n: Node, after: boolean): [Node, number] => { const p = n.parentNode!; return [p, Array.prototype.indexOf.call(p.childNodes, n) + (after ? 1 : 0)]; };
  const walk = (n: Node): boolean => {
    if (n.nodeType === 3) {
      const len = (n.textContent ?? "").length;
      if (target <= acc + len) { found = [n, target - acc]; return true; }
      acc += len;
      return false;
    }
    if (!isEl(n)) return false;
    if (n.dataset.ph || n.dataset.lock !== undefined) {
      const len = n.dataset.ph ? n.dataset.ph.length + 4 : (n.textContent ?? "").length;
      if (target <= acc + len) { found = at(n, target - acc > len / 2); return true; }
      acc += len;
      return false;
    }
    if (n.tagName === "BR") {
      if (target <= acc) { found = at(n, false); return true; }
      acc += 1;
      return false;
    }
    for (const c of Array.from(n.childNodes)) if (walk(c)) return true;
    return false;
  };
  walk(root);
  return found ?? [root, root.childNodes.length];
}

/** puts the caret (or the selection) at positions in the text of the box */
export function setSelection(root: El, from: number, to = from) {
  const sel = document.getSelection();
  if (!sel) return;
  const r = document.createRange();
  const [sn, so] = locate(root, from);
  r.setStart(sn, so);
  if (to === from) r.collapse(true); else { const [en, eo] = locate(root, to); r.setEnd(en, eo); }
  sel.removeAllRanges();
  sel.addRange(r);
}
