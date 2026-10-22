/**
 * The fixed set of tools the assistant may use. The model never writes SQL and never writes directly:
 * WRITE tools only produce a proposal (confirmation card, see ../proposals.ts); the row is inserted by
 * `applyOp` after the lawyer taps confirm. READ tools run at once (./read.ts).
 *
 * Arg conventions (the model sees these descriptions):
 * - References: an existing uuid, or "@name" pointing at an item created earlier in the SAME card
 *   (give that item `ref: "name"`).
 * - Dates: exactly as the lawyer / document states them, d/m/yyyy (or m/yyyy, yyyy). Never guessed.
 * - quote: the exact words in the lawyer's message or the document page that support the item.
 */
import { z } from "zod";
import { parseDmy } from "@/lib/dates";
import type { Database } from "@/lib/db/types";

type E = Database["public"]["Enums"];
const enumOf = <T extends string>(values: readonly T[]) => z.enum(values as [T, ...T[]]);

export const PARTY_ROLES = ["plaintiff", "defendant", "appellant", "appellee", "cassation_appellant", "cassation_appellee", "intervener", "guarantor", "witness", "expert", "other"] as const satisfies readonly E["party_role"][];
export const STAGES = ["first_instance", "appeal", "cassation"] as const satisfies readonly E["case_stage"][];
export const CASE_STATUSES = ["active", "reserved_for_judgment", "judged", "suspended", "closed"] as const satisfies readonly E["case_status"][];
export const DECISIONS = ["postponed", "reserved_for_judgment", "judgment", "struck_off", "referred_to_expert", "suspended", "other"] as const satisfies readonly E["hearing_decision"][];
export const JUDGMENT_KINDS = ["final", "preliminary", "interim"] as const satisfies readonly E["judgment_kind"][];
export const DOC_TYPES = ["claim_sheet", "contract", "opponent_memo", "our_memo", "judgment", "power_of_attorney", "expert_report", "evidence", "correspondence", "id_document", "other"] as const satisfies readonly E["doc_type"][];

const ref = (what: string) => z.string().min(1).describe(`${what}: uuid موجود، أو «@اسم» لعنصر في نفس البطاقة`);
const selfRef = z.string().regex(/^[a-z0-9_]+$/i).optional().describe("اسم قصير لهذا العنصر ليُشار إليه بـ «@اسم» في نفس البطاقة");
const quote = z.string().min(1).describe("النص الحرفي من رسالة المحامي أو من صفحة المستند الذي يثبت هذا العنصر");
const dmy = (what: string) =>
  z.string().refine((s) => parseDmy(s) !== null, { message: "تاريخ غير واضح: اسأل المحامي عن التاريخ بصيغة يوم/شهر/سنة" })
    .describe(`${what} كما ذُكر حرفيًا بصيغة d/m/yyyy أو m/yyyy أو yyyy. إن لم يُذكر بوضوح فلا ترسله واسأل المحامي.`);

