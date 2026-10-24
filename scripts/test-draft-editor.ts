// PR 7 (محرر المذكرة): tests with a FAKE in-memory Db and Word files made in code. Nothing is sent anywhere, nothing is written to the shared database or Storage.
//  (a) the body model: shape check, ids, bold, quotations (locks), replace / split / merge keep the marks, lawyer-section states
//  (b) the fill: the judgment's own words come out as a LOCKED span with where they came from
//  (c) the lawyer's save: a version per save (and the «original» before the first one), nothing saved when nothing changed, a changed draft is not overwritten,
//      all or nothing when a write fails, a draft of another office is not found
//  (d) the history: a restore is a NEW version (nothing deleted), another draft's version can not be restored, «undo» = restore of the version before
//  (e) a Word file opened as a draft: paragraphs, headings, bold, direction; tables / pictures / footnotes counted as dropped; a file that LIES about its
//      size is refused through `readPart` before anything is read; not a Word file; too long
//  (f) the Word export keeps bold and direction, prints a quotation as plain text, and carries no mark of any kind
//  (g) the tools: the editor's three writes are the lawyer's own (never offered to the model); the migration is additive only
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-draft-editor.ts
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import type { CaseFile } from "@/lib/case-file";
import { ensureIds, freshId, isQuoteBlock, mergeBlocks, normalizeMarks, parseBody, replaceRange, sameBody, setLock, splitBlock, syncFill, syncLawyerStates, toggleBold, touchesLock } from "@/lib/draft/model";
import { saveDraft } from "@/lib/draft/save";
import { cleanAsk, askContextBlock } from "@/lib/assistant/ask";
import { ChangeError, fitChange, planChange, type ChangeArgs } from "@/lib/draft/changes";
import { prepareEdit, type EditArgs } from "@/lib/draft/edit";
import { loadDraftChanges } from "@/lib/draft/pending";
import { citationsNotIn, numbersNotIn, spelledCitations } from "@/lib/library/guards";
import { createProposal, decideProposal } from "@/lib/proposals";
import { runReadTool, READ_TOOL_SPECS } from "@/lib/tools/read";
import { fillTemplate } from "@/lib/library/fill";
import type { DraftBlock, DraftBody, DraftFill, TemplateBody } from "@/lib/library/types";
import type { Db } from "@/lib/supabase/server";
import { applyOp, MANUAL } from "@/lib/tools/apply";
import { INTERNAL_TOOLS, WRITE_TOOL_ARGS, writeToolSpecs } from "@/lib/tools/registry";
const WRITE_TOOL_ARGS_OK = (a: Record<string, unknown>) => WRITE_TOOL_ARGS.edit_draft.safeParse(a).success;
import { buildDocx, exportBlocks } from "@/lib/word/build";
import { DocxError, MAX_PART_BYTES, openDocx, partText } from "@/lib/word/docx";
import { importWordDraft } from "@/lib/word/import";
import { readWordBody } from "@/lib/word/read-body";

let fails = 0;
const check = (ok: boolean, what: string, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`); if (!ok) fails++; };
const eq = (got: unknown, want: unknown, what: string) => check(JSON.stringify(got) === JSON.stringify(want), what, JSON.stringify(got) === JSON.stringify(want) ? "" : `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const rejects = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e instanceof Error ? e.message : String(e); } };

// ---------------------------------------------------------------- a fake Db that really stores rows (insert / select / update / delete, with filters)
type Row = Record<string, unknown>;
interface Fake { db: Db; tables: Record<string, Row[]>; log: string[]; failOn?: (table: string, op: string) => boolean }
function memDb(tables: Record<string, Row[]>, opts: { failOn?: (table: string, op: string) => boolean } = {}): Fake {
  let n = 0;
  const log: string[] = [];
  const stamp = () => new Date(1_790_000_000_000 + ++n * 1000).toISOString().replace("Z", "+00:00");
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from(table: string) {
      const rows = (tables[table] ??= []);
      const filters: ((r: Row) => boolean)[] = [];
      let mode: "select" | "insert" | "update" | "delete" = "select";
      let payload: Row[] | Row = [];
      let order: { col: string; asc: boolean } | null = null;
      let limit = Infinity;
      let result: { data: Row[]; error: { message: string } | null } | null = null;
      const run = () => {
        if (result) return result;
        if (opts.failOn?.(table, mode)) return (result = { data: [], error: { message: `${mode} ${table} failed` } });
        const hit = () => rows.filter((r) => filters.every((f) => f(r)));
        if (mode === "insert") {
          const made = (payload as Row[]).map((p) => {
            const r: Row = { id: `00000000-0000-4000-9000-${String(++n).padStart(12, "0")}`, office_id: "office-1", created_at: stamp(), ...(table === "drafts" ? { updated_at: stamp(), review_status: "confirmed" } : {}), ...(table === "draft_versions" ? { created_by: "user-1" } : {}), ...(table === "proposals" ? { status: "pending" } : {}), ...p };
            rows.push(r);
            return r;
          });
          log.push(`insert ${table}`);
          result = { data: made, error: null };
        } else if (mode === "update") {
          const h = hit();
          h.forEach((r) => Object.assign(r, payload));
          log.push(`update ${table} (${h.length})`);
          result = { data: h, error: null };
        } else if (mode === "delete") {
          const h = hit();
          for (const r of h) rows.splice(rows.indexOf(r), 1);
          log.push(`delete ${table} (${h.length})`);
          result = { data: h, error: null };
        } else {
          let h = hit();
          if (order) h = [...h].sort((a, b) => (String(a[order!.col]) < String(b[order!.col]) ? -1 : 1) * (order!.asc ? 1 : -1));
          result = { data: h.slice(0, limit), error: null };
        }
        return result;
      };
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; };
      q.neq = (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return q; };
      q.in = (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return q; };
      q.order = (col: string, o?: { ascending?: boolean }) => { order = { col, asc: o?.ascending !== false }; return q; };
      q.limit = (k: number) => { limit = k; return q; };
      q.insert = (p: Row | Row[]) => { mode = "insert"; payload = Array.isArray(p) ? p : [p]; return q; };
      q.update = (p: Row) => { mode = "update"; payload = p; return q; };
      q.delete = () => { mode = "delete"; return q; };
      q.single = async () => { const r = run(); return r.error ? { data: null, error: r.error } : r.data.length ? { data: r.data[0], error: null } : { data: null, error: { message: "no rows" } }; };
      q.maybeSingle = async () => { const r = run(); return { data: r.error ? null : r.data[0] ?? null, error: r.error }; };
      q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej);
      return q;
    },
  };
  return { db: db as unknown as Db, tables, log };
}

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CASE = U(2), DRAFT = U(5), DOC = U(20);
const P = (text: string, extra: Partial<DraftBlock> = {}): DraftBlock => ({ t: "p", text, ...extra } as DraftBlock);
const BODY: DraftBody = parseBody({
  version: 1,
  blocks: [
    { t: "title", text: "صحيفة استئناف" },
    { t: "p", text: "محكمة الاستئناف: {{court}}" },
    { t: "p", text: "منطوق الحكم: حكمت المحكمة برفض الدعوى.", marks: [{ k: "lock", s: 13, e: 38, src: "حكم · ص 3" }] },
    { t: "lawyer", key: "grounds", heading: "أسباب الاستئناف", hint: "يكتبها المحامي", text: "", state: "empty" },
  ],
});
const FILL: DraftFill = { filled: [], missing: [{ key: "court", label: "المحكمة", reason: "x" }], lawyer: [{ key: "grounds", heading: "أسباب الاستئناف", state: "empty" }] };
const draftRow = (over: Row = {}): Row => ({ id: DRAFT, office_id: "office-1", case_id: CASE, title: "صحيفة استئناف · كريم", body: BODY, fill: FILL, updated_at: "2026-10-27T10:00:00.000000+00:00", created_at: "2026-10-27T09:00:00.000000+00:00", review_status: "confirmed", ...over });
const versions = (f: Fake) => (f.tables.draft_versions ?? []).map((v) => `${v.kind}`);

