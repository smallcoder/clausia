import "server-only";
/**
 * Makes a draft (PR 6): reads the template and the case file through the lawyer's RLS-bound client, fills the template with code
 * (src/lib/library/fill.ts), and checks the grounds / requests the model may have drafted because the lawyer asked.
 *  - `prepareDraft`: what the chat does before the card is made (the card shows what was filled, from where, and what is missing). Saves nothing.
 *  - `buildDraft`: the same fill again at the moment of «أكّد» (applyOp), so a draft is made from the file as it is THEN.
 * The writes themselves are in applyOp (src/lib/tools/apply.ts).
 */
import { z } from "zod";
import { getCaseFile, type CaseFile } from "@/lib/case-file";
import { caseLabel } from "@/lib/labels";
import type { DraftPreview } from "@/lib/proposals";
import type { Db } from "@/lib/supabase/server";
import { fillTemplate, needsEarlierCase } from "./fill";
import { askedForLegalText, citationsNotIn, numbersNotIn } from "./guards";
import type { DraftFill, FillResult, TemplateBody } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A template body read from the database is data like any other: its shape is checked, not trusted. */
export const TemplateBodySchema = z.object({
  version: z.literal(1),
  blocks: z.array(z.union([
    z.object({ t: z.enum(["title", "h", "p"]), text: z.string().max(4000) }),
    z.object({ t: z.literal("lawyer"), key: z.string().regex(/^[a-z_]+$/), heading: z.string().max(200), hint: z.string().max(200).optional() }),
  ])).max(200),
  manual: z.array(z.object({ key: z.string().regex(/^[a-z_]+$/), label: z.string().max(100) })).max(50).optional(),
  for_stage: z.enum(["appeal", "cassation"]).optional(),
});

export interface LoadedTemplate { id: string; name: string; needs_lawyer_review: boolean; body: TemplateBody; office: boolean }

/** A template this lawyer can read (the shared base ones and the office's own): another office's id is simply not found. */
export async function loadTemplate(db: Db, id: string): Promise<LoadedTemplate> {
  if (!UUID.test(id)) throw new Error("الصيغة غير موجودة");
  const { data } = await db.from("templates").select("id, name, body, needs_lawyer_review, office_id").eq("id", id).maybeSingle();
  if (!data) throw new Error("الصيغة غير موجودة");
  const body = TemplateBodySchema.safeParse(data.body);
  if (!body.success) throw new Error("الصيغة تالفة: شكلها غير مفهوم");
  return { id: data.id, name: data.name, needs_lawyer_review: data.needs_lawyer_review, body: body.data as TemplateBody, office: !!data.office_id };
}

