/**
 * The draft's body as the editor and the model see it (PR 7). PURE CODE: no database, no server-only import, so the editor (browser), the server
 * actions, applyOp and the tests all use the same functions.
 *
 * A body is a list of blocks (src/lib/library/types.ts). Each block's `text` is the ONE source of truth; `marks` are spans over it (bold, locked quotation).
 * Every function here returns a NEW block / body (nothing is changed in place), and every body that comes from outside (the browser, the database, a Word
 * file) goes through `parseBody`, which checks its shape and tidies its marks: a body is data, never trusted as it arrives.
 */
import { z } from "zod";
import type { DraftBlock, DraftBody, DraftFill, LawyerSlot, Mark } from "@/lib/library/types";

export const MAX_BLOCKS = 500;
export const MAX_TEXT = 20_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const pos = z.number().int().min(0).max(MAX_TEXT);
const MarkSchema = z.discriminatedUnion("k", [
  z.object({ k: z.literal("b"), s: pos, e: pos }),
  z.object({ k: z.literal("lock"), s: pos, e: pos, src: z.string().max(200), doc: z.string().regex(UUID).optional(), page: z.number().int().min(1).max(100_000).optional() }),
]);
const extras = {
  id: z.string().regex(/^[a-z0-9_]{1,24}$/i).optional(),
  marks: z.array(MarkSchema).max(400).optional(),
  dir: z.literal("ltr").optional(),
};
const BlockSchema = z.union([
  z.object({ t: z.enum(["title", "h", "p"]), text: z.string().max(MAX_TEXT), ...extras }),
  z.object({ t: z.literal("lawyer"), key: z.string().regex(/^[a-z_]{1,40}$/), heading: z.string().max(200), hint: z.string().max(200).optional(), text: z.string().max(MAX_TEXT), state: z.enum(["empty", "needs_confirmation", "written"]), ...extras }),
]);
export const DraftBodySchema = z.object({ version: z.literal(1), blocks: z.array(BlockSchema).max(MAX_BLOCKS) });

export class BodyError extends Error {}

/** A body from outside, checked and tidied (marks clamped, ids given). Throws a plain Arabic sentence when its shape is wrong. */
export function parseBody(raw: unknown): DraftBody {
  const r = DraftBodySchema.safeParse(raw);
  if (!r.success) throw new BodyError("شكل المسودة غير مفهوم");
  return ensureIds({ version: 1, blocks: r.data.blocks.map((b) => normalizeBlock(b as DraftBlock)) });
}

// ---------------------------------------------------------------- marks
const byStart = (a: Mark, b: Mark) => a.s - b.s || (a.k === b.k ? a.e - b.e : a.k === "b" ? -1 : 1);

/** marks clamped to the text, empty ones dropped, bold spans merged, a lock that overlaps an earlier lock dropped; undefined when none is left */
export function normalizeMarks(text: string, marks: Mark[] | undefined): Mark[] | undefined {
  if (!marks?.length) return undefined;
  const len = text.length;
  const clamped = marks.map((m) => ({ ...m, s: Math.max(0, Math.min(len, m.s)), e: Math.max(0, Math.min(len, m.e)) })).filter((m) => m.e > m.s).sort(byStart);
  const out: Mark[] = [];
  for (const m of clamped) {
    if (m.k === "b") {
      const last = [...out].reverse().find((x) => x.k === "b");
      if (last && m.s <= last.e) { last.e = Math.max(last.e, m.e); continue; }
    } else {
      const last = [...out].reverse().find((x) => x.k === "lock");
      if (last && m.s < last.e) continue;
    }
    out.push(m);
  }
  return out.length ? out.sort(byStart) : undefined;
}

export function normalizeBlock(b: DraftBlock): DraftBlock {
  const marks = normalizeMarks(b.text, b.marks);
  const { marks: _m, ...rest } = b;
  return (marks ? { ...rest, marks } : rest) as DraftBlock;
}

export const lockMarks = (b: DraftBlock) => (b.marks ?? []).filter((m): m is Extract<Mark, { k: "lock" }> => m.k === "lock");

/**
 * Does the range [from, to) of the block's text touch a locked (quoted) span? A range that overlaps a lock does; an insertion (from == to) strictly INSIDE a lock
 * does; touching its edge from outside (the text just before or just after a quotation) does not.
 */