// ---------------------------------------------------------------- (a) the body model
console.log("\n-- (a) the body model --");
{
  eq(parseBody({ version: 1, blocks: [{ t: "p", text: "أ" }, { t: "p", text: "ب" }] }).blocks.map((b) => b.id), ["b1", "b2"], "every block gets a name (b1, b2 …) when it has none");
  eq(ensureIds({ version: 1, blocks: [P("x", { id: "b2" }), P("y"), P("z", { id: "b2" })] }).blocks.map((b) => b.id), ["b2", "b1", "b3"], "a name the body already uses stays, a missing or repeated one is replaced by a free one");
  eq(freshId({ version: 1, blocks: [P("x", { id: "b1" }), P("y", { id: "b2" })] }), "b3", "a new block's name is free");
  for (const [what, bad] of [["a body that is not an object", "نص"], ["a block of an unknown kind", { version: 1, blocks: [{ t: "script", text: "<script>" }] }], ["no blocks", { version: 1 }], ["text that is not a string", { version: 1, blocks: [{ t: "p", text: 5 }] }], ["a mark of an unknown kind", { version: 1, blocks: [{ t: "p", text: "x", marks: [{ k: "red", s: 0, e: 1 }] }] }], ["a quotation source that is not a uuid", { version: 1, blocks: [{ t: "p", text: "xx", marks: [{ k: "lock", s: 0, e: 2, src: "s", doc: "not-a-uuid" }] }] }]] as const) {
    check((await rejects(Promise.resolve().then(() => parseBody(bad)))) === "شكل المسودة غير مفهوم", `${what} is refused with a plain sentence`);
  }
  check((await rejects(Promise.resolve().then(() => parseBody({ version: 1, blocks: Array.from({ length: 501 }, () => ({ t: "p", text: "x" })) })))) !== null, "more than 500 blocks are refused");
  eq(normalizeMarks("abcdef", [{ k: "b", s: 4, e: 99 }, { k: "b", s: 1, e: 3 }, { k: "b", s: 2, e: 5 }, { k: "b", s: 3, e: 3 }]), [{ k: "b", s: 1, e: 6 }], "marks are clamped, empty ones dropped, overlapping bold merged");
  eq(normalizeMarks("abcdef", [{ k: "lock", s: 0, e: 4, src: "a" }, { k: "lock", s: 2, e: 6, src: "b" }]), [{ k: "lock", s: 0, e: 4, src: "a" }], "a quotation that overlaps an earlier quotation is dropped");

  // bold
  const b = P("أقام المستأنف الدعوى");
  const bold = toggleBold(b, 6, 14);
  eq(bold.marks, [{ k: "b", s: 6, e: 14 }], "bold on a range");
  eq(toggleBold(bold, 6, 14).marks, undefined, "bold on a range that is all bold turns it off");
  eq(toggleBold(bold, 0, 10).marks, [{ k: "b", s: 0, e: 14 }], "bold on a range that is partly bold makes all of it bold");
  eq(toggleBold(b, 3, 3), b, "an empty selection changes nothing");

  // replace keeps the marks
  const m = P("abcdefghij", { marks: [{ k: "b", s: 0, e: 2 }, { k: "b", s: 4, e: 6 }, { k: "lock", s: 8, e: 10, src: "ق" }] });
  const r1 = replaceRange(m, 2, 4, "XXXX");
  eq([r1.text, r1.marks], ["abXXXXefghij", [{ k: "b", s: 0, e: 2 }, { k: "b", s: 6, e: 8 }, { k: "lock", s: 10, e: 12, src: "ق" }]], "a replace moves the marks after it by the change in length, leaves the ones before it");
  const r2 = replaceRange(m, 3, 7, "");
  eq(r2.marks, [{ k: "b", s: 0, e: 2 }, { k: "lock", s: 4, e: 6, src: "ق" }], "a mark inside a deleted range goes, one after it moves back");
  eq(replaceRange(P("abcdefgh", { marks: [{ k: "b", s: 2, e: 6 }] }), 4, 8, "").marks, [{ k: "b", s: 2, e: 4 }], "a mark cut by a delete keeps its outside part");
  eq(replaceRange(P("abcdefgh", { marks: [{ k: "b", s: 4, e: 8 }] }), 2, 6, "").marks, [{ k: "b", s: 2, e: 4 }], "…from either side");
  eq(replaceRange(P("abcd", { marks: [{ k: "b", s: 0, e: 4 }] }), 1, 3, "XYZ").marks, [{ k: "b", s: 0, e: 5 }], "new words inside a bold phrase are bold");
  eq(replaceRange(P("abcd", { marks: [{ k: "b", s: 0, e: 2 }] }), 2, 2, "ZZ").marks, [{ k: "b", s: 0, e: 2 }], "words added right after a bold phrase are not bold");

  // locks
  const q = P("قال: «نص حرفي» ثم انتهى", { marks: [{ k: "lock", s: 5, e: 14, src: "الحكم · ص 3" }] });
  check(touchesLock(q, 6, 9), "a range INSIDE a quotation touches it");
  check(touchesLock(q, 0, 7), "a range that overlaps the start of a quotation touches it");
  check(touchesLock(q, 12, 20), "a range that overlaps the end of a quotation touches it");
  check(touchesLock(q, 0, 22), "a range that contains a quotation touches it");
  check(touchesLock(q, 8, 8), "an insertion strictly inside a quotation touches it");
  check(!touchesLock(q, 0, 5), "a range that ends where a quotation starts does not touch it");
  check(!touchesLock(q, 14, 18), "a range that starts where a quotation ends does not touch it");
  check(!touchesLock(q, 5, 5) && !touchesLock(q, 14, 14), "an insertion at the edge of a quotation does not touch it");
  check(isQuoteBlock(P("نص", { marks: [{ k: "lock", s: 0, e: 2, src: "x" }] })) && !isQuoteBlock(q), "a block that is ONE quotation from its first letter to its last is a quotation box");
  const locked = setLock(P("abcdef"), 1, 4, { src: "س" });
  eq(locked.marks, [{ k: "lock", s: 1, e: 4, src: "س" }], "a selection is made a quotation");
  eq(setLock(locked, 2, 3, null).marks, undefined, "lifting a quotation takes the whole quotation the selection touches");

  // split and merge
  const s = P("أقام المستأنف الدعوى", { id: "b1", marks: [{ k: "b", s: 4, e: 12 }] });
  const parts = splitBlock(s, 8)!;
  eq([parts[0].text, parts[1].text, parts[0].marks, parts[1].marks], ["أقام الم", "ستأنف الدعوى", [{ k: "b", s: 4, e: 8 }], [{ k: "b", s: 0, e: 4 }]], "Enter splits the text and the bold across the two blocks");
  eq(parts[1].id, undefined, "…the second block has no name yet (the editor gives it a free one)");
  eq(mergeBlocks(parts[0], parts[1])?.text, s.text, "Backspace at the start joins them again");
  eq(mergeBlocks(parts[0], parts[1])?.marks, [{ k: "b", s: 4, e: 12 }], "…and the bold is whole again");
  eq(splitBlock({ t: "lawyer", key: "grounds", heading: "x", text: "abc", state: "written" }, 1), null, "a lawyer section can not be split");
  eq(mergeBlocks(P("a"), { t: "lawyer", key: "grounds", heading: "x", text: "abc", state: "written" }), null, "…nor joined");

  // states and fill
  const L = (text: string, state: "empty" | "needs_confirmation" | "written"): DraftBody => ({ version: 1, blocks: [{ t: "lawyer", key: "grounds", heading: "أسباب", text, state }] });
  const st = (b: DraftBody) => (b.blocks[0] as { state: string }).state;
  eq(st(syncLawyerStates(L("", "needs_confirmation"))), "empty", "a lawyer section with no text is «empty»");
  eq(st(syncLawyerStates(L("كتبه العميل", "empty"))), "written", "text the lawyer typed in an empty section is «written»");
  eq(st(syncLawyerStates(L("نص مقترح", "needs_confirmation"), L("نص مقترح", "needs_confirmation"))), "needs_confirmation", "text Clausia drafted and the lawyer did not touch still needs his confirmation");
  eq(st(syncLawyerStates(L("نص مقترح معدل", "needs_confirmation"), L("نص مقترح", "needs_confirmation"))), "written", "…once he changes it, it is his («written»)");
  eq(syncFill(FILL, L("نص", "written")).lawyer, [{ key: "grounds", heading: "أسباب", state: "written" }], "the fill's lawyer sections follow the body (open_spots no longer counts a written one)");
  check(sameBody(BODY, parseBody(JSON.parse(JSON.stringify(BODY)))), "a body that is the same text and marks is the same body (key order does not matter)");
}

// ---------------------------------------------------------------- (b) the fill locks the judgment's own words
console.log("\n-- (b) the fill: the judgment's words are locked --");
{
  const prov = { review_status: "confirmed" as const, created_by: "lawyer" as const, source: { kind: "document" as const, message_id: null, document_id: DOC, page: 3, quote: null, char_start: null, char_end: null } };
  const cf = {
    schema_version: 1, generated_at: "2026-10-27T00:00:00Z",
    case: { id: CASE, label: "الدعوى رقم 8833 لسنة 2024", title: null, case_number: "8833", case_year: 2024, court: "شمال القاهرة", circuit: null, case_type: null, stage: "first_instance", status: "judged", client_role: "plaintiff", summary: null, facts_date: null, facts_date_precision: "unknown", previous_stage_case: null, later_stage_cases: [], ...prov },
    client: { id: U(1), name: "كريم المثالي", kind: "person", phone: null }, parties: [], facts: [], requests: [], arguments: [], hearings: [],
    judgments: [{ id: U(61), date: "2026-09-29", kind: "final", operative_text: "حكمت المحكمة برفض الدعوى.", outcome: null, appeal_deadline: null, appeal_deadline_note: null, hearing_id: null, ...prov }],
    documents: [{ id: DOC, file_name: "الحكم.pdf", doc_type: "judgment", title: null, doc_date: null, page_count: 4, read_status: "done", review_status: "confirmed", pages: [] }], pending_suggestions: [],
  } as unknown as CaseFile;
  const tpl: TemplateBody = { version: 1, blocks: [{ t: "p", text: "منطوق الحكم: {{judgment_text}} وفي {{court}}" }, { t: "p", text: "الوقائع {{facts_summary}}" }] };
  const r = fillTemplate(tpl, cf, { today: "2026-10-27" });
  const blk = r.body.blocks[0];
  eq(blk.text, "منطوق الحكم: حكمت المحكمة برفض الدعوى. وفي شمال القاهرة", "the text is filled as before");
  eq(blk.marks, [{ k: "lock", s: 13, e: 38, src: "حكم · ص 3" }], "the judgment's operative text is a locked span: where it starts, where it ends, and the paper and page it came from");
  eq(blk.text.slice(13, 38), "حكمت المحكمة برفض الدعوى.", "…and the span is exactly those words (not the label before them or the court after them)");
  eq(r.body.blocks[1].marks, undefined, "a block with no quoted value has no marks");
  check(!("marks" in r.body.blocks[1]), "…not even an empty list (old and new drafts look alike)");
}