export const WRITE_TOOL_ARGS = {
  create_client: z.object({
    ref: selfRef,
    name: z.string().min(2).describe("اسم الموكل كما ذكره المحامي تمامًا"),
    kind: z.enum(["person", "company"]).default("person"),
    phone: z.string().optional(),
    address: z.string().optional(),
    notes: z.string().optional(),
    quote,
  }),
  create_case: z.object({
    ref: selfRef,
    client: ref("الموكل").optional(),
    title: z.string().optional().describe("وصف قصير للدعوى، مثل «دعوى صحة ونفاذ عقد بيع»"),
    case_number: z.string().optional().describe("رقم الدعوى كما ذُكر حرفيًا. لا تخمّن."),
    case_year: z.coerce.number().int().min(1950).max(2100).optional().describe("سنة الدعوى (لسنة ...) كما ذُكرت"),
    court: z.string().optional().describe("اسم المحكمة كما ذُكر"),
    circuit: z.string().optional().describe("الدائرة"),
    case_type: z.string().optional().describe("نوع الدعوى: مدني، عمال، إيجارات، أسرة، تجاري، جنح، إداري..."),
    stage: enumOf(STAGES).default("first_instance"),
    previous_stage_case: ref("دعوى الدرجة السابقة").optional(),
    client_role: enumOf(PARTY_ROLES).optional().describe("صفة موكلنا في الدعوى"),
    facts_date: dmy("تاريخ الوقائع الأساسي").optional(),
    summary: z.string().optional(),
    quote,
  }),
  update_case: z.object({
    case: ref("الدعوى"),
    title: z.string().optional(),
    case_number: z.string().optional(),
    case_year: z.coerce.number().int().min(1950).max(2100).optional(),
    court: z.string().optional(),
    circuit: z.string().optional(),
    case_type: z.string().optional(),
    stage: enumOf(STAGES).optional(),
    status: enumOf(CASE_STATUSES).optional(),
    client_role: enumOf(PARTY_ROLES).optional(),
    facts_date: dmy("تاريخ الوقائع الأساسي").optional(),
    summary: z.string().optional(),
    quote,
  }),
  add_party: z.object({
    case: ref("الدعوى"),
    name: z.string().min(2).describe("اسم الخصم أو الطرف كما ذُكر تمامًا"),
    role: enumOf(PARTY_ROLES),
    is_our_client: z.boolean().default(false),
    client: ref("الموكل إن كان هذا الطرف موكلنا").optional(),
    representative: z.string().optional().describe("محامي هذا الطرف إن ذُكر"),
    notes: z.string().optional(),
    quote,
  }),
  add_fact: z.object({
    case: ref("الدعوى"),
    date: dmy("تاريخ الواقعة").optional(),
    date_text: z.string().optional().describe("التاريخ كما ورد إن كان تقريبيًا، مثل «أوائل 2021»"),
    text: z.string().min(3).describe("الواقعة بجملة واضحة"),
    quote,
  }),
  add_request: z.object({
    case: ref("الدعوى"),
    text: z.string().min(3).describe("طلب موكلنا"),
    kind: z.string().optional().describe("أصلي / احتياطي / مستعجل"),
    quote,
  }),
  add_argument: z.object({
    case: ref("الدعوى"),
    side: z.enum(["opponent", "ours"]).default("opponent"),
    kind: z.string().optional().describe("دفع شكلي / دفع موضوعي / دفاع"),
    text: z.string().min(3),
    quote,
  }),
  add_hearing: z.object({
    ref: selfRef,
    case: ref("الدعوى"),
    date: dmy("تاريخ الجلسة"),
    purpose: z.string().optional().describe("الغرض من الجلسة أو المطلوب فيها، إن ذُكر"),
    location: z.string().optional().describe("مكان الجلسة كما كُتب أو قيل حرفيًا (الدور، القاعة، المبنى)، مثل «الدور 4 · قاعة 12». لا تخمّنه."),
    quote,
  }),
  set_hearing_location: z.object({
    hearing: ref("الجلسة"),
    location: z.string().min(2).describe("مكان الجلسة كما كُتب في الورقة أو قاله المحامي حرفيًا (الدور، القاعة، المبنى). لا تخمّنه."),
    quote,
  }),
  record_decision: z.object({
    hearing: ref("الجلسة"),
    decision: enumOf(DECISIONS),
    decision_text: z.string().optional().describe("نص القرار كما ذُكر"),
    next_date: dmy("تاريخ الجلسة القادمة (مطلوب عند التأجيل)").optional(),
    next_requirements: z.string().optional().describe("المطلوب للجلسة القادمة"),
    quote,
  }),
  add_judgment: z.object({
    case: ref("الدعوى"),
    hearing: ref("الجلسة التي صدر فيها").optional(),
    date: dmy("تاريخ الحكم").optional(),
    kind: enumOf(JUDGMENT_KINDS).default("final"),
    operative_text: z.string().min(3).describe("منطوق الحكم كما ذُكر"),
    outcome: z.string().optional().describe("لصالحنا / ضدنا / جزئي — فقط كما قاله المحامي"),
    appeal_deadline: dmy("آخر موعد للطعن — فقط إن ذكره المحامي صراحة، لا تحسبه أبدًا").optional(),
    appeal_deadline_note: z.string().optional(),
    quote,
  }),
  attach_document: z.object({
    document: ref("المستند"),
    case: ref("الدعوى"),
    doc_type: enumOf(DOC_TYPES),
    title: z.string().optional(),
    quote: quote.optional(),
  }),
  // The two tools below are made ONLY by the document-column runner (src/lib/doc-columns/run.ts), never by the chat
  // model: every cell there is built from a quote that code checked against the paper's page. They are kept out of
  // the model's tool list (writeToolSpecs) and refused if the model names them (turn.ts).
  add_doc_column: z.object({
    ref: selfRef,
    case: ref("الدعوى"),
    question: z.string().min(2).max(300).describe("سؤال المحامي كما كتبه"),
    title: z.string().min(2).max(80).describe("عنوان العمود في الجدول"),
    quote: quote.optional(),
  }),
  add_doc_cell: z.object({
    column: ref("العمود"),
    document: ref("المستند"),
    answer: z.string().min(1).max(600).optional().describe("الإجابة القصيرة؛ تُترك فارغة إذا لم يذكر المستند ذلك («مش مذكور»)"),
    note: z.string().max(300).optional(),
    quote: quote.optional(),
  }).refine((a) => !a.answer || !!a.quote, { message: "الإجابة بدون اقتباس من الورقة", path: ["quote"] }),
} as const;

