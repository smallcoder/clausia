import "server-only";
/**
 * «افتح ملف Word كمسودة» (PR 7): the lawyer's Word file becomes a draft of the case. The RLS-bound client only; the file itself is NOT stored anywhere (the
 * draft keeps its paragraphs, bold and direction; the export puts them back on the office paper): no storage write, no `documents` row (that would send it
 * to the paper reader, which reads PDFs and pictures). The file is opened only through `openDocx` (the real size of every part is counted as it is inflated,
 * so a file that lies about its size is refused with a plain sentence). The draft is saved through `applyOp("import_draft")` with MANUAL provenance.
 */
import { applyOp, MANUAL } from "@/lib/tools/apply";
import type { Db } from "@/lib/supabase/server";
import { DocxError, openDocx } from "./docx";
import { readWordBody } from "./read-body";
import { readFile } from "./upload";

export type ImportResult = { ok: true; draftId: string; dropped: ("tables" | "images" | "footnotes")[] } | { ok: false; error: string };

export async function importWordDraft(db: Db, caseId: string, form: FormData): Promise<ImportResult> {
  const f = await readFile(form);
  if ("error" in f) return { ok: false, error: f.error };
  let read;
  try { read = await readWordBody(await openDocx(f.bytes)); } catch (e) { return { ok: false, error: e instanceof DocxError ? e.message : "تعذرت قراءة الملف" }; }
  const title = f.name.replace(/\.docx$/i, "").replace(/\s+/g, " ").trim().slice(0, 200);
  try {
    const r = await applyOp(db, "import_draft", {
      case: caseId, title: title.length >= 2 ? title : "ملف Word", body: { version: 1, blocks: read.blocks },
      imported: { file_name: f.name.slice(0, 200), dropped: read.dropped },
    }, MANUAL);
    return { ok: true, draftId: r.id, dropped: read.dropped };
  } catch (e) {
    console.error(`[word] import not saved: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, error: e instanceof Error && /غير موجودة/.test(e.message) ? e.message : "تعذر الحفظ" };
  }
}
