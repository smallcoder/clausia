/**
 * The model's changes to a draft (PR 7b). PURE CODE: the same functions run when a change is proposed (it is refused on the spot, so the model learns),
 * when the editor draws it as a tracked change, and again when the lawyer taps ✓ (applyOp). The model never writes: it points (a block id, the exact old
 * words) and code decides.
 *
 * What is refused IN CODE (not by the prompt):
 *  - a change that touches QUOTED text (a locked span: an article, a ruling, a passage from a paper): its words are never rephrased;
 *  - a block that is not in the draft, or old words that are not in it exactly once (the draft changed since, or they are ambiguous);
 *  - a change that changes nothing.
 * A new block taken from a paper (`cite`) is built from the words code read off the page, never from the model's text, and is born locked.
 */
import type { DraftBlock, DraftBody } from "@/lib/library/types";
import { freshId, replaceRange, touchesLock } from "./model";

/** A refusal in plain Arabic: shown to the lawyer, or returned to the model so it can correct or ask. */
export class ChangeError extends Error {}

export interface ChangeArgs {
  kind: "replace" | "add";
  block: string;
  old_text?: string;
  new_text?: string;
  style?: "p" | "h";
}

/** The words of a quotation as code read them from a page of the case, and where they are */
export interface ResolvedCite { text: string; src: string; doc: string; page: number }

export interface Planned {
  /** the body with the change made (NOT saved: saving is applyOp's, after ✓) */
  body: DraftBody;
  /** the block the change is in (replace) or the new block (add) */
  blockId: string;
  /** replace: where in that block's text the old words are */
  from?: number;
  to?: number;
}

const gone = "الفقرة دي مش موجودة في المسودة: المسودة اتغيّرت. افتحها تاني.";
export const LOCKED_MSG = "النص ده مقتبس (مقفول) ومبيتعدلش. Clausia ما بتعيد صياغة المواد والأحكام والاقتباسات.";

/** every start of `needle` in `hay` */
function occurrences(hay: string, needle: string): number[] {
  const at: number[] = [];
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) at.push(i);
  return at;
}

/** Where a replace sits: the block and the range of its old words. Throws ChangeError when it can not be found exactly once. */
export function locateReplace(body: DraftBody, args: Pick<ChangeArgs, "block" | "old_text">): { index: number; block: DraftBlock; from: number; to: number } {
  const index = body.blocks.findIndex((b) => b.id === args.block);
  if (index < 0) throw new ChangeError(gone);
  const block = body.blocks[index];
  const old = args.old_text ?? "";
  if (!old) throw new ChangeError("مفيش نص قديم يتغيّر.");
  const hits = occurrences(block.text, old);
  if (!hits.length) throw new ChangeError("النص القديم مش موجود في الفقرة زي ما هو: المسودة اتغيّرت.");
  if (hits.length > 1) throw new ChangeError("النص القديم متكرر في الفقرة: لازم يتحدد بجزء أطول.");
  return { index, block, from: hits[0], to: hits[0] + old.length };
}

/** Checks a change against the body and makes it (in memory). Throws ChangeError. `cite`: for an add taken from a paper (see src/lib/draft/edit.ts). */
export function planChange(body: DraftBody, args: ChangeArgs, cite?: ResolvedCite | null): Planned {
  if (args.kind === "replace") {
    const { index, block, from, to } = locateReplace(body, args);
    const next = args.new_text ?? "";
    if (touchesLock(block, from, to)) throw new ChangeError(LOCKED_MSG);
    if (next === args.old_text) throw new ChangeError("التعديل ده مش بيغيّر حاجة.");
    const blocks = body.blocks.slice();
    blocks[index] = replaceRange(block, from, to, next);
    return { body: { ...body, blocks }, blockId: block.id!, from, to };
  }
  const index = body.blocks.findIndex((b) => b.id === args.block);
  if (index < 0) throw new ChangeError(gone);
  const text = cite ? cite.text : (args.new_text ?? "").trim();
  if (!text) throw new ChangeError("مفيش نص يتضاف.");
  const id = freshId(body);
  const added: DraftBlock = cite
    ? { t: "p", id, text, marks: [{ k: "lock", s: 0, e: text.length, src: cite.src, doc: cite.doc, page: cite.page }] }
    : { t: args.style === "h" ? "h" : "p", id, text };
  const blocks = body.blocks.slice();
  blocks.splice(index + 1, 0, added);
  return { body: { ...body, blocks }, blockId: id };
}

/** Where a pending change sits in the CURRENT body, for the editor to draw it (null reason = it still fits; else why it no longer does). */
export type Fit = { ok: true; index: number; from?: number; to?: number } | { ok: false; reason: string };
export function fitChange(body: DraftBody, args: ChangeArgs, cite?: ResolvedCite | null): Fit {
  try {
    if (args.kind === "add") { planChange(body, args, cite); return { ok: true, index: body.blocks.findIndex((b) => b.id === args.block) }; }
    const { index, from, to } = locateReplace(body, args);
    planChange(body, args, cite);
    return { ok: true, index, from, to };
  } catch (e) {
    return { ok: false, reason: e instanceof ChangeError ? e.message : "التعديل ده مش مناسب دلوقتي" };
  }
}