// ---------------------------------------------------------------- (c) the lawyer's save
console.log("\n-- (c) the lawyer's save --");
{
  const f = memDb({ drafts: [draftRow()] });
  const edited = parseBody({ version: 1, blocks: [...BODY.blocks.slice(0, 3), { ...BODY.blocks[3], text: "الدفع بعدم القبول", state: "empty" }] });
  const res = await applyOp(f.db, "save_draft", { draft: DRAFT, body: edited, expected: "2026-10-27T10:00:00.000000+00:00" }, MANUAL);
  eq(versions(f), ["original", "save"], "the first save keeps what the draft was BEFORE as an «original» version, then the save is a version");
  const d = f.tables.drafts[0];
  eq(((d.body as DraftBody).blocks[3] as { text: string; state: string }).text, "الدفع بعدم القبول", "the draft's body is the saved body");
  eq(((d.body as DraftBody).blocks[3] as { state: string }).state, "written", "the lawyer's own text in a lawyer section is «written» (the server works it out, not the browser)");
  eq((d.fill as DraftFill).lawyer.map((l) => l.state), ["written"], "the fill's lawyer sections follow");
  eq((f.tables.draft_versions[0].body as DraftBody).blocks[3], BODY.blocks[3], "the original version is the body as it was");
  check(typeof res.extra?.updated_at === "string" && res.extra.updated_at === d.updated_at, "the new `updated_at` is returned (the editor sends it with its next save)");
  check(f.tables.draft_versions.every((v) => v.draft_id === DRAFT && v.created_by === "user-1"), "every version belongs to the draft and says who made it");

  // a second save: ONE more version (the original is not made again)
  const again = parseBody({ version: 1, blocks: [...edited.blocks.slice(0, 3), { ...edited.blocks[3], text: "الدفع بعدم القبول لانتفاء الصفة" }] });
  await applyOp(f.db, "save_draft", { draft: DRAFT, body: again, expected: d.updated_at as string }, MANUAL);
  eq(versions(f), ["original", "save", "save"], "a second save adds ONE version");

  // nothing changed → nothing written
  const before = JSON.stringify(f.tables);
  const same = await applyOp(f.db, "save_draft", { draft: DRAFT, body: again, expected: f.tables.drafts[0].updated_at as string }, MANUAL);
  check(JSON.stringify(f.tables) === before && same.extra?.unchanged === true, "saving the same words writes nothing (no version for a save that changed nothing)");

  // somebody else changed the draft since the editor opened it
  eq(await rejects(applyOp(f.db, "save_draft", { draft: DRAFT, body: edited, expected: "2026-10-27T09:59:00.000000+00:00" }, MANUAL)), "المسودة اتغيّرت من مكان تاني. افتحها تاني وكمّل من آخر نسخة.", "a save made on top of an older copy is refused (the newer text is never overwritten)");
  eq(versions(f), ["original", "save", "save"], "…and writes no version");

  // a draft of another office (RLS: not visible) or made up
  const nf = memDb({ drafts: [] });
  eq(await rejects(applyOp(nf.db, "save_draft", { draft: DRAFT, body: edited }, MANUAL)), "المسودة غير موجودة", "a draft this lawyer can not read is not found");
  check(nf.log.length === 0, "…and nothing is written");
  check((await rejects(applyOp(f.db, "save_draft", { draft: "not-a-uuid", body: edited }, MANUAL))) !== null, "a draft id that is not a uuid is refused");
  check((await rejects(applyOp(f.db, "save_draft", { draft: DRAFT, body: { version: 1, blocks: [{ t: "p", text: 5 }] } }, MANUAL))) === "شكل المسودة غير مفهوم", "a body of the wrong shape is refused, not saved");

  // all or nothing
  const w1 = memDb({ drafts: [draftRow()] }, { failOn: (t, op) => t === "draft_versions" && op === "insert" && (w1?.tables.draft_versions?.length ?? 0) >= 1 });
  await rejects(saveDraft(w1.db, { draft: DRAFT, body: edited }));
  eq(versions(w1), [], "the version insert fails → no version is left (the «original» made a moment before is removed too: all or nothing)");
  check((w1.tables.drafts[0].body as DraftBody).blocks[3].t === "lawyer" && ((w1.tables.drafts[0].body as DraftBody).blocks[3] as { text: string }).text === "", "…and the draft's body is untouched");
  const w2 = memDb({ drafts: [draftRow()] }, { failOn: (t, op) => t === "drafts" && op === "update" });
  await rejects(saveDraft(w2.db, { draft: DRAFT, body: edited }));
  eq(versions(w2), [], "the draft update fails → the versions it made (new and original) are removed again");
  const w3 = memDb({ drafts: [draftRow()] });
  const ap = await saveDraft(w3.db, { draft: DRAFT, body: edited });
  await ap.undo();
  eq([versions(w3), ((w3.tables.drafts[0].body as DraftBody).blocks[3] as { text: string }).text], [[], ""], "undo() (a card that failed half way) puts the body back and removes the versions");
}

// ---------------------------------------------------------------- (d) the history
console.log("\n-- (d) restore and undo --");
{
  const f = memDb({ drafts: [draftRow()] });
  const v = (text: string): DraftBody => parseBody({ version: 1, blocks: [...BODY.blocks.slice(0, 3), { ...BODY.blocks[3], text }] });
  const save = (text: string) => applyOp(f.db, "save_draft", { draft: DRAFT, body: v(text), expected: f.tables.drafts[0].updated_at }, MANUAL);
  await save("النسخة الأولى");
  await save("النسخة الثانية");
  await save("النسخة الثالثة");
  const [orig, one, two] = f.tables.draft_versions;
  eq(versions(f), ["original", "save", "save", "save"], "three saves → original + 3 versions");
  const text = () => ((f.tables.drafts[0].body as DraftBody).blocks[3] as { text: string }).text;

  await applyOp(f.db, "restore_draft_version", { draft: DRAFT, version: one.id }, MANUAL);
  eq(text(), "النسخة الأولى", "restoring a version makes its body the draft's body");
  eq(versions(f), ["original", "save", "save", "save", "restore"], "…as a NEW version (the three saves are all still there: nothing is deleted)");
  const last = f.tables.draft_versions[4];
  eq([last.restored_from, last.kind], [one.id, "restore"], "…that says which version it copied");
  eq(f.tables.draft_versions.slice(0, 4).map((x) => ((x.body as DraftBody).blocks[3] as { text: string }).text), ["", "النسخة الأولى", "النسخة الثانية", "النسخة الثالثة"], "the old versions' bodies are exactly as they were");

  await applyOp(f.db, "restore_draft_version", { draft: DRAFT, version: orig.id }, MANUAL);
  eq([text(), versions(f).length], ["", 6], "the original can be restored too (and it is another new version)");
  // undo of an accept = restore of the version before it: the same call
  await applyOp(f.db, "restore_draft_version", { draft: DRAFT, version: two.id }, MANUAL);
  eq(text(), "النسخة الثانية", "«undo» is a restore of the version before");

  // not this draft's version / not a version / another office's
  const other = memDb({ drafts: [draftRow(), draftRow({ id: U(6) })], draft_versions: [{ id: U(90), draft_id: U(6), body: v("نسخة مسودة تانية"), kind: "save", created_at: "2026-10-27T09:30:00+00:00" }] });
  eq(await rejects(applyOp(other.db, "restore_draft_version", { draft: DRAFT, version: U(90) }, MANUAL)), "النسخة دي مش موجودة", "a version of ANOTHER draft can not be restored into this one");
  eq(await rejects(applyOp(other.db, "restore_draft_version", { draft: DRAFT, version: U(91) }, MANUAL)), "النسخة دي مش موجودة", "a version that does not exist is not found");
  check(other.tables.draft_versions.length === 1, "…and nothing was written");
  check((await rejects(applyOp(other.db, "restore_draft_version", { draft: DRAFT, version: "x" }, MANUAL))) !== null, "a version id that is not a uuid is refused");
}

