"use server";
// The lawyer's own entries on a client's «الحسابات» tab: «+ حركة» (a receipt or an expense) and «حدد الأتعاب» / «تعديل» (a case's fee).
// Both go through `applyOp` with MANUAL provenance (the same path as the chat's cards), RLS-bound: the client and the case must be ones this
// lawyer can read, and the case must be the client's own. The amount is read from the text digit by digit (src/lib/money.ts): unclear = refused, never guessed.
import { revalidatePath } from "next/cache";
import { parseDmy, todayIso, formatDmy } from "@/lib/dates";
import { parseAmount } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { applyOp, MANUAL } from "@/lib/tools/apply";
import { MONEY_CHARGES, MONEY_METHODS } from "@/lib/tools/registry";

export type AccountFormState = { ok?: boolean; error?: string; field?: string } | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" ? v.trim() : ""; };

/** A database or tool error → one plain sentence (never the raw text). */
function plain(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (/غير موجود|not found|violates foreign key|مش دعوى الموكل/.test(m)) return "الموكل أو الدعوى غير موجودة، أو الدعوى مش بتاعة الموكل ده";
  return "تعذر الحفظ";
}

export async function addMovementAction(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  const clientId = str(form, "client_id");
  const kind = str(form, "kind");
  const method = str(form, "method");
  const caseChoice = str(form, "case");
  const charged = str(form, "charged_to");
  const dateText = str(form, "date");
  if (!UUID.test(clientId) || (kind !== "receipt" && kind !== "expense")) return { error: "طلب غير صالح" };
  if (parseAmount(str(form, "amount")) === null) return { error: "المبلغ غير واضح: اكتب رقم واحد بالجنيه، مثل 3000 أو 450.50", field: "amount" };
  if (!(MONEY_METHODS as readonly string[]).includes(method)) return { error: "اختار طريقة الدفع", field: "method" };
  if (caseChoice !== "general" && !UUID.test(caseChoice)) return { error: "اختار القضية، أو الحساب العام للموكل", field: "case" };
  if (kind === "expense" && !(MONEY_CHARGES as readonly string[]).includes(charged)) return { error: "المصروف على الموكل ولا على المكتب؟", field: "charged_to" };
  // an empty date is today (Cairo), shown in the field; anything typed must be a full day
  const d = dateText ? parseDmy(dateText) : null;
  if (dateText && d?.precision !== "day") return { error: "التاريخ غير واضح: اكتبه يوم/شهر/سنة", field: "date" };

  const db = await createClient();
  try {
    await applyOp(db, "record_movement", {
      client: clientId, ...(caseChoice !== "general" ? { case: caseChoice } : {}), kind, amount: str(form, "amount"), method,
      date: dateText || formatDmy(todayIso()), ...(kind === "expense" ? { charged_to: charged } : {}),
      ...(str(form, "note") ? { note: str(form, "note").slice(0, 300) } : {}), quote: "حركة أضافها المحامي يدويًا",
    }, MANUAL);
  } catch (e) {
    return { error: plain(e) };
  }
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

export async function setFeeAction(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  const clientId = str(form, "client_id");
  const caseId = str(form, "case_id");
  const kind = str(form, "kind");
  if (!UUID.test(clientId) || !UUID.test(caseId) || (kind !== "fixed" && kind !== "open")) return { error: "طلب غير صالح" };
  if (kind === "fixed" && parseAmount(str(form, "amount")) === null) return { error: "المبلغ غير واضح: اكتب رقم واحد بالجنيه، مثل 15000", field: "amount" };
  const db = await createClient();
  try {
    await applyOp(db, "set_case_fee", { case: caseId, kind, ...(kind === "fixed" ? { amount: str(form, "amount") } : {}), quote: "أتعاب حددها المحامي يدويًا" }, MANUAL);
  } catch (e) {
    return { error: plain(e) };
  }
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}
