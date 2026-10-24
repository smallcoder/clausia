import "server-only";
/**
 * The lawyer's uploads of a Word file (PR 6b): «ورق المكتب» and «+ ارفع صيغة مكتبك». The RLS-bound client only. The file goes to the EXISTING documents
 * bucket under the existing path convention ({office_id}/…, which the four docs_* storage policies already cover: no new bucket, no new policy); no
 * `documents` row is made (that would send it to the document reader). The row (office_style / templates) is saved through `applyOp` with MANUAL
 * provenance, like every other entry of the lawyer; if that fails the file is removed again.
 */
import { applyOp, MANUAL } from "@/lib/tools/apply";
import type { TEMPLATE_CATEGORIES } from "@/lib/tools/registry";
import type { Db } from "@/lib/supabase/server";
import { DOCX_MIME } from "./build";
import { DocxError, looksLikeDocx, MAX_DOCX_BYTES, openDocx } from "./docx";
import { readOfficeStyle } from "./office-style";
import { extractTemplateBody } from "./template";

export type UploadResult = { ok: true; note: string } | { ok: false; error: string };

/** the file of a form, checked: a Word file, not empty, not too big. Plain Arabic errors. */
async function readFile(form: FormData): Promise<{ name: string; bytes: Uint8Array } | { error: string }> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "اختار ملف Word (.docx)" };
  if (!looksLikeDocx(file.name, file.type)) return { error: "الملف لازم يكون Word (.docx). ملفات PDF والـ .doc القديمة مش مدعومة" };
  if (file.size > MAX_DOCX_BYTES) return { error: "الملف أكبر من 8 ميجابايت" };
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

async function put(db: Db, path: string, bytes: Uint8Array): Promise<string | null> {
  const up = await db.storage.from("documents").upload(path, bytes, { contentType: DOCX_MIME, upsert: false });
  return up.error ? `تعذر رفع الملف: ${up.error.message}` : null;
}

/** «ورق المكتب»: any Word file from the lawyer's work. Its header, footer, fonts and margins are read and kept; the file itself is kept for the export. */
export async function saveOfficeStyle(db: Db, officeId: string, form: FormData): Promise<UploadResult> {
  const f = await readFile(form);
  if ("error" in f) return { ok: false, error: f.error };
  let style;
  try { style = await readOfficeStyle(await openDocx(f.bytes)); } catch (e) { return { ok: false, error: e instanceof DocxError ? e.message : "تعذرت قراءة الملف" }; }
  const path = `${officeId}/office-style/${crypto.randomUUID()}/office-style.docx`;
  const failed = await put(db, path, f.bytes);
  if (failed) return { ok: false, error: failed };
  try {
    await applyOp(db, "set_office_style", { file_name: f.name.slice(0, 200), storage_path: path, style }, MANUAL);
  } catch (e) {
    await db.storage.from("documents").remove([path]);
    console.error(`[word] office style not saved: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, error: "تعذر الحفظ" };
  }
  const seen = [style.header.lines.length ? "الرأس" : null, style.footer.lines.length ? "التذييل" : null, style.fonts.body ? "الخط" : null, style.margins.top !== null ? "الهوامش" : null].filter(Boolean);
  return { ok: true, note: seen.length ? `خدت من الملف: ${seen.join("، ")}` : "الملف ما فيهوش رأس ولا تذييل: هيتطبق الخط والهوامش بس لو موجودين" };
}

/** «+ ارفع صيغة مكتبك»: a Word file with {{placeholders}}. Kept as the file (the export keeps its formatting) and read into a template body. */
export async function saveOfficeTemplate(db: Db, officeId: string, form: FormData): Promise<UploadResult> {
  const f = await readFile(form);
  if ("error" in f) return { ok: false, error: f.error };
  const name = String(form.get("name") ?? "").trim() || f.name.replace(/\.docx$/i, "");
  const category = String(form.get("category") ?? "") as (typeof TEMPLATE_CATEGORIES)[number];
  if (name.length < 2) return { ok: false, error: "اكتب اسم للصيغة" };
  if (!["claim", "appeal", "memo", "notice", "contract"].includes(category)) return { ok: false, error: "اختار تصنيف الصيغة" };
  let ex;
  try { ex = await extractTemplateBody(await openDocx(f.bytes)); } catch (e) { return { ok: false, error: e instanceof DocxError ? e.message : "تعذرت قراءة الملف" }; }
  if (!ex.body.blocks.length) return { ok: false, error: "مفيش نص في الملف ده" };
  const path = `${officeId}/templates/${crypto.randomUUID()}/template.docx`;
  const failed = await put(db, path, f.bytes);
  if (failed) return { ok: false, error: failed };
  try {
    await applyOp(db, "add_office_template", { office: officeId, name: name.slice(0, 120), category, description: String(form.get("description") ?? "").slice(0, 300) || `من ملف ${f.name.slice(0, 80)}`, storage_path: path, body: ex.body }, MANUAL);
  } catch (e) {
    await db.storage.from("documents").remove([path]);
    console.error(`[word] template not saved: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, error: "تعذر الحفظ" };
  }
  const n = ex.found.length;
  return { ok: true, note: n ? `لقيت ${n} ${n <= 10 ? "بيانات" : "بيان"} هتتملا من ملف القضية${ex.unknown.length ? `، و${ex.unknown.length} هتسيبها فاضية ليك (${ex.unknown.slice(0, 3).join("، ")})` : ""}` : "ما لقيتش في الملف أي {{بيان}} من بتوع Clausia: هتتحفظ الصيغة بدون ملء تلقائي" };
}
