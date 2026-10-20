/** Arabic labels for every enum in the schema. One place, so all screens say the same words. */
import type { Database } from "@/lib/db/types";

type E = Database["public"]["Enums"];

export const STAGE: Record<E["case_stage"], string> = {
  first_instance: "أول درجة",
  appeal: "استئناف",
  cassation: "نقض",
};

export const CASE_STATUS: Record<E["case_status"], string> = {
  active: "متداولة",
  reserved_for_judgment: "محجوزة للحكم",
  judged: "صدر فيها حكم",
  suspended: "موقوفة",
  closed: "منتهية",
};

export const PARTY_ROLE: Record<E["party_role"], string> = {
  plaintiff: "مدعٍ",
  defendant: "مدعى عليه",
  appellant: "مستأنف",
  appellee: "مستأنف ضده",
  cassation_appellant: "طاعن",
  cassation_appellee: "مطعون ضده",
  intervener: "خصم متدخل",
  guarantor: "ضامن",
  witness: "شاهد",
  expert: "خبير",
  other: "أخرى",
};

export const DECISION: Record<E["hearing_decision"], string> = {
  postponed: "تأجيل",
  reserved_for_judgment: "حجز للحكم",
  judgment: "حكم",
  struck_off: "شطب",
  referred_to_expert: "إحالة للخبير",
  suspended: "وقف",
  other: "قرار آخر",
};

export const JUDGMENT_KIND: Record<E["judgment_kind"], string> = {
  final: "حكم منهٍ للخصومة",
  preliminary: "حكم تمهيدي",
  interim: "حكم وقتي",
};

export const DOC_TYPE: Record<E["doc_type"], string> = {
  claim_sheet: "صحيفة دعوى",
  contract: "عقد",
  opponent_memo: "مذكرة الخصم",
  our_memo: "مذكرتنا",
  judgment: "حكم",
  power_of_attorney: "توكيل",
  expert_report: "تقرير خبير",
  evidence: "مستند إثبات",
  correspondence: "مراسلات / إنذار",
  id_document: "إثبات شخصية",
  other: "أخرى",
};

export const ARG_SIDE: Record<E["argument_side"], string> = {
  opponent: "دفاع الخصم",
  ours: "دفاعنا",
};

export const REVIEW_STATUS: Record<E["item_status"], string> = {
  suggested: "مقترح",
  confirmed: "مؤكد",
  rejected: "مرفوض",
};

export const READ_STATUS: Record<E["read_status"], string> = {
  pending: "في الانتظار",
  reading: "جارٍ القراءة",
  done: "تمت القراءة",
  failed: "تعذرت القراءة",
};

export const CLIENT_KIND: Record<E["client_kind"], string> = { person: "شخص", company: "شركة" };

export function caseLabel(c: { case_number: string | null; case_year: number | null; title?: string | null }): string {
  if (c.case_number && c.case_year) return `الدعوى رقم ${c.case_number} لسنة ${c.case_year}`;
  if (c.case_number) return `الدعوى رقم ${c.case_number}`;
  return c.title || "دعوى بلا رقم";
}
