/**
 * Where a dropped file goes (split layout, PR 4). Pure code: the chat panel, the tests and the screenshots share it.
 *   - not exactly one file, a type the upload does not take, too big, or an upload already running → an error with the words to show;
 *   - a case context → upload to the open case (the existing upload path);
 *   - the general context → ask which case first (the picker: the lawyer's cases, or a new case).
 * The allowed types and the size limit are the upload's own (files.ts).
 */
import { ALLOWED_MIME, MAX_BYTES } from "./files";

export type DropRoute = { kind: "error"; message: string } | { kind: "upload" } | { kind: "pick" };

export function routeDrop(files: { name: string; type: string; size: number }[], ctx: { caseId: string | null; busy: boolean }): DropRoute {
  if (files.length === 0) return { kind: "error", message: "ارمي ورقة PDF أو صورة." };
  if (files.length > 1) return { kind: "error", message: "ارمي ورقة واحدة في المرة." };
  const f = files[0];
  if (!ALLOWED_MIME.includes(f.type)) return { kind: "error", message: `ما اترفعش «${f.name}»: نوع الملف مش مدعوم. ارفع PDF أو صورة (JPEG / PNG / WebP).` };
  if (f.size > MAX_BYTES) return { kind: "error", message: `ما اترفعش «${f.name}»: الملف أكبر من 25 ميجابايت.` };
  if (ctx.busy) return { kind: "error", message: "استنى لحد ما الشغل الحالي يخلص وبعدين ارمي الورقة." };
  return ctx.caseId ? { kind: "upload" } : { kind: "pick" };
}