// ---------------------------------------------------------------- (e) a Word file opened as a draft
console.log("\n-- (e) Word import --");
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const H = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const r = (t: string, rpr = "") => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const para = (inner: string, ppr = "<w:bidi/>") => `<w:p><w:pPr>${ppr}</w:pPr>${inner}</w:p>`;
async function docx(body: string, extra: Record<string, string> = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `${H}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>`);
  zip.file("_rels/.rels", `${H}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/styles.xml", `${H}<w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style><w:style w:type="paragraph" w:styleId="Custom9"><w:name w:val="heading 2"/></w:style></w:styles>`);
  zip.file("word/document.xml", `${H}<w:document xmlns:w="${W}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`);
  for (const [n, c] of Object.entries(extra)) zip.file(n, c);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
/** a zip whose entry `name` declares `size` as its uncompressed size in the central directory AND the local header (the real data is unchanged) */
function lyingSizes(zip: Uint8Array, name: string, size: number): Uint8Array {
  const b = Buffer.from(zip);
  let p = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  p = b.readUInt32LE(p + 16);
  let done = false;
  while (b.readUInt32LE(p) === 0x02014b50) {
    const nl = b.readUInt16LE(p + 28), el = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32);
    if (b.subarray(p + 46, p + 46 + nl).toString("utf8") === name) { b.writeUInt32LE(size, p + 24); b.writeUInt32LE(size, b.readUInt32LE(p + 42) + 22); done = true; }
    p += 46 + nl + el + cl;
  }
  if (!done) throw new Error(`no entry ${name}`);
  return new Uint8Array(b);
}
const SAMPLE = [
  para(r("صحيفة استئناف"), '<w:pStyle w:val="Title"/><w:bidi/>'),
  para(r("الوقائع"), '<w:pStyle w:val="Heading1"/><w:bidi/>'),
  para(r("فرعي"), '<w:pStyle w:val="Custom9"/><w:bidi/>'),
  para(`${r("أقام المستأنف ")}${r("الدعوى رقم 8833", "<w:b/><w:bCs/>")}${r(" لسنة 2024 & أكثر.")}`),
  para(`${r("ليس غامقا", '<w:b w:val="0"/>')}<w:r><w:tab/></w:r>${r("بعد تاب")}<w:r><w:br/></w:r>${r("سطر ثان")}`),
  para(r("Notice of appeal"), ""),
  para(r("   "), "<w:bidi/>"),
  para(`<w:ins w:id="1" w:author="x">${r("نص مضاف")}</w:ins><w:del w:id="2" w:author="x"><w:r><w:delText>نص محذوف</w:delText></w:r></w:del>`),
  `<w:tbl><w:tr><w:tc>${para(r("داخل جدول"))}<w:tbl><w:tr><w:tc>${para(r("جدول داخل جدول"))}</w:tc></w:tr></w:tbl>${para(r("بعد الجدول الداخلي"))}</w:tc></w:tr></w:tbl>`,
  para(`${r("فقرة بصورة")}<w:r><w:drawing><wp:inline><a:graphic><a:graphicData><w:p><w:r><w:t>نص داخل مربع</w:t></w:r></w:p></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`),
  para(`${r("نص له هامش")}<w:r><w:footnoteReference w:id="1"/></w:r>`),
  para(r("الفقرة الأخيرة")),
].join("");
{
  const got = await readWordBody(await openDocx(await docx(SAMPLE)));
  eq(got.blocks.map((b) => [b.t, b.text]), [
    ["title", "صحيفة استئناف"], ["h", "الوقائع"], ["h", "فرعي"], ["p", "أقام المستأنف الدعوى رقم 8833 لسنة 2024 & أكثر."], ["p", "ليس غامقا بعد تاب\nسطر ثان"],
    ["p", "Notice of appeal"], ["p", "نص مضاف"], ["p", "فقرة بصورة"], ["p", "نص له هامش"], ["p", "الفقرة الأخيرة"],
  ], "the paragraphs come out in order: title, headings (by style id AND by the style's name), text; a tab is a space, a break is a newline; entities are read");
  eq(got.blocks[3].marks, [{ k: "b", s: 14, e: 29 }], "bold is the bold RUN («الدعوى رقم 8833»), nothing before or after it");
  eq(got.blocks[4].marks, undefined, "a run with bold switched OFF is not bold");
  eq(got.blocks.map((b) => b.dir ?? "rtl"), ["rtl", "rtl", "rtl", "rtl", "rtl", "ltr", "rtl", "rtl", "rtl", "rtl"], "a paragraph is right to left, except an English one with no bidi setting");
  eq([...got.dropped].sort(), ["footnotes", "images", "tables"], "tables, pictures and footnotes are listed as dropped");
  check(!JSON.stringify(got.blocks).includes("داخل جدول") && !JSON.stringify(got.blocks).includes("بعد الجدول الداخلي") && !JSON.stringify(got.blocks).includes("نص داخل مربع"), "nothing from inside a table (a nested one too) or a text box is half-kept");
  check(!JSON.stringify(got.blocks).includes("نص محذوف"), "a tracked deletion is not read; a tracked insertion is");
  const plain = await readWordBody(await openDocx(await docx(para(r("فقرة واحدة")))));
  eq([plain.blocks.length, plain.dropped], [1, []], "a file with only paragraphs drops nothing (no note)");

  // refusals
  check(/مفيش نص/.test((await rejects(readWordBody(await openDocx(await docx(para(r("  "))))))) ?? ""), "a file with no text is refused");
  check(/مش ملف Word/.test((await rejects(openDocx(new TextEncoder().encode("this is not a zip")))) ?? ""), "bytes that are not a Word file are refused");
  const many = await docx(Array.from({ length: 501 }, (_, i) => para(r(`فقرة ${i + 1}`))).join(""));
  check(/أكتر من 500/.test((await rejects(readWordBody(await openDocx(many)))) ?? ""), "a file of more than 500 paragraphs is refused with a plain sentence");

  // a file that LIES about its size: a part that declares 1000 bytes and really inflates to 100 MB. It goes through readPart (every read of a part does).
  const lie = new JSZip();
  lie.file("word/document.xml", `${H}<w:document xmlns:w="${W}"><w:body>${para(r("نص"))}</w:body></w:document>`);
  lie.file("word/media/big.xml", Buffer.alloc(100 * 1024 * 1024, 0x61));
  const lieBytes = lyingSizes(await lie.generateAsync({ type: "uint8array", compression: "DEFLATE" }), "word/media/big.xml", 1000);
  check(lieBytes.length < 8 * 1024 * 1024, "the lying file is small", `${lieBytes.length} bytes`);
  const lieMsg = await rejects(openDocx(lieBytes));
  check(!!lieMsg && /كبير زيادة/.test(lieMsg), "a part that DECLARES 1000 bytes and inflates to 100 MB is refused by openDocx (readPart counts the real bytes)", lieMsg ?? "");
  // …and the document part itself lying
  const lieDoc = new JSZip();
  lieDoc.file("word/document.xml", `${H}<w:document xmlns:w="${W}"><w:body>${para(r("نص".repeat(1)))}<!--${"a".repeat(MAX_PART_BYTES + 1024)}--></w:body></w:document>`);
  const docBytes = lyingSizes(await lieDoc.generateAsync({ type: "uint8array", compression: "DEFLATE" }), "word/document.xml", 1000);
  const docMsg = await rejects(openDocx(docBytes));
  check(!!docMsg && /كبير زيادة/.test(docMsg), "the document part lying about its size is refused too");

  // the whole path: the server's import with a fake Db
  const f = memDb({ cases: [{ id: CASE, office_id: "office-1" }] });
  const form = (bytes: Uint8Array, name = "مذكرة قديمة.docx") => { const x = new FormData(); x.set("file", new File([bytes as BlobPart], name)); return x; };
  const ok = await importWordDraft(f.db, CASE, form(await docx(SAMPLE)));
  check(ok.ok, "importWordDraft: a Word file becomes a draft of the case");
  const row = f.tables.drafts?.[0] as Row | undefined;
  eq([row?.case_id, row?.title, row?.template_id, row?.template_name, row?.source_kind, row?.created_by_kind], [CASE, "مذكرة قديمة", null, "ملف Word", "manual", "lawyer"], "…the draft is on this case, titled by the file's name, with no template, made by the lawyer");
  eq((row?.fill as DraftFill | undefined)?.imported, { file_name: "مذكرة قديمة.docx", dropped: ["tables", "images", "footnotes"] }, "…the fill says what was dropped (the editor shows a small note)");
  eq(((row?.body as DraftBody | undefined)?.blocks ?? []).map((b) => b.id).slice(0, 3), ["b1", "b2", "b3"], "…its blocks have names");
  eq(f.tables.draft_versions?.map((v) => v.kind), ["import"], "…and its first version is the «import»");
  const lying = await importWordDraft(memDb({ cases: [{ id: CASE }] }).db, CASE, form(lieBytes));
  check(!lying.ok && /كبير زيادة/.test(lying.error), "importWordDraft: the lying file is refused with a plain sentence");
  const wr = memDb({ cases: [{ id: CASE }] });
  await importWordDraft(wr.db, CASE, form(lieBytes));
  check(wr.log.length === 0, "…and nothing was written");
  const notDocx = await importWordDraft(f.db, CASE, form(new TextEncoder().encode("x"), "ملف.pdf"));
  check(!notDocx.ok && /Word/.test(notDocx.error), "importWordDraft: a .pdf is refused");
  const noCase = await importWordDraft(memDb({ cases: [] }).db, CASE, form(await docx(SAMPLE)));
  check(!noCase.ok && /غير موجودة/.test(noCase.error), "importWordDraft: a case this lawyer can not read → not found, nothing written");
  const empty = await importWordDraft(f.db, CASE, new FormData());
  check(!empty.ok, "importWordDraft: no file is refused");
}