export type WriteTool = keyof typeof WRITE_TOOL_ARGS;
export type WriteArgs<T extends WriteTool> = z.infer<(typeof WRITE_TOOL_ARGS)[T]>;
export const WRITE_TOOLS = Object.keys(WRITE_TOOL_ARGS) as WriteTool[];
export const isWriteTool = (n: string): n is WriteTool => n in WRITE_TOOL_ARGS;
/** Tools only code may propose (see above): not offered to the model, refused if it calls them. */
export const INTERNAL_TOOLS = ["add_doc_column", "add_doc_cell"] as const satisfies readonly WriteTool[];
export const isInternalTool = (n: string): boolean => (INTERNAL_TOOLS as readonly string[]).includes(n);

export const WRITE_TOOL_DESCRIPTIONS: Record<WriteTool, string> = {
  create_client: "اقتراح إنشاء موكل جديد. يُعرض على المحامي للتأكيد قبل الحفظ.",
  create_case: "اقتراح إنشاء دعوى جديدة لموكل (موجود أو @مرجع في نفس البطاقة).",
  update_case: "اقتراح تعديل بيانات دعوى موجودة (رقم، محكمة، دائرة، درجة، حالة، تاريخ الوقائع...).",
  add_party: "اقتراح إضافة طرف (خصم أو غيره) إلى دعوى مع صفته.",
  add_fact: "اقتراح إضافة واقعة مؤرخة إلى الدعوى.",
  add_request: "اقتراح إضافة طلب من طلبات موكلنا.",
  add_argument: "اقتراح إضافة دفع أو دفاع (للخصم أو لنا).",
  add_hearing: "اقتراح إضافة جلسة بتاريخها (ومكانها إن ذُكر).",
  set_hearing_location: "اقتراح تسجيل مكان جلسة موجودة (الدور / القاعة / المبنى) كما ذُكر فقط.",
  record_decision: "اقتراح تسجيل قرار جلسة. عند التأجيل يجب ذكر تاريخ الجلسة القادمة، وتُنشأ تلقائيًا.",
  add_judgment: "اقتراح تسجيل حكم أو قرار صادر. ميعاد الطعن فقط إن ذكره المحامي.",
  attach_document: "اقتراح ربط مستند مرفوع بدعوى وتحديد نوعه.",
  add_doc_column: "عمود جديد في جدول مستندات الدعوى (من سؤال المحامي). يصنعه الكود فقط.",
  add_doc_cell: "خانة في عمود مستندات: إجابة السؤال من مستند واحد. يصنعها الكود فقط.",
};

/** Field list for rendering/editing a confirmation card generically. */
export type FieldType = "text" | "longtext" | "date" | "number" | "bool" | "ref" | "readonly" | { enum: Record<string, string> };
export interface FieldSpec { key: string; label: string; type: FieldType }

import { ARG_SIDE, CASE_STATUS, CLIENT_KIND, DECISION, DOC_TYPE, JUDGMENT_KIND, PARTY_ROLE, STAGE } from "@/lib/labels";

export const OP_TITLE: Record<WriteTool, string> = {
  create_client: "موكل جديد",
  create_case: "دعوى جديدة",
  update_case: "تعديل بيانات الدعوى",
  add_party: "طرف في الدعوى",
  add_fact: "واقعة",
  add_request: "طلب لموكلنا",
  add_argument: "دفع / دفاع",
  add_hearing: "جلسة",
  set_hearing_location: "مكان الجلسة",
  record_decision: "قرار جلسة",
  add_judgment: "حكم",
  attach_document: "ربط مستند",
  add_doc_column: "عمود جديد",
  add_doc_cell: "خانة في العمود",
};