export function touchesLock(b: DraftBlock, from: number, to: number): boolean {
  return lockMarks(b).some((m) => (from === to ? m.s < from && from < m.e : m.s < to && m.e > from));
}

/** a block that is ONE quotation from its first letter to its last (drawn as the quotation box of the mockup) */
export function isQuoteBlock(b: DraftBlock): boolean {
  const l = lockMarks(b);
  return b.t !== "lawyer" && b.text.length > 0 && l.length === 1 && l[0].s === 0 && l[0].e === b.text.length;
}

/** the marks of one kind painted over the text as a yes/no per character, and back */
function paint(len: number, marks: Mark[], k: Mark["k"]): boolean[] {
  const a = new Array<boolean>(len).fill(false);
  for (const m of marks) if (m.k === k) for (let i = m.s; i < m.e && i < len; i++) a[i] = true;
  return a;
}
function unpaintBold(a: boolean[]): Mark[] {
  const out: Mark[] = [];
  for (let i = 0; i < a.length; i++) {
    if (!a[i]) continue;
    let j = i;
    while (j < a.length && a[j]) j++;
    out.push({ k: "b", s: i, e: j });
    i = j;
  }
  return out;
}

const withMarks = (b: DraftBlock, marks: Mark[]): DraftBlock => normalizeBlock({ ...b, marks });

/** bold on the range; off when the whole range is bold already */
export function toggleBold(b: DraftBlock, from: number, to: number): DraftBlock {
  if (to <= from) return b;
  const a = paint(b.text.length, b.marks ?? [], "b");
  const allBold = a.slice(from, to).every(Boolean);
  for (let i = from; i < to; i++) a[i] = !allBold;
  return withMarks(b, [...unpaintBold(a), ...lockMarks(b)]);
}

/** the range becomes a quotation (`lock`), or, when `lock` is null, every quotation it overlaps is lifted */
export function setLock(b: DraftBlock, from: number, to: number, lock: { src: string; doc?: string; page?: number } | null): DraftBlock {
  const others = (b.marks ?? []).filter((m) => m.k === "b");
  const locks = lockMarks(b);
  if (!lock) return withMarks(b, [...others, ...locks.filter((m) => !(m.s < to && m.e > from))]);
  if (to <= from) return b;
  const hit = locks.filter((m) => m.s < to && m.e > from);
  const s = Math.min(from, ...hit.map((m) => m.s));
  const e = Math.max(to, ...hit.map((m) => m.e));
  return withMarks(b, [...others, ...locks.filter((m) => !hit.includes(m)), { k: "lock", s, e, src: hit[0]?.src ?? lock.src, ...(lock.doc ? { doc: lock.doc } : {}), ...(lock.page ? { page: lock.page } : {}) }]);
}

/**
 * Replaces [from, to) of the block's text with `insert`, carrying the marks along: a mark before the range stays, one after it moves by the change in length,
 * one inside the range goes, one that covers the whole range grows or shrinks with it (so the new words of a bold phrase are bold), one cut by the range keeps
 * its outside part. (Whether the range MAY be changed is `touchesLock`'s job, not this function's.)
 */
export function replaceRange(b: DraftBlock, from: number, to: number, insert: string): DraftBlock {
  const delta = insert.length - (to - from);
  const marks: Mark[] = [];
  for (const m of b.marks ?? []) {
    if (m.e <= from) marks.push(m);
    else if (m.s >= to) marks.push({ ...m, s: m.s + delta, e: m.e + delta });
    else if (m.s <= from && m.e >= to) marks.push({ ...m, e: m.e + delta });
    else if (m.s >= from && m.e <= to) continue;
    else if (m.s < from) marks.push({ ...m, e: from });
    else marks.push({ ...m, s: from + insert.length, e: m.e + delta });
  }
  return normalizeBlock({ ...b, text: b.text.slice(0, from) + insert + b.text.slice(to), marks });
}

const sliceMarks = (marks: Mark[] | undefined, from: number, to: number): Mark[] =>
  (marks ?? []).filter((m) => m.s < to && m.e > from).map((m) => ({ ...m, s: Math.max(m.s, from) - from, e: Math.min(m.e, to) - from }));

