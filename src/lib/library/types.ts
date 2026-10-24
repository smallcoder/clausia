/**
 * The library's shapes (PR 6). A template's body and a draft's body are the same kind of thing: a list of blocks.
 *  - template: text blocks may hold {{placeholders}}; a «lawyer» block is a section that is ALWAYS empty (the legal grounds, the requests).
 *  - draft: the same blocks after the fill; a value the case file did not have stays as {{key}} (the view shows a blank, the Word file a dotted line).
 * Pure types: no server code, so the client components can import them.
 */

/** a block of a TEMPLATE */
export type TemplateBlock =
  | { t: "title" | "h" | "p"; text: string }
  | { t: "lawyer"; key: string; heading: string; hint?: string };

export interface TemplateBody {
  version: 1;
  blocks: TemplateBlock[];
  /** placeholders the case file never holds (left empty, listed as needed) */
  manual?: { key: string; label: string }[];
  /** the template describes this proceeding (the appeal, the cassation): its court / circuit / number are filled only for a case already at that stage */
  for_stage?: "appeal" | "cassation";
}

/** how a lawyer section of a draft stands: «written» = the lawyer wrote or accepted its text himself (PR 7, the editor) */
export type LawyerState = "empty" | "needs_confirmation" | "written";

/**
 * A span of a block's text (PR 7). Offsets are UTF-16 positions in `text` (the string the lawyer sees), `s` inclusive, `e` exclusive.
 *  - `b`: bold.
 *  - `lock`: QUOTED text (an article, a ruling, a passage taken from a paper): the lawyer sees it as a quotation and the model can never change it
 *    (src/lib/draft/changes.ts refuses in code). `src` says where it comes from; `doc` + `page` when it was taken from a paper of the case.
 */
export type Mark = { k: "b"; s: number; e: number } | { k: "lock"; s: number; e: number; src: string; doc?: string; page?: number };

/** the parts every block can carry (all optional: a draft saved before the editor has none of them) */
interface BlockExtras {
  /** stable name of the block inside this draft (the model and the tracked changes point at it) */
  id?: string;
  marks?: Mark[];
  /** only «ltr» is stored: a block is right-to-left unless it says so (an English paragraph of an imported Word file) */
  dir?: "ltr";
}

/** a block of a DRAFT */
export type DraftBlock =
  | ({ t: "title" | "h" | "p"; text: string } & BlockExtras)
  | ({ t: "lawyer"; key: string; heading: string; hint?: string; text: string; state: LawyerState } & BlockExtras);

export interface DraftBody { version: 1; blocks: DraftBlock[] }

/** one value put into a draft, and where it came from (the card shows both) */
export interface FilledField { key: string; label: string; value: string; source: string }
/** one value the case file did not have (left empty), and why */
export interface MissingField { key: string; label: string; reason: string }
/** one section only the lawyer writes: «empty», or «needs_confirmation» when the lawyer asked Clausia to draft it */
export interface LawyerSlot { key: string; heading: string; state: LawyerState }

/** a draft opened from a Word file (PR 7): its name, and what the reader could not carry over (shown as a small note in the editor) */
export interface DraftImport { file_name: string; dropped: ("tables" | "images" | "footnotes")[] }

/** What the fill did: saved with the draft, shown on the card. */
export interface DraftFill { filled: FilledField[]; missing: MissingField[]; lawyer: LawyerSlot[]; imported?: DraftImport }

export interface FillResult { body: DraftBody; fill: DraftFill }
