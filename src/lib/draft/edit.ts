import "server-only";
/**
 * «اسأل Clausia» on a draft (PR 7b): the server side of a change the model proposes.
 *  - `prepareEdit`: when the model calls `edit_draft`. Reads the draft (RLS), runs the SAME checks that will run at ✓ (src/lib/draft/changes.ts: a locked
 *    span is never touched, the old words are really there), reads a cited paper, and refuses text with an article / ruling / number nobody gave. Writes NOTHING.
 *  - `applyEdit`: the lawyer's ✓ (applyOp). Checks again against the draft as it is NOW, then saves the new body as a new «accept» version.
 *  - `resolveCite`: a ruling or an article is added ONLY from a paper of THIS case: code reads the page and takes the words from it. If the words are not on
 *    that page, nothing is added (a citation is never invented).
 * LawMill is not linked, so the case's papers are the only source of rulings and articles.
 */
import { getCaseFile } from "@/lib/case-file";
import { bodyTexts, syncLawyerStates } from "@/lib/draft/model";
import { DOC_TYPE } from "@/lib/labels";
import { citationsNotIn, numbersNotIn } from "@/lib/library/guards";
import { fileTexts } from "@/lib/library/make";
import { findSpan } from "@/lib/quote-match";
import type { DraftBody } from "@/lib/library/types";
import type { Db } from "@/lib/supabase/server";
import type { Applied } from "@/lib/tools/apply";
import type { WriteArgs } from "@/lib/tools/registry";
import { ChangeError, planChange, type ChangeArgs, type ResolvedCite } from "./changes";
import { commitBody, loadDraftRow, type DraftRow } from "./save";

export type EditArgs = WriteArgs<"edit_draft">;