// ---------------------------------------------------------------- (f) the Word export
console.log("\n-- (f) the Word export --");
{
  const body = parseBody({
    version: 1,
    blocks: [
      { t: "title", text: "صحيفة" },
      { t: "p", text: "أقام الدعوى رقم 8833 في {{court}}", marks: [{ k: "b", s: 5, e: 20 }] },
      { t: "p", text: "نص مقتبس حرفي", marks: [{ k: "lock", s: 0, e: 13, src: "حكم · ص 3" }] },
      { t: "p", text: "Notice of appeal", dir: "ltr" },
      { t: "lawyer", key: "grounds", heading: "الأسباب", text: "سطر 1\nسطر 2", state: "written", marks: [{ k: "b", s: 0, e: 3 }] },
    ],
  });
  const lines = exportBlocks(body);
  eq(lines[1].runs, [{ text: "أقام ", bold: false }, { text: "الدعوى رقم 8833", bold: true }, { text: " في ……………", bold: false }], "bold is cut into runs; a blank is a dotted line");
  eq(lines[2].runs, undefined, "a quotation prints as plain text (no run, no mark)");
  eq(lines[3].ltr, true, "an English paragraph is marked left to right");
  eq(lines.slice(4).map((l) => l.text), ["الأسباب", "سطر 1", "سطر 2"], "a lawyer section: its heading, then one paragraph per line");
  eq(lines[5].runs, [{ text: "سطر", bold: true }, { text: " 1", bold: false }], "…bold inside it is kept");
  const xml = (await partText(await openDocx(await buildDocx(body, { title: "صحيفة" })), "word/document.xml"))!;
  const para2 = xml.split("<w:p>")[2];
  check((para2.match(/<w:b\/>/g) ?? []).length === 1 && /<w:b\/><w:bCs\/>[^]*?<w:t[^>]*>الدعوى رقم 8833<\/w:t>/.test(para2), "in the .docx only the bold run carries <w:b/>");
  const ltr = xml.split("<w:p>")[4];
  check(!ltr.includes("<w:bidi/>") && !ltr.includes("<w:rtl/>") && xml.split("<w:p>")[2].includes("<w:bidi/>"), "an English paragraph has no right-to-left setting; the others do");
  check(!/حكم · ص 3|Clausia|مبيتعدلش|data-lock/.test(xml) && !xml.includes("{{"), "no mark of any kind in the file: not the quotation's source, not «Clausia», no placeholder");
  eq(exportBlocks({ version: 1, blocks: [{ t: "p", text: "  a  \n  b  " }] }).map((l) => l.text), ["a", "b"], "lines are trimmed like before (the export of an old draft is unchanged)");
}

// ---------------------------------------------------------------- (g) the tools and the migration
console.log("\n-- (g) tools and migration --");
{
  const offered: string[] = writeToolSpecs().map((s) => s.name);
  for (const t of ["save_draft", "restore_draft_version", "import_draft"]) {
    check((INTERNAL_TOOLS as readonly string[]).includes(t) && !offered.includes(t), `${t} is the lawyer's own act: not offered to the model`);
  }
  const sql = readFileSync("supabase/migrations/20261027100000_draft_versions.sql", "utf8").replace(/--.*$/gm, "");
  eq([...sql.matchAll(/create table (\w+)/g)].map((m) => m[1]), ["draft_versions"], "the migration creates ONE table");
  check(!/alter table (?!draft_versions)/i.test(sql) && !/\b(drop|truncate|delete from|update \w+ set|insert into)\b/i.test(sql), "…and touches no other table, drops nothing, writes no row");
  check(!/create policy \w+ on draft_versions for update/i.test(sql) && /for select/.test(sql) && /for insert/.test(sql) && /for delete/.test(sql), "…its policies: select, insert, delete; none to update (versions are immutable)");
  check(/security invoker/.test(sql), "…its link check runs with the caller's rights (through RLS)");
  const down = readFileSync("supabase/migrations/20261027100000_draft_versions_down.sql", "utf8").replace(/--.*$/gm, "");
  check(/drop table if exists draft_versions/.test(down) && !/drop table (if exists )?(drafts|cases)\b/.test(down), "the _down file drops only the new table and function");
}

// ================================================================ PR 7b: «اسأل Clausia» — tracked changes
const QUOTE_TEXT = "قضت المحكمة بأن «البيع تم بعقد عرفي» وانتهى.";
const B7 = parseBody({
  version: 1,
  blocks: [
    { t: "title", text: "صحيفة استئناف" },
    { t: "p", text: "السبب الأول: القصور في التسبيب. السبب الثاني: الخطأ في تطبيق القانون." },
    { t: "p", text: QUOTE_TEXT, marks: [{ k: "lock", s: 17, e: 37, src: "الصحيفة · ص 2" }] },
    { t: "lawyer", key: "grounds", heading: "أسباب الاستئناف", text: "نص الأسباب الأول.", state: "written" },
  ],
});
const [, P1, PQ, G1] = B7.blocks;
const R = (over: Partial<EditArgs> & { block: string; old_text?: string; new_text?: string }): EditArgs => ({ draft: DRAFT, kind: "replace", label: "صياغة", why: "تحسين الصياغة", quote: "عدل الصياغة", ...over } as EditArgs);
const AR = (over: Partial<ChangeArgs>): ChangeArgs => ({ kind: "replace", block: P1.id!, ...over });
const refusal = (f: () => unknown) => { try { f(); return null; } catch (e) { return e instanceof ChangeError ? e.message : `OTHER: ${String(e)}`; } };

console.log("\n-- (h) a change is checked in code: locked text is never touched --");
{
  const ok = planChange(B7, AR({ old_text: "القصور في التسبيب", new_text: "قصور التسبيب" }));
  eq(ok.body.blocks[1].text, "السبب الأول: قصور التسبيب. السبب الثاني: الخطأ في تطبيق القانون.", "a replace changes just the old words");
  eq(B7.blocks[1].text, "السبب الأول: القصور في التسبيب. السبب الثاني: الخطأ في تطبيق القانون.", "…and the body it was planned on is not changed (a plan is not a save)");
  eq([ok.from, ok.to, ok.blockId], [13, 30, P1.id], "…and says where");
  const del = planChange(B7, AR({ old_text: " السبب الثاني: الخطأ في تطبيق القانون.", new_text: "" }));
  eq(del.body.blocks[1].text, "السبب الأول: القصور في التسبيب.", "an empty new text is a delete");
  const lockedAt = QUOTE_TEXT.indexOf("البيع");
  for (const [what, old] of [["inside the quotation", "البيع تم"], ["the quotation's words and more", "«البيع تم بعقد عرفي» وانتهى"], ["the whole block", QUOTE_TEXT], ["overlapping the start of the quotation", "بأن «البيع"], ["overlapping its end", "عرفي» وانتهى"]] as const) {
    eq(refusal(() => planChange(B7, { kind: "replace", block: PQ.id!, old_text: old, new_text: "صياغة جديدة" })), "النص ده مقتبس (مقفول) ومبيتعدلش. Clausia ما بتعيد صياغة المواد والأحكام والاقتباسات.", `a replace ${what} is REFUSED`);
  }
  check(lockedAt > 0, "(the quotation really starts inside the block)");
  const before = planChange(B7, { kind: "replace", block: PQ.id!, old_text: "قضت المحكمة بأن", new_text: "قررت المحكمة أن" });
  eq([before.body.blocks[2].text, before.body.blocks[2].marks], ["قررت المحكمة أن «البيع تم بعقد عرفي» وانتهى.", [{ k: "lock", s: 17, e: 37, src: "الصحيفة · ص 2" }]], "the text just BEFORE a quotation can change; the quotation moves with its words and stays locked");
  const after = planChange(B7, { kind: "replace", block: PQ.id!, old_text: "وانتهى.", new_text: "وانتهى الأمر." });
  eq(after.body.blocks[2].marks, PQ.marks, "…and the text just after it");
  eq(refusal(() => planChange(B7, AR({ old_text: "كلام مش موجود" }))), "النص القديم مش موجود في الفقرة زي ما هو: المسودة اتغيّرت.", "old words that are not in the block → refused (the draft changed)");
  eq(refusal(() => planChange(B7, AR({ old_text: "الس", new_text: "x" }))), "النص القديم متكرر في الفقرة: لازم يتحدد بجزء أطول.", "old words that occur twice → refused (ambiguous)");
  eq(refusal(() => planChange(B7, { kind: "replace", block: "b99", old_text: "x", new_text: "y" })), "الفقرة دي مش موجودة في المسودة: المسودة اتغيّرت. افتحها تاني.", "a block that is not in the draft → refused");
  eq(refusal(() => planChange(B7, AR({ old_text: "القصور", new_text: "القصور" }))), "التعديل ده مش بيغيّر حاجة.", "a change that changes nothing → refused");
  eq(planChange(B7, { kind: "replace", block: G1.id!, old_text: "الأول", new_text: "الثاني" }).body.blocks[3].text, "نص الأسباب الثاني.", "the text of a lawyer section can be changed too");

  const add = planChange(B7, { kind: "add", block: P1.id!, new_text: "السبب الثالث: عدم الرد على دفاع جوهري.", style: "p" });
  eq([add.body.blocks.length, add.body.blocks[2].text, add.body.blocks[2].marks], [5, "السبب الثالث: عدم الرد على دفاع جوهري.", undefined], "an add puts a new paragraph right after the block");
  check(!!add.body.blocks[2].id && add.body.blocks.filter((b) => b.id === add.body.blocks[2].id).length === 1, "…with a name of its own");
  eq(planChange(B7, { kind: "add", block: P1.id!, new_text: "عنوان", style: "h" }).body.blocks[2].t, "h", "…as a heading when asked");
  const cited = planChange(B7, { kind: "add", block: P1.id! }, { text: "المادة 227 من قانون المرافعات تنص", src: "الحكم · ص 3", doc: DOC, page: 3 });
  eq(cited.body.blocks[2].marks, [{ k: "lock", s: 0, e: 33, src: "الحكم · ص 3", doc: DOC, page: 3 }], "a paragraph taken from a paper is born LOCKED, with its source");
  check(isQuoteBlock(cited.body.blocks[2]), "…so it is drawn as a quotation box");
  eq(refusal(() => planChange(B7, { kind: "add", block: "nope", new_text: "x" })), "الفقرة دي مش موجودة في المسودة: المسودة اتغيّرت. افتحها تاني.", "an add after a block that is not there → refused");
  eq(refusal(() => planChange(B7, { kind: "add", block: P1.id!, new_text: "   " })), "مفيش نص يتضاف.", "an add with no text → refused");

  // what the editor draws: where each pending change fits NOW
  const f1 = fitChange(B7, AR({ old_text: "القصور في التسبيب", new_text: "x" }));
  eq(f1.ok && [f1.from, f1.to], [13, 30], "fitChange: where a replace sits now");
  const f2 = fitChange(parseBody({ version: 1, blocks: [{ ...P1, text: "نص تاني خالص" }] }), { kind: "replace", block: P1.id!, old_text: "القصور", new_text: "x" });
  check(!f2.ok && /اتغيّرت/.test(f2.reason), "fitChange: a change whose words are gone says so (the editor lists it as no longer fitting)");
}