/** Every text of the case file the lawyer could have read (no ids): what a drafted sentence may take its numbers from. */
export function fileTexts(cf: CaseFile): string[] {
  const out: string[] = [];
  const walk = (v: unknown, key = "") => {
    if (v == null) return;
    if (typeof v === "string") { if (!UUID.test(v) && !/(^|_)id$/.test(key)) out.push(v); return; }
    if (typeof v === "number") { if (!/(^|_)id$/.test(key)) out.push(String(v)); return; }
    if (Array.isArray(v)) { v.forEach((x) => walk(x, key)); return; }
    if (typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(cf);
  return out;
}

export interface DraftInput { template: string; case: string; grounds?: string; requests?: string }

/** The file of the earlier stage's case, for a template of the next stage on a case that is already there (null when there is none or it is not readable). */
async function earlierFile(db: Db, body: TemplateBody, cf: CaseFile): Promise<CaseFile | null> {
  if (!needsEarlierCase(body, cf)) return null;
  try { return await getCaseFile(db, cf.case.previous_stage_case!.id); } catch { return null; }
}

/** The fill, with the template and the file it was made from. Throws a plain Arabic sentence when the template or the case can not be read. */
export async function buildDraft(db: Db, input: DraftInput): Promise<{ template: LoadedTemplate; cf: CaseFile; title: string } & FillResult> {
  const template = await loadTemplate(db, input.template);
  if (!UUID.test(input.case)) throw new Error("الدعوى غير موجودة");
  let cf: CaseFile;
  try { cf = await getCaseFile(db, input.case); } catch { throw new Error("الدعوى غير موجودة"); }
  const previous = await earlierFile(db, template.body, cf);
  const r = fillTemplate(template.body, cf, { previous, grounds: input.grounds, requests: input.requests });
  const who = cf.client?.name ?? caseLabel(cf.case);
  return { template, cf, title: `${template.name} · ${who}`, ...r };
}

/** The lawyer's own words the grounds / requests may be asked in: this message, then the two before it (never a paper's text). */
export function recentLawyerTexts(current: string, currentId: string, lawyer: { id: string; content: string }[]): string[] {
  return [current, ...lawyer.filter((m) => m.id !== currentId).slice(-2).reverse().map((m) => m.content)];
}

/** The chat's `create_draft` call → the card's preview. The template and the case must be saved ids (an «@ref» can not point at one). Never throws. */
export async function draftFromCall(db: Db, args: Record<string, unknown>, lawyerTexts: string[]): Promise<{ ok: true; draft: DraftPreview } | { ok: false; error: string }> {
  if ([args.template, args.case].some((v) => typeof v !== "string" || v.startsWith("@"))) {
    return { ok: false, error: "لم يُقترح: الصيغة والدعوى لازم يكونوا معرّفات محفوظة (ابحث عنهم بـ search_templates و search_cases)." };
  }
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const r = await prepareDraft(db, { template: args.template as string, case: args.case as string, grounds: str(args.grounds), requests: str(args.requests) }, lawyerTexts)
    .catch((e) => ({ ok: false as const, error: `لم يُقترح: ${e instanceof Error ? e.message : String(e)}` }));
  return r.ok ? { ok: true, draft: { title: r.title, fill: r.fill } } : r;
}

export type PreparedDraft = { ok: true; fill: DraftFill; title: string } | { ok: false; error: string };

/**
 * Before the card: fills, and refuses what the lawyer did not ask for.
 *  - grounds / requests drafted although the lawyer did not ask for them in his own words → refused (the model leaves them empty);
 *  - a drafted text with a number the lawyer's words and the case file do not have → refused (no article, case number or date from memory).
 * `lawyerTexts`: the lawyer's own messages (this one first). Papers are not his words, so a paper can not ask for grounds.
 */
export async function prepareDraft(db: Db, input: DraftInput, lawyerTexts: string[]): Promise<PreparedDraft> {
  const legal = [input.grounds, input.requests].filter((x): x is string => !!x?.trim());
  if (legal.length && !askedForLegalText(lawyerTexts)) {
    return { ok: false, error: "لم يُقترح: المحامي لم يطلب كتابة الأسباب أو الطلبات. أعد الاستدعاء بدون grounds و requests (بيتساب فاضيين للمحامي)." };
  }
  let built;
  try { built = await buildDraft(db, input); } catch (e) { return { ok: false, error: `لم يُقترح: ${e instanceof Error ? e.message : String(e)}` }; }
  if (legal.length) {
    const bad = numbersNotIn(legal.join("\n"), [...lawyerTexts, ...fileTexts(built.cf)]);
    if (bad.length) return { ok: false, error: `لم يُقترح: النص المكتوب فيه أرقام أو تواريخ مش في كلام المحامي ولا في ملف القضية (${bad.slice(0, 5).join("، ")}). شيلها (سيبها للمحامي) وأعد الاستدعاء.` };
    // a spelled-out article, law number or year («المادة الخامسة»، «لسنة ألفين وأربعة وعشرين»): digits are caught above, words must be too (#202)
    const spelled = citationsNotIn(legal.join("\n"), [...lawyerTexts, ...fileTexts(built.cf)]);
    if (spelled.length) return { ok: false, error: `لم يُقترح: النص المكتوب فيه مادة أو رقم أو سنة مكتوبين بالحروف مش في كلام المحامي ولا في ملف القضية (${spelled.slice(0, 3).join("، ")}). شيلها (سيبها للمحامي) وأعد الاستدعاء.` };
  }
  return { ok: true, fill: built.fill, title: built.title };
}