export const OP_FIELDS: Record<WriteTool, FieldSpec[]> = {
  create_client: [
    { key: "name", label: "الاسم", type: "text" },
    { key: "kind", label: "النوع", type: { enum: CLIENT_KIND } },
    { key: "phone", label: "الهاتف", type: "text" },
    { key: "address", label: "العنوان", type: "text" },
    { key: "notes", label: "ملاحظات", type: "longtext" },
  ],
  create_case: [
    { key: "client", label: "الموكل", type: "ref" },
    { key: "title", label: "وصف الدعوى", type: "text" },
    { key: "case_number", label: "رقم الدعوى", type: "text" },
    { key: "case_year", label: "السنة", type: "number" },
    { key: "court", label: "المحكمة", type: "text" },
    { key: "circuit", label: "الدائرة", type: "text" },
    { key: "case_type", label: "النوع", type: "text" },
    { key: "stage", label: "الدرجة", type: { enum: STAGE } },
    { key: "previous_stage_case", label: "دعوى الدرجة السابقة", type: "ref" },
    { key: "client_role", label: "صفة موكلنا", type: { enum: PARTY_ROLE } },
    { key: "facts_date", label: "تاريخ الوقائع", type: "date" },
    { key: "summary", label: "ملخص", type: "longtext" },
  ],
  update_case: [
    { key: "case", label: "الدعوى", type: "ref" },
    { key: "title", label: "وصف الدعوى", type: "text" },
    { key: "case_number", label: "رقم الدعوى", type: "text" },
    { key: "case_year", label: "السنة", type: "number" },
    { key: "court", label: "المحكمة", type: "text" },
    { key: "circuit", label: "الدائرة", type: "text" },
    { key: "case_type", label: "النوع", type: "text" },
    { key: "stage", label: "الدرجة", type: { enum: STAGE } },
    { key: "status", label: "الحالة", type: { enum: CASE_STATUS } },
    { key: "client_role", label: "صفة موكلنا", type: { enum: PARTY_ROLE } },
    { key: "facts_date", label: "تاريخ الوقائع", type: "date" },
    { key: "summary", label: "ملخص", type: "longtext" },
  ],
  add_party: [
    { key: "case", label: "الدعوى", type: "ref" },
    { key: "name", label: "الاسم", type: "text" },
    { key: "role", label: "الصفة", type: { enum: PARTY_ROLE } },
    { key: "is_our_client", label: "موكلنا؟", type: "bool" },
    { key: "representative", label: "محاميه", type: "text" },
    { key: "notes", label: "ملاحظات", type: "longtext" },
  ],
  add_fact: [
    { key: "case", label: "الدعوى", type: "ref" },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "date_text", label: "التاريخ كما ورد", type: "text" },
    { key: "text", label: "الواقعة", type: "longtext" },
  ],
  add_request: [
    { key: "case", label: "الدعوى", type: "ref" },
    { key: "text", label: "الطلب", type: "longtext" },
    { key: "kind", label: "النوع", type: "text" },
  ],
  add_argument: [
    { key: "case", label: "الدعوى", type: "ref" },
    { key: "side", label: "الجانب", type: { enum: ARG_SIDE } },
    { key: "kind", label: "النوع", type: "text" },
    { key: "text", label: "النص", type: "longtext" },
  ],
  add_hearing: [
    { key: "case", label: "الدعوى", type: "ref" },
    { key: "date", label: "تاريخ الجلسة", type: "date" },
    { key: "purpose", label: "الغرض / المطلوب", type: "text" },
    { key: "location", label: "المكان", type: "text" },
  ],
  set_hearing_location: [
    { key: "hearing", label: "الجلسة", type: "ref" },
    { key: "location", label: "المكان", type: "text" },
  ],
  record_decision: [
    { key: "hearing", label: "الجلسة", type: "ref" },
    { key: "decision", label: "القرار", type: { enum: DECISION } },
    { key: "decision_text", label: "نص القرار", type: "longtext" },
    { key: "next_date", label: "الجلسة القادمة", type: "date" },
    { key: "next_requirements", label: "المطلوب للجلسة القادمة", type: "longtext" },
  ],
  add_judgment: [
    { key: "case", label: "الدعوى", type: "ref" },
    { key: "hearing", label: "الجلسة", type: "ref" },
    { key: "date", label: "تاريخ الحكم", type: "date" },
    { key: "kind", label: "النوع", type: { enum: JUDGMENT_KIND } },
    { key: "operative_text", label: "المنطوق", type: "longtext" },
    { key: "outcome", label: "النتيجة", type: "text" },
    { key: "appeal_deadline", label: "آخر موعد للطعن (كما ذكره المحامي)", type: "date" },
    { key: "appeal_deadline_note", label: "ملاحظة الطعن", type: "text" },
  ],
  attach_document: [
    { key: "document", label: "المستند", type: "ref" },
    { key: "case", label: "الدعوى", type: "ref" },
    { key: "doc_type", label: "نوع المستند", type: { enum: DOC_TYPE } },
    { key: "title", label: "العنوان", type: "text" },
  ],
  add_doc_column: [
    { key: "question", label: "السؤال", type: "readonly" },
    { key: "title", label: "عنوان العمود", type: "text" },
  ],
  add_doc_cell: [
    { key: "column", label: "العمود", type: "ref" },
    { key: "document", label: "المستند", type: "ref" },
    { key: "answer", label: "الإجابة", type: "longtext" },
    { key: "note", label: "ملاحظة", type: "readonly" },
  ],
};

/** Tool specs for the provider (JSON Schema from zod). */
export function writeToolSpecs() {
  return WRITE_TOOLS.filter((name) => !isInternalTool(name)).map((name) => ({
    name,
    description: WRITE_TOOL_DESCRIPTIONS[name],
    parameters: z.toJSONSchema(WRITE_TOOL_ARGS[name], { io: "input" }) as Record<string, unknown>,
  }));
}