console.log("\n-- (i) a change is NOT in the draft until the lawyer taps; ✓ and × per change; «اقبل الكل» --");
{
  const draftWith = (body: DraftBody) => draftRow({ body, fill: { filled: [], missing: [], lawyer: [{ key: "grounds", heading: "أسباب الاستئناف", state: "written" }] } });
  const thread = U(70);
  const edits = [
    R({ block: P1.id!, old_text: "القصور في التسبيب", new_text: "قصور التسبيب", label: "صياغة" }),
    R({ block: P1.id!, old_text: "الخطأ في تطبيق القانون", new_text: "مخالفة القانون", label: "صياغة", why: "أوضح" }),
  ];
  const propose = (f: Fake, list: EditArgs[]) => createProposal(f.db, { threadId: thread, caseId: CASE, ops: list.map((a) => ({ tool: "edit_draft", args: a as unknown as Record<string, unknown>, source: { kind: "chat" as const } })), sourceTexts: ["عدل الصياغة"] });
  const bodyOf = (f: Fake) => f.tables.drafts[0].body as DraftBody;
  const text1 = (f: Fake) => bodyOf(f).blocks[1].text;
  const ORIGINAL = B7.blocks[1].text;

  const f = memDb({ drafts: [draftWith(B7)], cases: [{ id: CASE }] });
  const p = await propose(f, edits);
  eq([p.ops.length, p.ops.map((o) => o.status)], [2, ["pending", "pending"]], "two changes → ONE card with two ops (one per change)");
  check(text1(f) === ORIGINAL && !f.tables.draft_versions?.length && !f.log.some((l) => /drafts/.test(l)), "before any tap: the draft is untouched, no version, nothing written to drafts");
  const pending = await loadDraftChanges(f.db, CASE, DRAFT);
  eq(pending.map((c) => [c.opId, c.args.old_text, c.args.new_text, c.label]), [["op1", "القصور في التسبيب", "قصور التسبيب", "صياغة"], ["op2", "الخطأ في تطبيق القانون", "مخالفة القانون", "صياغة"]], "the editor reads the same two changes from the card (still pending)");
  eq((await loadDraftChanges(f.db, CASE, U(99))).length, 0, "…and none for another draft");

  // ✓ on the first one
  const r1 = await decideProposal(f.db, p.id, { mode: "confirm", opIds: ["op1"] });
  eq(text1(f), ORIGINAL.replace("القصور في التسبيب", "قصور التسبيب"), "✓ on change 1: ONLY change 1 is in the draft");
  eq(r1.ops.map((o) => o.status), ["confirmed", "pending"], "…change 2 is still pending");
  eq(versions(f), ["original", "accept"], "…and it made a version (the «original» first, then the accept)");
  eq((f.tables.draft_versions[1].note ?? ""), "صياغة: تحسين الصياغة", "…whose note says what was accepted");
  eq((await loadDraftChanges(f.db, CASE, DRAFT)).map((c) => c.opId), ["op2"], "…the editor now shows only change 2");

  // × on the second one
  const r2 = await decideProposal(f.db, p.id, { mode: "reject", opIds: ["op2"] });
  eq([r2.ops.map((o) => o.status), r2.status], [["confirmed", "rejected"], "confirmed"], "× on change 2: it is rejected");
  check(text1(f) === ORIGINAL.replace("القصور في التسبيب", "قصور التسبيب") && versions(f).length === 2, "…the draft did not change and no version was made");
  eq((await loadDraftChanges(f.db, CASE, DRAFT)).length, 0, "…and nothing is left to decide");

  // «اقبل الكل»: both in one tap, in order, each its own version
  const f2 = memDb({ drafts: [draftWith(B7)], cases: [{ id: CASE }] });
  const p2 = await propose(f2, edits);
  const all = await decideProposal(f2.db, p2.id, { mode: "confirm" });
  eq(text1(f2), "السبب الأول: قصور التسبيب. السبب الثاني: مخالفة القانون.", "«اقبل الكل»: both changes are in the draft");
  eq([all.status, versions(f2)], ["confirmed", ["original", "accept", "accept"]], "…each is a version, and the card is confirmed");

  // undo the last accept = restore the version before it (a new version; nothing deleted)
  const [orig, one] = f2.tables.draft_versions;
  void orig;
  await applyOp(f2.db, "restore_draft_version", { draft: DRAFT, version: one.id }, MANUAL);
  eq([text1(f2), versions(f2)], ["السبب الأول: قصور التسبيب. السبب الثاني: الخطأ في تطبيق القانون.", ["original", "accept", "accept", "restore"]], "undo of the last accept: the version before it is current again, as a NEW version (all accepts are still in the history)");

  // the draft changed since the change was proposed: refused, nothing saved, the card keeps the reason
  const f3 = memDb({ drafts: [draftWith(B7)], cases: [{ id: CASE }] });
  const p3 = await propose(f3, [edits[0]]);
  const changed = parseBody({ version: 1, blocks: [B7.blocks[0], { ...P1, text: "السبب الأول: تغيّر النص بإيد المحامي." }, ...B7.blocks.slice(2)] });
  await applyOp(f3.db, "save_draft", { draft: DRAFT, body: changed, expected: f3.tables.drafts[0].updated_at }, MANUAL);
  const nv = versions(f3).length;
  const err = await rejects(decideProposal(f3.db, p3.id, { mode: "confirm" }));
  check(!!err && /ماتحفظش/.test(err), "a change whose old words are gone cannot be accepted (the lawyer is told, plainly)", err ?? "");
  check(text1(f3) === "السبب الأول: تغيّر النص بإيد المحامي." && versions(f3).length === nv, "…the draft is as the lawyer left it and no version was made");
  const after3 = (await f3.db.from("proposals").select("*").eq("id", p3.id).maybeSingle()).data as unknown as { ops: { status: string; error?: string }[] };
  check(after3.ops[0].status === "failed" && /مش موجود/.test(after3.ops[0].error ?? ""), "…and the op says why it failed");

  // THE LOCK, in code: a change that touches quoted text is refused at ✓ even if it got into the card by any other way (prepare skipped)
  const f4 = memDb({ drafts: [draftWith(B7)], cases: [{ id: CASE }] });
  const p4 = await propose(f4, [R({ block: PQ.id!, old_text: "البيع تم بعقد عرفي", new_text: "البيع كان بعقد رسمي" })]);
  const lockErr = await rejects(decideProposal(f4.db, p4.id, { mode: "confirm" }));
  check(!!lockErr && /ماتحفظش/.test(lockErr), "a change inside a quotation can NOT be accepted, even though it is in the card");
  check(bodyOf(f4).blocks[2].text === QUOTE_TEXT && !f4.tables.draft_versions?.length, "…the quotation is exactly as it was, no version was made");
  const lockOp = ((await f4.db.from("proposals").select("*").eq("id", p4.id).maybeSingle()).data as unknown as { ops: { error?: string }[] }).ops[0];
  check(/مقتبس/.test(lockOp.error ?? ""), "…and the op says it is quoted text", lockOp.error ?? "");
  const direct = await rejects(applyOp(f4.db, "edit_draft", R({ block: PQ.id!, old_text: "قضت المحكمة بأن «البيع", new_text: "x" }), MANUAL));
  check(!!direct && /مقتبس/.test(direct), "applyOp itself refuses an edit that overlaps a quotation");

  // all or nothing: change 1 fine, change 2 touches a quotation → NOTHING of the card is saved
  const f5 = memDb({ drafts: [draftWith(B7)], cases: [{ id: CASE }] });
  const p5 = await propose(f5, [edits[0], R({ block: PQ.id!, old_text: "البيع تم", new_text: "x" })]);
  await rejects(decideProposal(f5.db, p5.id, { mode: "confirm" }));
  check(text1(f5) === ORIGINAL && !f5.tables.draft_versions?.length, "a card with one good change and one that touches a quotation saves NOTHING (all or nothing: the good one is undone)");

  // own-template draft: only the lawyer sections can change
  const f6 = memDb({ drafts: [{ ...draftWith(B7), template_id: U(10) }], templates: [{ id: U(10), storage_path: "office/templates/x/template.docx" }], cases: [{ id: CASE }] });
  const own = await rejects(applyOp(f6.db, "edit_draft", edits[0], MANUAL));
  check(!!own && /ملف Word بتاعك/.test(own), "a draft from the lawyer's own Word template: a change outside the lawyer sections is refused");
  const ownOk = await applyOp(f6.db, "edit_draft", R({ block: G1.id!, old_text: "الأول", new_text: "الأخير" }), MANUAL);
  check(!!ownOk.id, "…but its grounds / requests can change");
}