/** what the chat card and the editor show for one proposed change (saved on the op; the change itself is `args`) */
export interface EditPreview {
  case: string;
  draft_title: string;
  /** replace: the old words; add: null */
  before: string | null;
  /** replace: the new words; add: the new paragraph (a cited one: the words code read from the paper) */
  after: string;
  /** a cited paper's name and page («الحكم · ص 3»), null for text Clausia wrote */
  src: string | null;
  /** the cited paper (doc + page), so the editor can rebuild the locked paragraph exactly */
  cite: { doc: string; page: number } | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = "المقتبس ده مش موجود في الورقة. ما اتضافش: Clausia مبتكتبش مادة أو حكم من عندها.";

/** The cited words as they are on the paper's page (original characters, one line), the paper's name and the page. Throws ChangeError when they are not there. */
export async function resolveCite(db: Db, caseId: string, cite: { document: string; page: number; quote: string }): Promise<ResolvedCite> {
  const { data: doc } = await db.from("documents").select("id, file_name, doc_type, title, case_id").eq("id", cite.document).maybeSingle();
  if (!doc || doc.case_id !== caseId) throw new ChangeError("المستند ده مش من أوراق القضية دي: الاقتباس بيتاخد من أوراق القضية بس.");
  const { data: pages } = await db.from("document_pages").select("page_no, text").eq("document_id", doc.id).order("page_no");
  const list = pages ?? [];
  // the page the model named first, then the pages next to it (the page number it gave may be off by one)
  const order = [...list].sort((a, b) => Math.abs(a.page_no - cite.page) - Math.abs(b.page_no - cite.page) || a.page_no - b.page_no);
  for (const p of order) {
    const span = findSpan(p.text, cite.quote);
    if (!span) continue;
    const text = p.text.slice(span.start, span.end).replace(/\s+/g, " ").trim();
    if (text.length < 2) continue;
    const name = doc.doc_type !== "other" && doc.doc_type in DOC_TYPE ? DOC_TYPE[doc.doc_type as keyof typeof DOC_TYPE] : (doc.title ?? "").trim() || doc.file_name;
    return { text, src: `${name} · ص ${p.page_no}`, doc: doc.id, page: p.page_no };
  }
  throw new ChangeError(`${NOT_FOUND} (دورت في «${doc.file_name}» وملقيتش النص ده)`);
}

/**
 * A draft made from the lawyer's OWN Word template keeps that file's formatting in the export, and only its lawyer sections reach Word from the draft's text
 * (src/lib/word/export.ts): a change anywhere else would show in the editor and vanish from the file. So changes there are refused.
 */
async function assertEditable(db: Db, row: DraftRow, args: EditArgs): Promise<void> {
  if (!row.template_id) return;
  const { data: t } = await db.from("templates").select("storage_path").eq("id", row.template_id).maybeSingle();
  if (!t?.storage_path) return;
  const target = args.kind === "replace" ? row.body.blocks.find((b) => b.id === args.block) : null;
  if (!target || target.t !== "lawyer") throw new ChangeError("المسودة دي من ملف Word بتاعك: باقي النص بيتملا من القضية، والتعديل هنا في الأسباب والطلبات بس.");
}

const asChange =(a: EditArgs): ChangeArgs => ({ kind: a.kind, block: a.block, old_text: a.old_text, new_text: a.new_text, style: a.style });

export type Prepared = { ok: true; edit: EditPreview; body: DraftBody } | { ok: false; error: string };

/**
 * The model's `edit_draft` call → the card's preview, or the reason it is refused. `lawyerTexts`: the lawyer's own words (a number he said may be used).
 * `body`: the draft as it stands AFTER the earlier changes of the same card (so two changes of one card can not overlap); default = as saved.
 * `expectCase`: the thread's case (a draft of another case is not edited from this chat). Never throws.
 */
export async function prepareEdit(db: Db, args: EditArgs, lawyerTexts: string[], expectCase: string | null, body?: DraftBody): Promise<Prepared> {
  const fail = (m: string): Prepared => ({ ok: false, error: `لم يُقترح: ${m}` });
  try {
    if (!UUID.test(args.draft)) return fail("معرف المسودة غير صالح (ابحث بـ list_drafts).");
    const row: DraftRow = await loadDraftRow(db, args.draft);
    if (expectCase && row.case_id !== expectCase) return fail("المسودة دي مش من القضية اللي المحادثة دي عنها.");
    await assertEditable(db, row, args);
    const cite = args.cite ? await resolveCite(db, row.case_id, args.cite) : null;
    const current = body ?? row.body;
    const planned = planChange(current, asChange(args), cite);
    const after = cite ? cite.text : (args.new_text ?? "").trim() ? args.new_text!.trim() : "";
    // new words of Clausia's own: no number, article, year or ruling that the lawyer, the draft or the case file do not already have
    if (!cite && after) {
      const cf = await getCaseFile(db, row.case_id).catch(() => null);
      // a number may come from the lawyer, the draft or the case file (its papers too); an ARTICLE / RULING / law-year phrase («المادة 227»، «المادة الخامسة»،
      // «لسنة 2024») only from the lawyer's words, the draft or the file's own data, NOT from a paper: a paper's article is added with `cite`, with its source
      const draftSide = [...lawyerTexts, ...bodyTexts(current)];
      const unpapered = cf ? fileTexts({ ...cf, documents: cf.documents.map((d) => ({ ...d, pages: [] })) }) : [];
      const bad = [...numbersNotIn(after, [...draftSide, ...(cf ? fileTexts(cf) : [])]), ...citationsNotIn(after, [...draftSide, ...unpapered], { digits: true })];
      if (bad.length) {
        return fail(`النص الجديد فيه رقم أو مادة أو سنة مش في كلام المحامي ولا في المسودة ولا في ملف القضية (${bad.slice(0, 4).join("، ")}). متكتبش رقم مادة أو حكم أو قضية من عندك: لو محتاج سند دوّر عليه في أوراق القضية (get_document_text) وضيفه بـ cite، ولو ملقيتهوش قول للمحامي بوضوح إنك ملقيتش في أوراق القضية حاجة.`);
      }
    }
    const edit: EditPreview = {
      case: row.case_id, draft_title: row.title, before: args.kind === "replace" ? args.old_text ?? null : null, after: args.kind === "replace" ? (args.new_text ?? "") : after,
      src: cite?.src ?? null, cite: cite ? { doc: cite.doc, page: cite.page } : null,
    };
    return { ok: true, edit, body: planned.body };
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

/** The lawyer's ✓: the change is checked again against the draft as it is now, then saved as a new «accept» version (all or nothing). */
export async function applyEdit(db: Db, args: EditArgs): Promise<Applied> {
  if (!UUID.test(args.draft)) throw new Error("المسودة غير موجودة");
  const row = await loadDraftRow(db, args.draft);
  await assertEditable(db, row, args);
  const cite = args.cite ? await resolveCite(db, row.case_id, args.cite) : null; // the paper's words are read again (and must still be there)
  const planned = planChange(row.body, asChange(args), cite); // throws ChangeError: a locked span, text that is not there any more …
  const body = syncLawyerStates(planned.body, row.body);
  return commitBody(db, row, { body, kind: "accept", note: `${args.label}: ${args.why}` });
}
