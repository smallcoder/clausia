"use client";
/**
 * The confirmation card of a money entry (docs/design/ia/SBAcct* chat): «هسجّل استلام» with the amount, the method, who from and which case, one line saying why
 * that case, and «أكّد» / «عدّل». It is drawn by ProposalCard when EVERY op of the card is a money tool (record_movement, set_case_fee); the state (edits,
 * the tap, the error) stays in ProposalCard, this file only draws it. The case is a select right on the card (the suggestion is a normal choice, one tap to
 * change); «عدّل» opens the amount, the method, the date and the note. The sentence «بعد كده الباقي… هيبقى X» is worked out here, live, in integer piasters.
 * Nothing is saved before «أكّد». A saved card is one line with the print link of the receipt.
 */
import { Check, FolderClosed, Printer, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cx } from "@/components/ui";
import { FEE_KIND, MONEY_CHARGE, MONEY_METHOD } from "@/lib/labels";
import { formatEgp, parseAmount } from "@/lib/money";
import type { Proposal, ProposalOp } from "@/lib/proposals";

export const MONEY_TOOLS = ["record_movement", "set_case_fee"] as const;
/** a card whose ops are all money entries */
export const isMoneyCard = (p: Proposal) => p.ops.length > 0 && p.ops.every((o) => (MONEY_TOOLS as readonly string[]).includes(o.tool));

const open = (s: ProposalOp["status"]) => s === "pending" || s === "failed";
const input = "min-h-11 w-full rounded-md border border-border bg-field px-3 py-2 text-md text-text";
const GENERAL = "الحساب العام للموكل";

function titleOf(ops: ProposalOp[]): string {
  if (ops.length > 1) return ops.every((o) => o.tool === "record_movement") ? "هسجّل حركات" : "هسجّل في الحسابات";
  const o = ops[0];
  if (o.tool === "set_case_fee") return "هحدد الأتعاب";
  return o.args.kind === "expense" ? "هسجّل مصروف" : "هسجّل استلام";
}

