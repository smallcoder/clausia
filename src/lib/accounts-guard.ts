/**
 * The never-guess rules of the two money tools (PR 5). PURE (no database): `turn.ts` runs them before a card is made, the tests run them alone.
 *
 *  - the amount must be one the lawyer's own words state in numerals («3000», «3,000», «٣٠٠٠», «3.5 ألف»); a number in words («ثلاثة آلاف») is not found,
 *    so the assistant has to ask;
 *  - the method (كاش، فودافون كاش، إنستاباي، تحويل بنكي، شيك) must be named in the lawyer's words too;
 *  - the case: named by the lawyer, or suggested by code (see `suggestCase`), or — when it cannot be told — the assistant asks.
 */
import type { SuggestCase } from "@/lib/accounts-calc";
import { suggestCase } from "@/lib/accounts-calc";
import { normalizeDigits } from "@/lib/dates";
import { amountStated } from "@/lib/money";

const METHOD_WORDS: Record<string, RegExp> = {
  cash: /كاش|نقد|cash/,
  vodafone_cash: /فودافون|vodafone/,
  instapay: /انستا|insta\s?pay/,
  bank_transfer: /تحويل|بنك|bank/,
  cheque: /شيك|cheque|check/,
};

/** Letters folded the way the lawyer may write them (alef forms, ya, ta marbuta, no marks), spaces kept. */
const fold = (s: string) => s.replace(/[\u064b-\u0652\u0640]/g, "").replace(/[إأآٱ]/g, "ا").replace(/[ىی]/g, "ي").replace(/ة/g, "ه").toLowerCase();

/** True when the lawyer's words name this payment method. «فودافون كاش» is read as Vodafone Cash only, never also as plain cash. */
export function methodStated(method: string, texts: string[]): boolean {
  const re = METHOD_WORDS[method];
  if (!re) return false;
  const src = fold(texts.join("\n"));
  return re.test(method === "cash" ? src.replace(/فودافون\s*كاش|vodafone\s*cash/g, " ") : src);
}

/** The proposed values the lawyer's words do not state (empty = fine). `texts` = the lawyer's messages + the attached papers. */
export function moneyNotInSource(tool: string, args: Record<string, unknown>, texts: string[]): string[] {
  const out: string[] = [];
  if (tool !== "record_movement" && tool !== "set_case_fee") return out;
  const amount = args.amount;
  if (amount !== undefined && amount !== null && String(amount).trim() && !amountStated(amount as string | number, texts.map(normalizeDigits))) {
    out.push(`المبلغ «${amount}» مش مذكور بالأرقام في كلام المحامي`);
  }
  if (tool === "record_movement" && typeof args.method === "string" && !methodStated(args.method, texts)) {
    out.push("طريقة الدفع مش مذكورة في كلام المحامي");
  }
  return out;
}

/** What the card shows next to the case and the date. */
export interface MoneyHint {
  /** every case of the client, to change the choice on the card: its label (with the balance), its short name, and what is still owed on it (null: no balance) */
  cases: { id: string; label: string; name: string; remaining: number | null }[];
  /** the sentence under the fields: why this case was put */
  note: string | null;
  /** the date is today's, filled in by code (the lawyer did not say one) */
  today: boolean;
}

export type CaseChoice = SuggestCase & { label: string; name: string };

/**
 * Decides the case of a movement before the card is made.
 *  - the lawyer named one → it; `general_account` → none;
 *  - else the code's suggestion (one open case, or the one with a balance), with a sentence saying why;
 *  - several open cases and no single one with a balance → NOT guessed: an error the assistant turns into a question.
 */
export function resolveMovementCase(
  args: { case?: string; general_account?: boolean },
  cases: CaseChoice[],
): { ok: true; case: string | null; hint: Pick<MoneyHint, "cases" | "note"> } | { ok: false; error: string } {
  const list = cases.map((c) => ({ id: c.id, label: c.label, name: c.name, remaining: c.money.remaining }));
  if (args.general_account) return { ok: true, case: null, hint: { cases: list, note: null } };
  if (args.case) return { ok: true, case: args.case, hint: { cases: list, note: null } };
  const s = suggestCase(cases);
  const openCount = cases.filter((c) => c.open).length;
  if (s.why === "ambiguous") {
    const names = cases.filter((c) => c.open).map((c) => c.name).join("؛ ");
    return { ok: false, error: `لم يُقترح: للموكل أكتر من قضية متداولة (${openCount}) ومفيش واحدة واضح إنها عليها الباقي (${names}). اسأل المحامي: الحركة دي على أنهي قضية، ولا على الحساب العام للموكل؟ ولا تخمّن.` };
  }
  if (s.why === "none") return { ok: true, case: null, hint: { cases: list, note: "مفيش قضايا متداولة للموكل ده، فهتتسجل على حسابه العام. غيّرها لو لازم." } };
  const name = cases.find((c) => c.id === s.id)!.name;
  return {
    ok: true, case: s.id,
    hint: { cases: list, note: s.why === "only" ? `عنده قضية واحدة متداولة، فحطيتها عليها (${name}). غيّرها لو مش دي.` : `عنده ${openCount} قضايا متداولة، فحطيتها على ${name} لأن عليها باقي. غيّرها لو مش دي.` },
  };
}