/** a piece of a block (its text and the marks inside it), for drawing a block in parts around a tracked change */
export function sliceBlock(b: DraftBlock, from: number, to: number): DraftBlock {
  return normalizeBlock({ ...b, text: b.text.slice(from, to), marks: sliceMarks(b.marks, from, to) });
}

/** Enter inside a block: the text before `at` stays, the rest becomes the next block (a lawyer section can not be split) */
export function splitBlock(b: DraftBlock, at: number): [DraftBlock, DraftBlock] | null {
  if (b.t === "lawyer") return null;
  const left = normalizeBlock({ ...b, text: b.text.slice(0, at), marks: sliceMarks(b.marks, 0, at) });
  const { id: _id, ...rest } = b;
  const right = normalizeBlock({ ...rest, text: b.text.slice(at), marks: sliceMarks(b.marks, at, b.text.length) });
  return [left, right];
}

/** Backspace at the start of a block: it joins the one before (neither may be a lawyer section; the first block's kind stays) */
export function mergeBlocks(a: DraftBlock, b: DraftBlock): DraftBlock | null {
  if (a.t === "lawyer" || b.t === "lawyer") return null;
  const marks = [...(a.marks ?? []), ...(b.marks ?? []).map((m) => ({ ...m, s: m.s + a.text.length, e: m.e + a.text.length }))];
  return normalizeBlock({ ...a, text: a.text + b.text, marks });
}

// ---------------------------------------------------------------- ids and states
/** gives every block a name that is unique in the body (`b1`, `b2` …: the ones it already has stay) */
export function ensureIds(body: DraftBody): DraftBody {
  const used = new Set(body.blocks.map((b) => b.id).filter((x): x is string => !!x));
  const seen = new Set<string>();
  let n = 0;
  const next = () => { let id: string; do id = `b${++n}`; while (used.has(id)); used.add(id); return id; };
  return { ...body, blocks: body.blocks.map((b) => { const id = b.id && !seen.has(b.id) ? b.id : next(); seen.add(id); return b.id === id ? b : ({ ...b, id } as DraftBlock); }) };
}

/** a new block's name, for a block added to the body */
export function freshId(body: DraftBody): string {
  const used = new Set(body.blocks.map((b) => b.id));
  let n = body.blocks.length;
  while (used.has(`b${++n}`));
  return `b${n}`;
}

/**
 * The lawyer sections after an edit: no text → «empty»; the text Clausia drafted and the lawyer left as it was → still «needs_confirmation»; any other text is
 * the lawyer's own (he wrote it or accepted it) → «written». `before` = the body as saved until now.
 */
export function syncLawyerStates(body: DraftBody, before?: DraftBody): DraftBody {
  return {
    ...body,
    blocks: body.blocks.map((b) => {
      if (b.t !== "lawyer") return b;
      const prev = before?.blocks.find((x) => x.t === "lawyer" && x.key === b.key);
      const state = !b.text.trim() ? "empty" : prev && prev.t === "lawyer" && prev.state === "needs_confirmation" && prev.text === b.text ? "needs_confirmation" : "written";
      return state === b.state ? b : { ...b, state };
    }),
  };
}

/** the fill with its lawyer sections as the body now stands (what was filled and what is missing are the fill's own and do not change) */
export function syncFill(fill: DraftFill, body: DraftBody): DraftFill {
  const lawyer: LawyerSlot[] = body.blocks.flatMap((b) => (b.t === "lawyer" ? [{ key: b.key, heading: b.heading, state: b.state }] : []));
  return { ...fill, lawyer };
}

/** two bodies that read the same (marks tidied, key order ignored) */
export function sameBody(a: DraftBody, b: DraftBody): boolean {
  const norm = (x: DraftBody) => JSON.stringify(x.blocks.map((k) => normalizeBlock(k)).map((k) => Object.fromEntries(Object.entries(k).sort(([p], [q]) => (p < q ? -1 : 1)))));
  return norm(a) === norm(b);
}

/** the text of every block, one per line (a lawyer section: its heading, then its text): what the guards compare numbers against */
export function bodyTexts(body: DraftBody): string[] {
  return body.blocks.flatMap((b) => (b.t === "lawyer" ? [b.heading, b.text] : [b.text])).filter(Boolean);
}