export function MoneyCard({ proposal: p, lookup, edits, setEdit, pending, error, onDecide }: {
  proposal: Proposal;
  lookup: Record<string, string>;
  edits: Record<string, Record<string, unknown>>;
  setEdit: (opId: string, key: string, value: unknown) => void;
  pending: boolean;
  error: string | null;
  onDecide: (mode: "confirm" | "reject", opIds: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const live = p.ops.filter((o) => open(o.status));

  if (!live.length) {
    // decided: one line (the print link for a saved receipt, the client's accounts)
    const done = p.ops.filter((o) => o.status === "confirmed" || o.status === "suggested");
    const first = done[0];
    const a = (first?.args ?? {}) as Record<string, string>;
    const amount = parseAmount(a.amount);
    const what = !first ? "اترفض" : first.tool === "set_case_fee" ? "اتحددت الأتعاب"
      : `${a.kind === "expense" ? "اتسجّل مصروف" : "اتسجّل استلام"}${amount ? ` ${formatEgp(amount)}` : ""}`;
    return (
      <div className="flex min-h-13 flex-wrap items-center gap-x-2.5 rounded-lg border border-border-2 bg-card py-1 pe-2 ps-4 text-base shadow-soft">
        <span aria-hidden className={cx("inline-flex size-tick shrink-0 items-center justify-center rounded-full", first ? "bg-good-bg text-good" : "bg-card-2 text-text-4")}>{first ? <Check size={12} strokeWidth={2.6} /> : <X size={12} strokeWidth={2.6} />}</span>
        <span className="min-w-0 flex-1 truncate py-2 font-semibold text-text">{what}{done.length > 1 ? ` · ${done.length} عناصر` : ""}</span>
        {first?.tool === "record_movement" && first.args.kind !== "expense" && first.result_id && first.status === "confirmed" ? (
          <Link href={`/receipts/${first.result_id}`} target="_blank" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 font-semibold text-text-2 hover:text-text">
            <Printer aria-hidden size={15} strokeWidth={1.9} />اطبع الإيصال
          </Link>
        ) : null}
        {first?.tool === "record_movement" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(first.args.client)) ? (
          <Link href={`/clients/${String(first.args.client)}?tab=accounts`} className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 font-semibold text-text-2 hover:text-text">افتح الحسابات ←</Link>
        ) : null}
      </div>
    );
  }

  const merged = (o: ProposalOp) => ({ ...o.args, ...(edits[o.op_id] ?? {}) }) as Record<string, string | boolean | null | undefined>;

  return (
    <div className="overflow-hidden rounded-xl border border-border-2 bg-card shadow-card">
      <div className="flex items-center gap-3 border-b border-border-2 px-4 py-4 sm:px-5.5">
        <span className="mark inline-flex size-9 shrink-0 items-center justify-center rounded-md"><FolderClosed aria-hidden size={18} strokeWidth={2} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-md font-bold leading-[normal] text-title">{titleOf(live)}</p>
          <p className="mt-0.5 text-xs leading-[normal] text-text-3">مش هيتحفظ حاجة قبل ما تأكد</p>
        </div>
      </div>

      {live.map((o) => {
        const v = merged(o);
        const hint = o.hint;
        const amount = parseAmount(String(v.amount ?? ""));
        const isMove = o.tool === "record_movement";
        const expense = v.kind === "expense";
        const caseId = typeof v.case === "string" ? v.case : "";
        const picked = hint?.cases.find((c) => c.id === caseId);
        // «after this the balance is …»: integer piasters, the case's balance minus this receipt (a receipt on a fixed-fee case only)
        const after = isMove && !expense && picked && picked.remaining !== null && amount !== null ? picked.remaining - amount : null;
        const dateIsDefault = !!hint?.today && !("date" in (edits[o.op_id] ?? {}));
        const lab = "block text-sm leading-4 text-text-3";
        const val = "mt-1 block text-md font-bold leading-[1.4] text-text";
        const moneyField = (
          editing ? <input aria-label="المبلغ" value={String(v.amount ?? "")} dir="ltr" inputMode="decimal" onChange={(e) => setEdit(o.op_id, "amount", e.target.value)} className={cx(input, "num text-start")} />
            : amount !== null ? <span className="font-num">{formatEgp(amount)}</span> : <span className="text-bad">غير واضح</span>
        );
        // the fields, two to a row; a field left alone in its row takes the whole row
        const cells: { key: string; label: React.ReactNode; node: React.ReactNode; wide?: boolean }[] = isMove ? [
          { key: "amount", label: "المبلغ", node: moneyField },
          { key: "method", label: "الطريقة", node: editing ? (
            <select aria-label="الطريقة" value={String(v.method ?? "")} onChange={(e) => setEdit(o.op_id, "method", e.target.value)} className={input}>
              {Object.entries(MONEY_METHOD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          ) : MONEY_METHOD[v.method as keyof typeof MONEY_METHOD] ?? "—" },
          { key: "client", label: expense ? "للموكل" : "من", node: lookup[String(v.client)] ?? "الموكل" },
          { key: "date", label: "التاريخ", node: <>
            {editing ? <input aria-label="التاريخ" value={String(v.date ?? "")} dir="ltr" inputMode="numeric" placeholder="يوم/شهر/سنة" onChange={(e) => setEdit(o.op_id, "date", e.target.value)} className={cx(input, "num text-start")} />
              : <span className="font-num">{String(v.date ?? "")}</span>}
            {dateIsDefault && !editing ? <span className="mt-0.5 block text-sm font-normal text-text-3">النهارده</span> : null}
          </> },
          { key: "case", wide: true, label: <><label htmlFor={`${o.op_id}-case`}>على قضية</label>{hint?.suggested && caseId === String(o.args.case ?? "") ? <span className="ms-2 font-semibold text-gold">اقتراح</span> : null}</>, node: hint ? (
            <select id={`${o.op_id}-case`} value={caseId} onChange={(e) => setEdit(o.op_id, "case", e.target.value || null)} className="min-h-11 w-full rounded-md border border-border bg-field px-2.5 py-1.5 text-base font-semibold text-text">
              <option value="">{GENERAL}</option>
              {hint.cases.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          ) : (lookup[caseId] ?? (caseId ? "قضية محفوظة" : GENERAL)) },
          ...(expense ? [{ key: "charged", label: "المصروف", node: editing ? (
            <select aria-label="المصروف" value={String(v.charged_to ?? "")} onChange={(e) => setEdit(o.op_id, "charged_to", e.target.value)} className={input}>
              {Object.entries(MONEY_CHARGE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          ) : MONEY_CHARGE[v.charged_to as keyof typeof MONEY_CHARGE] ?? "—" }] : []),
          ...(editing || v.note ? [{ key: "note", label: "ملاحظة", node: editing
            ? <input aria-label="ملاحظة" value={String(v.note ?? "")} onChange={(e) => setEdit(o.op_id, "note", e.target.value || null)} className={input} /> : String(v.note) }] : []),
        ] : [
          { key: "case", label: "القضية", node: lookup[String(v.case)] ?? "قضية محفوظة" },
          { key: "fee", label: "الأتعاب", node: v.kind === "open" ? FEE_KIND.open : moneyField },
        ];
        let col = 0;
        const placed = cells.map((c, i) => {
          if (c.wide) { col = 0; return { ...c, span2: true }; }
          const alone = col === 0 && (i === cells.length - 1 || cells[i + 1].wide);
          col = alone ? 0 : col ^ 1;
          return { ...c, span2: alone };
        });
        return (
          <div key={o.op_id} className="not-first:border-t not-first:border-border-2">
            <dl className="grid grid-cols-2 gap-px bg-border-2">
              {placed.map((c) => (
                <div key={c.key} className={cx("min-w-0 bg-card px-4 py-3 sm:px-5.5", c.span2 && "col-span-2")}>
                  <dt className={lab}>{c.label}</dt>
                  <dd className={val}>{c.node}</dd>
                </div>
              ))}
            </dl>
            {hint?.note && caseId === String(o.args.case ?? "") ? <p className="border-t border-border-2 px-4 py-3 text-sm leading-[1.6] text-text-3 sm:px-5.5">{hint.note}</p> : null}
            {after !== null ? (
              <p className="border-t border-border-2 px-4 py-3 text-sm leading-[1.6] font-semibold text-text-2 sm:px-5.5">
                {after > 0 ? <>بعد كده الباقي على {picked!.name} هيبقى <bdi className="font-num">{formatEgp(after)}</bdi>.</>
                  : after === 0 ? <>بعد كده {picked!.name} هتبقى مسدّدة بالكامل.</>
                  : <>المبلغ أكبر من الباقي على {picked!.name} بـ <bdi className="font-num">{formatEgp(-after)}</bdi>.</>}
              </p>
            ) : null}
            {!o.quote_verified ? <p className="border-t border-border-2 px-4 py-2.5 text-sm font-medium text-gold sm:px-5.5">ما لقيتش كلامك ده في المحادثة، راجع المبلغ</p> : null}
            {o.status === "failed" && o.error ? <p className="mx-4 my-3 rounded-md bg-bad-bg px-3 py-2 text-sm text-bad sm:mx-5.5">{o.error}</p> : null}
          </div>
        );
      })}

      {error ? <p className="mx-4 mt-3 rounded-md bg-bad-bg px-3 py-2 text-base text-bad sm:mx-5.5">{error}</p> : null}
      <div className="px-4 pb-4 pt-3.5 sm:px-5.5">
        <div className="flex gap-2">
          <button type="button" disabled={pending || live.some((o) => parseAmount(String(merged(o).amount ?? "")) === null)} onClick={() => onDecide("confirm", live.map((o) => o.op_id))}
            className="bg-primary-fill h-11 min-w-0 flex-1 truncate rounded-full px-5 text-base font-bold transition disabled:opacity-50">{pending ? "بحفظ…" : "أكّد"}</button>
          <button type="button" disabled={pending} onClick={() => setEditing((e) => !e)}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border-2 px-4.5 text-base font-medium glass-icon transition hover:text-text disabled:opacity-50">{editing ? "خلّصت" : "عدّل"}</button>
        </div>
        {editing ? (
          <div className="mt-1 flex justify-center">
            <button type="button" disabled={pending} onClick={() => onDecide("reject", live.map((o) => o.op_id))} className="inline-flex min-h-11 items-center rounded-full px-3 text-sm text-text-3 transition hover:text-bad disabled:opacity-50">ارفض</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