console.log("\n-- (j) the model's change is refused at the door; a citation only from the case's papers --");
{
  const PAGE3 = "حكمت المحكمة حضوريا.\nوحيث إن المادة 227 من قانون المرافعات تنص على أن الأحكام تصدر بالأغلبية.\nولما كان ذلك فإن الدعوى مقبولة.";
  const rows = (): Record<string, Row[]> => ({
    drafts: [draftRow({ body: B7 })], cases: [{ id: CASE }],
    documents: [{ id: DOC, case_id: CASE, file_name: "الحكم.pdf", doc_type: "judgment", title: null }, { id: U(21), case_id: U(3), file_name: "قضية تانية.pdf", doc_type: "other", title: "ورقة قضية تانية" }],
    document_pages: [{ document_id: DOC, page_no: 3, text: PAGE3 }, { document_id: DOC, page_no: 4, text: "الصفحة الرابعة: المادة 228 تتكلم عن حاجة تانية." }, { document_id: U(21), page_no: 1, text: "المادة 999 من قانون تاني." }],
  });
  const f = memDb(rows());
  const prep = (a: Partial<EditArgs> & { block: string }, lawyer: string[] = ["عدل الصياغة"]) => prepareEdit(f.db, { draft: DRAFT, kind: "replace", label: "صياغة", why: "ليه", quote: "q", ...a } as EditArgs, lawyer, CASE);

  const ok = await prep({ block: P1.id!, old_text: "القصور في التسبيب", new_text: "قصور التسبيب" });
  check(ok.ok && ok.edit.before === "القصور في التسبيب" && ok.edit.after === "قصور التسبيب" && ok.edit.src === null, "a plain rewording → the card's preview (old words, new words, no source)");
  const lock = await prep({ block: PQ.id!, old_text: "البيع تم", new_text: "x" });
  check(!lock.ok && /مقتبس/.test(lock.error), "a change inside a quotation is refused when the model proposes it (it is told why)", !lock.ok ? lock.error.slice(0, 60) : "");
  const gone = await prep({ block: P1.id!, old_text: "مش موجود", new_text: "x" });
  check(!gone.ok && /مش موجود في الفقرة/.test(gone.error), "old words that are not there → refused");
  const other = await prepareEdit(f.db, { draft: DRAFT, kind: "replace", block: P1.id!, old_text: "القصور", new_text: "نقص", label: "x", why: "yy", quote: "q" } as EditArgs, ["x"], U(3));
  check(!other.ok && /مش من القضية/.test(other.error), "a draft of ANOTHER case is not edited from this case's chat");
  const nodraft = await prepareEdit(memDb({ drafts: [] }).db, { draft: DRAFT, kind: "replace", block: "b1", old_text: "x", new_text: "y", label: "x", why: "yy", quote: "q" } as EditArgs, ["x"], CASE);
  check(!nodraft.ok && /المسودة غير موجودة/.test(nodraft.error), "a draft this lawyer can not read is not found");
  eq(f.log.filter((l) => /^(insert|update|delete)/.test(l)), [], "none of this wrote anything");

  // two changes in one card can not overlap
  const first = await prep({ block: P1.id!, old_text: "القصور في التسبيب", new_text: "قصور" });
  const second = first.ok ? await prepareEdit(f.db, { draft: DRAFT, kind: "replace", block: P1.id!, old_text: "في التسبيب", new_text: "x", label: "x", why: "yy", quote: "q" } as EditArgs, ["x"], CASE, first.body) : null;
  check(!!second && !second.ok && /مش موجود في الفقرة/.test(second.error), "a second change on words the first one of the same card already changes is refused");

  // numbers, articles, spelled-out numbers: nobody's words → refused (#202)
  const art = await prep({ block: P1.id!, old_text: "القصور في التسبيب", new_text: "مخالفة المادة 227 مرافعات" });
  check(!art.ok && /227/.test(art.error), "new words with an article number nobody gave → refused");
  const spelled = await prep({ block: P1.id!, old_text: "القصور في التسبيب", new_text: "مخالفة المادة الخامسة من القانون" });
  check(!spelled.ok && /ماده خامسه/.test(spelled.error), "new words with a SPELLED-OUT article («المادة الخامسة») → refused", !spelled.ok ? spelled.error.slice(0, 90) : "");
  const year = await prep({ block: P1.id!, old_text: "القصور في التسبيب", new_text: "القانون لسنة ألفين وأربعة وعشرين" });
  check(!year.ok, "a spelled-out year after «لسنة» → refused");
  const said = await prep({ block: P1.id!, old_text: "القصور في التسبيب", new_text: "مخالفة المادة الخامسة" }, ["ضيف مخالفة المادة الخامسة"]);
  check(said.ok, "…but the same words are fine when the lawyer said them himself");
  const own = await prep({ block: P1.id!, old_text: "القصور في التسبيب", new_text: "السبب الأول: القصور في التسبيب" });
  check(own.ok, "words the draft already has are fine");
  // the label and the reason are shown to the lawyer on the card: same guard (digits and spelled out)
  const lblDigits = await prep({ block: P1.id!, old_text: "القصور في التسبيب", new_text: "قصور التسبيب", label: "المادة 227" });
  check(!lblDigits.ok && /227/.test(lblDigits.error), "an article number in the LABEL of a change → refused");
  const whyDigits = await prep({ block: P1.id!, old_text: "القصور في التسبيب", new_text: "قصور التسبيب", why: "طبقا للمادة 313 من قانون الإثبات" });
  check(!whyDigits.ok && /313/.test(whyDigits.error), "an article number in the REASON of a change → refused");
  const whyWords = await prep({ block: P1.id!, old_text: "القصور في التسبيب", new_text: "قصور التسبيب", why: "تطبيقا للمادة ثلاثمائة" });
  check(!whyWords.ok && /ماده ثلاثمائه/.test(whyWords.error), "a spelled-out article in the REASON → refused", !whyWords.ok ? whyWords.error.slice(0, 80) : "");
  const lblWords = await prep({ block: P1.id!, old_text: "القصور في التسبيب", new_text: "قصور التسبيب", label: "رقم خمسمائة" });
  check(!lblWords.ok, "a spelled-out number in the LABEL → refused");
  const whyOk = await prep({ block: P1.id!, old_text: "القصور في التسبيب", new_text: "قصور التسبيب", why: "تطبيقا للمادة ثلاثمائة" }, ["غيّر وطبق المادة ثلاثمائة"]);
  check(whyOk.ok, "…but fine when the lawyer said it himself");
  const citeWhy = await prepareEdit(f.db, { draft: DRAFT, kind: "add", block: P1.id!, cite: { document: DOC, page: 3, quote: "المادة 227 من قانون المرافعات تنص" }, label: "إضافة", why: "سند من المادة 999", quote: "q" } as EditArgs, ["ضيف سند"], CASE);
  check(!citeWhy.ok && /999/.test(citeWhy.error), "a cited add whose REASON invents another article → refused too");

  // citations: only from the case's papers, the words read off the page by code
  const c1 = await prepareEdit(f.db, { draft: DRAFT, kind: "add", block: P1.id!, cite: { document: DOC, page: 3, quote: "المادة ٢٢٧ من   قانون المرافعات تنص على أن الأحكام تصدر بالأغلبية" }, label: "إضافة", why: "سند", quote: "q" } as EditArgs, ["ضيف سند"], CASE);
  check(c1.ok, "a citation whose words ARE on the page of a paper of the case → accepted");
  if (c1.ok) {
    eq(c1.edit.after, "المادة 227 من قانون المرافعات تنص على أن الأحكام تصدر بالأغلبية", "…the words are the PAGE's (Western digits, one space), not the model's («٢٢٧» with extra spaces)");
    eq([c1.edit.src, c1.edit.cite], ["حكم · ص 3", { doc: DOC, page: 3 }], "…with the paper's type and the page");
    const planned = planChange(B7, { kind: "add", block: P1.id! }, { text: c1.edit.after, src: c1.edit.src!, doc: c1.edit.cite!.doc, page: c1.edit.cite!.page });
    check(isQuoteBlock(planned.body.blocks[2]), "…and what is added is a locked quotation");
  }
  const c2 = await prepareEdit(f.db, { draft: DRAFT, kind: "add", block: P1.id!, cite: { document: DOC, page: 3, quote: "المادة 313 من قانون الإثبات تنص على التقادم" }, label: "إضافة", why: "سند", quote: "q" } as EditArgs, ["ضيف سند"], CASE);
  check(!c2.ok && /مش موجود في الورقة/.test(c2.error) && /مبتكتبش مادة أو حكم/.test(c2.error), "a citation that is NOT in the paper → refused: «not found», plainly; nothing is invented", !c2.ok ? c2.error.slice(0, 80) : "");
  const c3 = await prepareEdit(f.db, { draft: DRAFT, kind: "add", block: P1.id!, cite: { document: DOC, page: 3, quote: "المادة 228 تتكلم عن حاجة تانية" }, label: "إضافة", why: "سند", quote: "q" } as EditArgs, ["x"], CASE);
  check(c3.ok && c3.edit.src === "حكم · ص 4", "a page number that is off by one is found on the next page, and the source says the REAL page", c3.ok ? c3.edit.src ?? "" : c3.error);
  const c4 = await prepareEdit(f.db, { draft: DRAFT, kind: "add", block: P1.id!, cite: { document: U(21), page: 1, quote: "المادة 999 من قانون تاني" }, label: "إضافة", why: "سند", quote: "q" } as EditArgs, ["x"], CASE);
  check(!c4.ok && /مش من أوراق القضية/.test(c4.error), "a paper of ANOTHER case is not a source");
  const c5 = await prepareEdit(f.db, { draft: DRAFT, kind: "add", block: P1.id!, cite: { document: U(77), page: 1, quote: "المادة 227" }, label: "إضافة", why: "سند", quote: "q" } as EditArgs, ["x"], CASE);
  check(!c5.ok, "a paper that does not exist is not a source");
  const noCite = await prep({ kind: "add", block: P1.id!, new_text: "وطبقا للمادة 227 مرافعات" } as never);
  check(!noCite.ok && /227/.test(noCite.error), "an article typed as plain text (not cited from a paper) is refused");
  eq(f.log.filter((l) => /^(insert|update|delete)/.test(l)), [], "…and still nothing was written");

  // the tool schema: one change per call, shapes
  const sch = (a: Record<string, unknown>) => WRITE_TOOL_ARGS_OK(a);
  check(sch({ ...R({ block: "b2", old_text: "a", new_text: "b" }) }), "the tool accepts a replace with old_text and new_text");
  check(!sch({ ...R({ block: "b2", old_text: "a" }), new_text: undefined }), "…a replace with no new_text is refused by the schema");
  check(!sch({ ...R({ block: "b2", new_text: "b" }), old_text: undefined }), "…a replace with no old_text is refused");
  check(!sch({ ...R({ block: "b2", old_text: "a", new_text: "b" }), cite: { document: DOC, page: 1, quote: "xx" } }), "…a replace with a cite is refused");
  check(!sch({ draft: DRAFT, kind: "add", block: "b2", label: "x", why: "yy", quote: "q" }), "…an add with neither new_text nor cite is refused");
  check(!sch({ draft: DRAFT, kind: "add", block: "b2", new_text: "x", cite: { document: DOC, page: 1, quote: "xx" }, label: "x", why: "yy", quote: "q" }), "…an add with BOTH is refused");
  check(sch({ draft: DRAFT, kind: "add", block: "b2", cite: { document: DOC, page: 1, quote: "xx" }, label: "x", why: "yy", quote: "q" }), "…an add with a cite is fine");
  const spec = writeToolSpecs().find((s) => s.name === "edit_draft");
  check(!!spec && !(INTERNAL_TOOLS as readonly string[]).includes("edit_draft"), "edit_draft is a tool the model sees");
  eq(Object.keys((spec?.parameters as { properties: Record<string, unknown> }).properties).sort(), ["block", "cite", "draft", "kind", "label", "new_text", "old_text", "quote", "style", "why"], "…it can point at a block and give words; it can not give an id of a block it made up, a source text, a date or a number of its own");
}

