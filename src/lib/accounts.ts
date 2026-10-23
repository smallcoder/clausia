import "server-only";
/**
 * The accounts data (PR 5, الحسابات): one client's cases with their fees and what was paid, the movements, the summary, and «مين عليه فلوس؟» across
 * the office. Reads with the lawyer's own client (RLS). The arithmetic is in accounts-calc.ts (pure); money is integer piasters (money.ts).
 */
import { caseMoney, summarize, suggestCase, type CaseMoney, type Fee, type Move, type Summary, type SuggestWhy } from "@/lib/accounts-calc";
import { resolveMovementCase, type CaseChoice, type MoneyHint } from "@/lib/accounts-guard";
import { FINISHED } from "@/lib/clients";
import { formatDmy, todayIso } from "@/lib/dates";
import type { Database } from "@/lib/db/types";
import { caseNumberText, caseSubject } from "@/lib/labels";
import { formatEgp, fromDb } from "@/lib/money";
import type { Db } from "@/lib/supabase/server";

type E = Database["public"]["Enums"];

export interface AccountCase {
  id: string;
  subject: string;
  /** «772 لسنة 2025» (null: no number saved) */
  number: string | null;
  /** «772/2025», for a short label */
  short: string | null;
  status: E["case_status"];
  /** a case that is not judged or closed */
  open: boolean;
  money: CaseMoney;
}
export interface AccountMove extends Move {
  case_subject: string | null;
  case_short: string | null;
  created_by_kind: E["actor_kind"];
}
export interface ClientAccounts {
  cases: AccountCase[];
  moves: AccountMove[];
  summary: Summary;
  /** the case an unnamed receipt would go on, and why (see suggestCase) */
  suggestion: { id: string | null; why: SuggestWhy };
}

const MOVE_COLS = "id, case_id, kind, amount_piasters, method, moved_on, charged_to, note, review_status, created_by_kind, created_at";

type MoveRow = { id: string; case_id: string | null; kind: E["money_kind"]; amount_piasters: number; method: E["money_method"]; moved_on: string; charged_to: E["money_charge"] | null; note: string | null; review_status: E["item_status"]; created_by_kind: E["actor_kind"]; created_at: string };
const toMove = (r: MoveRow): Move & { created_by_kind: E["actor_kind"] } => ({
  id: r.id, case_id: r.case_id, kind: r.kind, amount: fromDb(r.amount_piasters), method: r.method, moved_on: r.moved_on,
  charged_to: r.charged_to, note: r.note, review_status: r.review_status, created_at: r.created_at, created_by_kind: r.created_by_kind,
});

/** The client's cases with fees and receipts, ready to list. Null when the client is not visible (RLS) or rejected. */
export async function getAccounts(db: Db, clientId: string): Promise<ClientAccounts | null> {
  const { data: client } = await db.from("clients").select("id").eq("id", clientId).neq("review_status", "rejected").maybeSingle();
  if (!client) return null;
  const [{ data: cases }, { data: movRows }] = await Promise.all([
    db.from("cases").select("id, title, case_type, case_number, case_year, status, created_at").eq("client_id", clientId).neq("review_status", "rejected").order("created_at", { ascending: false }),
    db.from("account_movements").select(MOVE_COLS).eq("client_id", clientId).neq("review_status", "rejected").order("moved_on", { ascending: false }).order("created_at", { ascending: false }).limit(1000),
  ]);
  const ids = (cases ?? []).map((c) => c.id);
  const { data: feeRows } = ids.length ? await db.from("case_fees").select("case_id, kind, amount_piasters").in("case_id", ids).neq("review_status", "rejected") : { data: [] };
  const fees = new Map<string, Fee>((feeRows ?? []).map((f) => [f.case_id, { kind: f.kind, amount: f.amount_piasters === null ? null : fromDb(f.amount_piasters) }]));

  const moves = (movRows ?? []).map((r) => toMove(r as MoveRow));
  const rows: AccountCase[] = (cases ?? []).map((c) => ({
    id: c.id, subject: caseSubject(c), number: caseNumberText(c), short: c.case_number ? (c.case_year ? `${c.case_number}/${c.case_year}` : c.case_number) : null,
    status: c.status, open: !FINISHED.includes(c.status),
    money: caseMoney(fees.get(c.id) ?? null, moves.filter((m) => m.case_id === c.id)),
  }));
  const byId = new Map(rows.map((c) => [c.id, c]));
  return {
    cases: rows,
    moves: moves.map((m) => ({ ...m, case_subject: m.case_id ? byId.get(m.case_id)?.subject ?? null : null, case_short: m.case_id ? byId.get(m.case_id)?.short ?? null : null })),
    summary: summarize(rows, moves),
    suggestion: suggestCase(rows.map((c) => ({ id: c.id, open: c.open, money: c.money }))),
  };
}

