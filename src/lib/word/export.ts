import "server-only";
/**
 * Reads for the Word side (PR 6b), all through the lawyer's RLS-bound client: the office style (and the file it came from), a draft, its template file.
 *  - `loadOfficeStyle`: the summary the pages show (no file read), null = the office has not given one yet;
 *  - `exportDraft`: the .docx of a draft. A draft from the lawyer's OWN Word template keeps that file's formatting (the values are put into the file); any
 *    other draft goes on the office's paper (his Word file with a new body), or on a plain page when there is none yet.
 */
import type { DraftBody, DraftFill } from "@/lib/library/types";
import type { Db } from "@/lib/supabase/server";
import { BLANK, buildDocx } from "./build";
import { DocxError, openDocx } from "./docx";
import type { OfficeStyle } from "./office-style";
import { fillDocxTemplate, knownKey, LAWYER_KEYS } from "./template";

export interface OfficeStyleRow { id: string; file_name: string; storage_path: string; style: OfficeStyle; updated_at: string }

export async function loadOfficeStyle(db: Db): Promise<OfficeStyleRow | null> {
  const { data, error } = await db.from("office_style").select("id, file_name, storage_path, style, updated_at").maybeSingle();
  if (error) throw new Error(`office_style: ${error.message}`);
  return data ? { ...data, style: data.style as unknown as OfficeStyle } : null;
}

async function download(db: Db, path: string): Promise<Uint8Array | null> {
  const { data, error } = await db.storage.from("documents").download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/** the values of a draft's placeholders as the Word template needs them: the filled ones, the lawyer's sections, a dotted line for anything else */
function valueFn(body: DraftBody, fill: DraftFill) {
  const filled = new Map(fill.filled.map((f) => [f.key, f.value]));
  const lawyer = new Map(body.blocks.flatMap((b) => (b.t === "lawyer" ? [[b.key, b.text.trim()] as const] : [])));
  return (name: string) => {
    const key = knownKey(name);
    if (!key) return BLANK; // a spot only the lawyer fills
    if ((LAWYER_KEYS as readonly string[]).includes(key)) return lawyer.get(key) || BLANK;
    return filled.get(key) ?? BLANK;
  };
}

export interface Exported { bytes: Uint8Array; title: string; caseId: string; officeStyle: boolean; ownTemplate: boolean }

/** The Word file of a draft, or null when the draft is not visible (another office's, or made up). */
export async function exportDraft(db: Db, draftId: string): Promise<Exported | null> {
  const { data: d, error } = await db.from("drafts").select("id, case_id, title, body, fill, template_id").eq("id", draftId).neq("review_status", "rejected").maybeSingle();
  if (error) throw new Error(`drafts: ${error.message}`);
  if (!d) return null;
  const body = d.body as unknown as DraftBody;
  const fill = d.fill as unknown as DraftFill;

  // the lawyer's own Word template: its file keeps its formatting; the values go into it
  if (d.template_id) {
    const { data: t } = await db.from("templates").select("storage_path").eq("id", d.template_id).maybeSingle();
    const tpl = t?.storage_path ? await download(db, t.storage_path) : null;
    if (tpl) {
      const zip = await openDocx(tpl);
      await fillDocxTemplate(zip, valueFn(body, fill), d.title);
      return { bytes: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }), title: d.title, caseId: d.case_id, officeStyle: false, ownTemplate: true };
    }
  }

  const style = await loadOfficeStyle(db);
  let office: Uint8Array | null = null;
  if (style) {
    office = await download(db, style.storage_path);
    if (!office) throw new DocxError("ملف ورق المكتب مش موجود. ارفعه تاني من «ورق المكتب».");
  }
  return { bytes: await buildDocx(body, { title: d.title, office }), title: d.title, caseId: d.case_id, officeStyle: !!style, ownTemplate: false };
}