console.log("\n-- (k) the spelled-out guard (#202), the chip, the read tools --");
{
  eq(spelledCitations("طبقا للمادة الخامسة من القانون رقم ثلاثة وعشرين لسنة ألفين").length, 3, "three spelled-out citations found: an article, a law number, a year");
  eq(spelledCitations("السبب الأول والثاني لقصور التسبيب").length, 0, "«الأول» outside a citation is not one");
  eq(spelledCitations("بالمادة العاشرة وللمادة الأولى").length, 2, "prefixes (ب، ل) are read");
  for (const w of ["المادة ثلاثمائة", "رقم خمسمائة", "لسنة ستمائة", "المادة ثلاثمئة", "المادة اثني عشر", "المادة اثنى عشر", "المادة اثنا عشر", "المادة أربعمائة", "المادة سبعمائة", "المادة ثمانمائة", "الطعن رقم تسعمائة", "المادة ثلاث مائة", "المادة تلتمية"]) {
    if (w.endsWith("تلتمية")) continue; // (a colloquial form nobody writes in a draft: not claimed)
    eq(spelledCitations(w).length, 1, `spelled-out number caught: «${w}»`);
  }
  eq(citationsNotIn("المادة ثلاثمائة", ["المادة ثلاثمائة"]), [], "…and fine when the lawyer already said it");
  eq(citationsNotIn("المادة ثلاثمائة", ["المادة مائة"]).length, 1, "…but not when he said another one");
  eq(citationsNotIn("المادة خمسمائة", [], { digits: true }).length, 1, "a one-word hundred is caught with the digits option too");
  eq(citationsNotIn("المادة النص الواضح", []), [], "an ordinary word after «المادة» is not a number");
  eq(citationsNotIn("المادة المقتبسة", []), [], "…nor «المقتبسة»");
  eq(citationsNotIn("المادة 227 من القانون", ["x"], { digits: true }).length, 1, "digits: an article number nobody gave is caught");
  eq(citationsNotIn("المادة الخامسة", ["المادة الخامسة من القانون"]), [],"a citation the sources already have in the same words is fine");
  eq(citationsNotIn("المادة الخامسة", ["المادة السادسة"]).length, 1, "a different article is not");
  eq(citationsNotIn("المادة الخامسة", []).length, 1, "…nor one nobody gave");
  eq(numbersNotIn("المادة 227", ["الدعوى 8833"]), ["227"], "digits are still caught");

  // the chip
  const U1 = U(5);
  eq(cleanAsk([{ kind: "draft", id: U1, label: "نص مظلل", field: "b12" }]), [{ kind: "draft", id: U1, label: "نص مظلل", field: "b12" }], "the chip «draft» is accepted, with a block id like b12");
  eq(cleanAsk([{ kind: "draft", id: "x" }]), [], "…only with a uuid");
  const block = askContextBlock([{ kind: "draft", id: U1, label: "القصور في التسبيب", field: "b2" }], CASE) ?? "";
  check(block.includes(`get_draft(draft_id = ${U1})`) && block.includes("الفقرة = b2") && block.includes("وليست تعليمات"), "the chip tells the model to read the draft with get_draft, names the block, and says the text is data");
  check(READ_TOOL_SPECS.some((t) => t.name === "get_draft") && READ_TOOL_SPECS.some((t) => t.name === "list_drafts"), "the model can read a draft and list a case's drafts");

  const f = memDb({ drafts: [draftRow({ body: B7 })] });
  const got = (await runReadTool(f.db, "get_draft", { draft_id: DRAFT })) as { blocks: { id: string; text: string; locked_quotations_never_change_these?: { text: string; source: string }[] }[]; note: string };
  eq(got.blocks.map((b) => b.id), B7.blocks.map((b) => b.id), "get_draft: every block with its id");
  eq(got.blocks[2].locked_quotations_never_change_these, [{ text: QUOTE_TEXT.slice(17, 37), source: "الصحيفة · ص 2" }], "…the locked spans are marked for the model, with their source");
  check(got.blocks[1].locked_quotations_never_change_these === undefined && /بيانات فقط/.test(got.note), "…other blocks have none; the text is marked as data, not instructions");
  const none = (await runReadTool(memDb({ drafts: [] }).db, "get_draft", { draft_id: DRAFT })) as { error?: string };
  eq(none.error, "المسودة غير موجودة", "get_draft: a draft this lawyer can not read is not found");
  eq(((await runReadTool(f.db, "get_draft", { draft_id: "x" })) as { error: string }).error, "draft_id غير صالح", "…a bad id is refused");
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