/** «الإخلاء · 772/2025» (+ «باقي 6,000 ج.م» when there is a balance): one choice in the card's case list */
export function caseChoiceLabel(c: AccountCase): string {
  const left = c.money.remaining ? ` — باقي ${formatEgp(c.money.remaining)}` : "";
  return `${[c.subject, c.short].filter(Boolean).join(" · ")}${left}`;
}

export interface ClientBalance {
  client_id: string;
  client: string;
  remaining: number;
  cases: { case_id: string; label: string; agreed: number; paid: number; remaining: number }[];
}

/** «مين عليه فلوس؟»: every client with a fixed fee not fully paid, the biggest balance first. Only fixed fees count (an open fee has no balance). */
export async function listBalances(db: Db, clientId?: string): Promise<ClientBalance[]> {
  let q = db.from("cases").select("id, client_id, title, case_type, case_number, case_year").not("client_id", "is", null).neq("review_status", "rejected");
  if (clientId) q = q.eq("client_id", clientId);
  const { data: cases } = await q;
  const ids = (cases ?? []).map((c) => c.id);
  if (!ids.length) return [];
  const [{ data: fees }, { data: receipts }, { data: clients }] = await Promise.all([
    db.from("case_fees").select("case_id, amount_piasters").in("case_id", ids).eq("kind", "fixed").neq("review_status", "rejected"),
    db.from("account_movements").select("case_id, amount_piasters").in("case_id", ids).eq("kind", "receipt").eq("review_status", "confirmed").limit(5000),
    db.from("clients").select("id, name").in("id", [...new Set((cases ?? []).map((c) => c.client_id!))]).neq("review_status", "rejected"),
  ]);
  const name = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const out = new Map<string, ClientBalance>();
  for (const f of fees ?? []) {
    const c = (cases ?? []).find((x) => x.id === f.case_id);
    if (!c?.client_id || !name.has(c.client_id) || f.amount_piasters === null) continue;
    const agreed = fromDb(f.amount_piasters);
    const m = caseMoney({ kind: "fixed", amount: agreed }, (receipts ?? []).filter((r) => r.case_id === c.id).map((r) => ({ id: "", case_id: c.id, kind: "receipt" as const, amount: fromDb(r.amount_piasters), method: "", moved_on: "", charged_to: null, note: null, review_status: "confirmed" as const, created_at: "" })));
    if (!m.remaining) continue;
    const row = out.get(c.client_id) ?? { client_id: c.client_id, client: name.get(c.client_id)!, remaining: 0, cases: [] };
    row.remaining += m.remaining;
    row.cases.push({ case_id: c.id, label: [caseSubject(c), caseNumberText(c)].filter(Boolean).join(" · "), agreed, paid: m.paid, remaining: m.remaining });
    out.set(c.client_id, row);
  }
  return [...out.values()].sort((a, b) => b.remaining - a.remaining || a.client.localeCompare(b.client, "ar"));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A drafted `record_movement` before its card is made: the case is decided by code (the lawyer named it, or the suggestion rule picks it, or the
 * assistant is told to ask), a date the lawyer did not say becomes today (Cairo), and the card gets the client's cases to change the choice.
 * An error here is returned to the assistant as the tool result.
 */
export async function prepareMovement(db: Db, args: Record<string, unknown>): Promise<{ ok: true; args: Record<string, unknown>; hint: MoneyHint } | { ok: false; error: string }> {
  const client = String(args.client ?? "");
  let choices: CaseChoice[] = [];
  if (UUID.test(client)) {
    const acc = await getAccounts(db, client);
    if (!acc) return { ok: false, error: "لم يُقترح: الموكل غير موجود" };
    choices = acc.cases.map((c) => ({ id: c.id, open: c.open, money: c.money, label: caseChoiceLabel(c), name: [c.subject, c.short].filter(Boolean).join(" · ") }));
  }
  const r = resolveMovementCase({ case: typeof args.case === "string" ? args.case : undefined, general_account: args.general_account === true }, choices);
  if (!r.ok) return r;
  const out: Record<string, unknown> = { ...args };
  delete out.general_account;
  if (r.case) out.case = r.case; else delete out.case;
  const today = !out.date;
  if (today) out.date = formatDmy(todayIso());
  return { ok: true, args: out, hint: { ...r.hint, today } };
}
