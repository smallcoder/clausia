/**
 * The arithmetic of a client's accounts (PR 5). PURE: rows in, numbers out, all in integer piasters (see money.ts). No database here, so the
 * tests and the pages share it.
 *
 * Rules (owner spec):
 *  - a case's fee is optional: none (never set), «open» (no amount, so no balance) or fixed;
 *  - paid so far = the receipts of the client (every case and the general account);
 *  - remaining = the fixed fees minus what was paid on those cases (never below zero: an overpayment is shown apart);
 *  - expenses = the ones charged to the client; the ones charged to the office are listed but not billed;
 *  - only CONFIRMED rows count. A row saved «as a suggestion» is shown, tagged, and left out of every total.
 */
import { sumPiasters } from "@/lib/money";

export interface Fee { kind: "fixed" | "open"; amount: number | null }
export interface Move {
  id: string; case_id: string | null; kind: "receipt" | "expense"; amount: number;
  method: string; moved_on: string; charged_to: "client" | "office" | null; note: string | null;
  review_status: "suggested" | "confirmed" | "rejected"; created_at: string;
}

const counts = (m: Move) => m.review_status === "confirmed";

export interface CaseMoney {
  fee: Fee | null;
  paid: number;
  /** fixed fee − paid, not below zero; null when the fee is open or not set (no amount, no balance) */
  remaining: number | null;
  /** paid beyond a fixed fee (0 if none) */
  over: number;
}

/** One case's money: its fee and the receipts on it. */
export function caseMoney(fee: Fee | null, moves: Move[]): CaseMoney {
  const paid = sumPiasters(moves.filter((m) => counts(m) && m.kind === "receipt").map((m) => m.amount));
  if (fee?.kind !== "fixed" || fee.amount === null) return { fee, paid, remaining: null, over: 0 };
  return { fee, paid, remaining: Math.max(fee.amount - paid, 0), over: Math.max(paid - fee.amount, 0) };
}

export interface Summary {
  /** every receipt of the client */
  paid: number;
  /** how many different cases those receipts are on, and whether some are on the general account */
  paidCases: number;
  paidGeneral: boolean;
  /** the fixed fees added up (null when no case has a fixed fee), and how many cases have an «open» fee */
  agreed: number | null;
  openFees: number;
  /** the cases with a fixed fee that still has a balance, and the sum of the balances; null when no case has a fixed fee at all */
  remaining: number | null;
  owingCases: string[];
  /** expenses charged to the client / to the office */
  expenses: number;
  officeExpenses: number;
  /** the newest receipt (by its date, then by when it was entered) */
  last: Move | null;
}

export function summarize(cases: { id: string; money: CaseMoney }[], moves: Move[]): Summary {
  const ok = moves.filter(counts);
  const receipts = ok.filter((m) => m.kind === "receipt");
  const fixed = cases.filter((c) => c.money.remaining !== null);
  const last = [...receipts].sort((a, b) => b.moved_on.localeCompare(a.moved_on) || b.created_at.localeCompare(a.created_at))[0] ?? null;
  return {
    paid: sumPiasters(receipts.map((m) => m.amount)),
    paidCases: new Set(receipts.map((m) => m.case_id).filter(Boolean)).size,
    paidGeneral: receipts.some((m) => !m.case_id),
    agreed: fixed.length ? sumPiasters(fixed.map((c) => c.money.fee!.amount!)) : null,
    openFees: cases.filter((c) => c.money.fee?.kind === "open").length,
    remaining: fixed.length ? sumPiasters(fixed.map((c) => c.money.remaining!)) : null,
    owingCases: fixed.filter((c) => c.money.remaining! > 0).map((c) => c.id),
    expenses: sumPiasters(ok.filter((m) => m.kind === "expense" && m.charged_to === "client").map((m) => m.amount)),
    officeExpenses: sumPiasters(ok.filter((m) => m.kind === "expense" && m.charged_to === "office").map((m) => m.amount)),
    last,
  };
}

// ---- which case a receipt goes on, when the lawyer did not say ----

export interface SuggestCase { id: string; open: boolean; money: CaseMoney }
export type SuggestWhy = "only" | "balance" | "none" | "ambiguous";

/**
 * The case to put a movement on when the lawyer named none (owner spec):
 *  - no open case → none (the general account);
 *  - one open case → it;
 *  - several open cases → the ONE that has a balance (a fixed fee not fully paid);
 *  - several with a balance, or none with one → no suggestion: the assistant asks, nothing is guessed.
 * The lawyer can always change the case on the card.
 */
export function suggestCase(cases: SuggestCase[]): { id: string | null; why: SuggestWhy } {
  const open = cases.filter((c) => c.open);
  if (!open.length) return { id: null, why: "none" };
  if (open.length === 1) return { id: open[0].id, why: "only" };
  const owing = open.filter((c) => (c.money.remaining ?? 0) > 0);
  return owing.length === 1 ? { id: owing[0].id, why: "balance" } : { id: null, why: "ambiguous" };
}
