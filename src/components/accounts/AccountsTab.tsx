/**
 * «الحسابات» (docs/design/ia/SBAcct*): a client's money. Four numbers (paid so far, remaining, expenses, last payment), the fees case by case
 * (agreed · paid · remaining), and the movements newest first. Everything shown is worked out by code in integer piasters (src/lib/accounts-calc.ts);
 * a fee that is «مفتوحة» or not set has no balance (a dash, never zero). A row saved only as a suggestion is shown tagged and is left out of every total.
 */
import { Printer } from "lucide-react";
import Link from "next/link";
import { dateLabel } from "@/components/caselist/CaseListRow";
import { DateText, cx } from "@/components/ui";
import type { AccountCase, AccountMove, ClientAccounts } from "@/lib/accounts";
import { MONEY_METHOD } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import { FeeDialog } from "./FeeDialog";

const CELL = "min-w-0 px-5 py-4 @3xl:px-6";
const LABEL = "block text-sm leading-4 text-text-3";
const NUM = "stat-num block text-xl text-title";
const SUB = "mt-1.5 block truncate text-sm leading-4 text-text-3";

const casesWord = (n: number) => (n === 1 ? "قضية واحدة" : n === 2 ? "قضيتين" : `${n} ${n <= 10 ? "قضايا" : "قضية"}`);

/** the money in a table cell: «15,000 ج.م», the number kept in its own isolate so the sentence around it does not flip it */
const Egp = ({ p, className }: { p: number; className?: string }) => (
  <span className={className}><bdi className="font-num">{formatAmount(p)}</bdi> ج.م</span>
);

function Summary({ data, today }: { data: ClientAccounts; today: string }) {
  const s = data.summary;
  const byId = new Map(data.cases.map((c) => [c.id, c]));
  const paidSub = s.paid === 0 ? "لسه مفيش دفعات"
    : s.paidCases ? `من ${casesWord(s.paidCases)}${s.paidGeneral ? " والحساب العام" : ""}` : "على الحساب العام";
  const remainingSub = s.remaining === null ? "مفيش أتعاب ثابتة متحددة"
    : s.owingCases.length === 0 ? "اتدفع كله"
    : s.owingCases.length === 1 ? `قضية ${byId.get(s.owingCases[0])?.subject ?? ""}` : casesWord(s.owingCases.length);
  const last = s.last ? dateLabel(s.last.moved_on, today) : null;
  return (
    <section aria-label="ملخص الحساب" className="@container overflow-hidden rounded-xl border border-border-2 bg-card shadow-card">
      <div className="grid grid-cols-2 gap-px bg-border-2 @3xl:grid-cols-4">
        <div className={cx(CELL, "bg-card")}>
          <span className={LABEL}>اتدفع لحد دلوقتي</span>
          <span className={cx(NUM, "mt-2.5")}>{formatAmount(s.paid)}</span>
          <span className={SUB}>{paidSub}</span>
        </div>
        <div className={cx(CELL, "bg-card")}>
          <span className={LABEL}>الباقي</span>
          {s.remaining === null ? <span className={cx(NUM, "mt-2.5 text-text-4")} aria-label="لا يوجد">—</span>
            : <span className={cx(NUM, "mt-2.5", s.remaining > 0 && "text-gold")}>{formatAmount(s.remaining)}</span>}
          <span className={SUB}>{remainingSub}</span>
        </div>
        <div className={cx(CELL, "bg-card")}>
          <span className={LABEL}>مصروفات</span>
          <span className={cx(NUM, "mt-2.5")}>{formatAmount(s.expenses)}</span>
          <span className={SUB}>{s.officeExpenses ? <>على الموكل · <bdi className="font-num">{formatAmount(s.officeExpenses)}</bdi> على المكتب</> : "على الموكل"}</span>
        </div>
        <div className={cx(CELL, "bg-card")}>
          <span className={LABEL}>آخر دفعة</span>
          {last && s.last ? <span className={cx(NUM, "mt-2.5")}><DateText value={last.text} /></span> : <span className={cx(NUM, "mt-2.5 text-text-4")} aria-label="لا يوجد">—</span>}
          <span className={SUB}>{s.last ? <><bdi className="font-num">{formatAmount(s.last.amount)}</bdi> · {MONEY_METHOD[s.last.method as keyof typeof MONEY_METHOD]}</> : "لسه مفيش دفعات"}</span>
        </div>
      </div>
    </section>
  );
}

/** md+ columns of the fees table: case, agreed, paid, remaining */
const FEE_COLS = "md:grid md:grid-cols-[minmax(0,1fr)_10rem_8rem_8rem] md:items-center md:gap-6";

function Fees({ clientId, cases }: { clientId: string; cases: AccountCase[] }) {
  if (!cases.length) {
    return (
      <section aria-label="الأتعاب حسب القضية" className="rounded-xl border border-border-2 bg-card px-6 py-8 text-center shadow-card">
        <h2 className="text-lg font-bold text-title">الأتعاب حسب القضية</h2>
        <p className="mx-auto mt-1.5 max-w-md text-base leading-7 text-text-3">لسه مفيش قضايا للموكل ده، فمفيش أتعاب تتحدد. الحركات بتتسجل على حسابه العام.</p>
      </section>
    );
  }
  return (
    <section aria-label="الأتعاب حسب القضية" className="overflow-hidden rounded-xl border border-border-2 bg-card shadow-card">
      <div className={cx("hidden border-b border-border-2 px-6 py-3.5 text-sm leading-4 font-medium text-text-4", FEE_COLS)}>
        <h2 className="text-sm font-medium">الأتعاب حسب القضية</h2><span>المتفق عليه</span><span>اتدفع</span><span>الباقي</span>
      </div>
      <h2 className="border-b border-border-2 px-5 py-3.5 text-md font-bold text-title md:hidden">الأتعاب حسب القضية</h2>
      <ul>
        {cases.map((c) => {
          const m = c.money;
          const label = [c.subject, c.number].filter(Boolean).join(" · ");
          return (
            <li key={c.id} className={cx("border-t border-border-2 px-5 py-4 first:border-t-0 md:px-6 md:py-3.5", FEE_COLS)}>
              <Link href={`/cases/${c.id}`} className="tap block min-w-0 text-md font-semibold leading-[1.4] text-text hover:underline md:text-md">
                <span className="block truncate"><bdi>{label}</bdi></span>
              </Link>
              <dl className="mt-3 grid grid-cols-3 gap-3 md:contents">
                <div className="min-w-0">
                  <dt className="mb-1 text-xs text-text-4 md:hidden">المتفق عليه</dt>
                  <dd className="text-base text-text">
                    {m.fee?.kind === "fixed" && m.fee.amount !== null ? <Egp p={m.fee.amount} />
                      : m.fee?.kind === "open" ? <span className="text-text-3">مفتوحة · من غير مبلغ</span>
                      : <span className="text-text-4">لسه متحددتش</span>}
                    <span className="block"><FeeDialog clientId={clientId} caseId={c.id} caseLabel={label} kind={m.fee?.kind ?? null} amount={m.fee?.amount ?? null} /></span>
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="mb-1 text-xs text-text-4 md:hidden">اتدفع</dt>
                  <dd className="text-base text-text">{m.paid ? <Egp p={m.paid} /> : <span className="text-text-4" aria-label="لا شيء">—</span>}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="mb-1 text-xs text-text-4 md:hidden">الباقي</dt>
                  <dd className="text-base">
                    {m.remaining === null ? <span className="text-text-4" aria-label="لا يوجد باقي">—</span>
                      : <Egp p={m.remaining} className={cx(m.remaining > 0 ? "font-semibold text-gold" : "text-text-3")} />}
                    {m.over ? <span className="block text-sm text-text-3">زيادة <bdi className="font-num">{formatAmount(m.over)}</bdi></span> : null}
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** md+: date, kind, what, amount; a phone: what and the amount on the first line, the date and the kind under them */
const MOVE_COLS = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 md:grid-cols-[6.5rem_4.5rem_minmax(0,1fr)_9rem] md:gap-x-4";

function Move({ m, today }: { m: AccountMove; today: string }) {
  const receipt = m.kind === "receipt";
  const d = dateLabel(m.moved_on, today);
  const method = MONEY_METHOD[m.method as keyof typeof MONEY_METHOD];
  const where = m.case_id ? [m.case_subject, m.case_short].filter(Boolean).join(" · ") : "الحساب العام";
  const tags = [m.review_status === "suggested" ? "مقترح، مش محسوب" : null, !receipt && m.charged_to === "office" ? "على المكتب" : null].filter(Boolean);
  const sign = receipt ? "+" : "−";
  const muted = m.review_status === "suggested" || (!receipt && m.charged_to === "office");
  return (
    <li className={cx("border-t border-border-2 px-5 py-3.5 first:border-t-0 md:px-6", MOVE_COLS)}>
      <span className="order-2 col-span-2 flex items-center gap-2.5 md:contents">
        <span className="text-base text-text-2"><DateText value={d.text} className={d.today ? "font-bold text-text" : undefined} /></span>
        <span className={cx("inline-flex h-6 w-fit items-center rounded-full border px-2.5 text-xs font-semibold", receipt ? "border-gold-edge text-gold" : "border-border text-text-3")}>{receipt ? "استلام" : "مصروف"}</span>
      </span>
      <span className="order-1 min-w-0 md:order-none">
        <span className="block truncate text-base font-semibold text-text">{[method, m.note].filter(Boolean).join(" · ")}</span>
        <span className="mt-0.5 block truncate text-sm text-text-3"><bdi>{where}</bdi>{tags.length ? ` · ${tags.join(" · ")}` : ""}</span>
      </span>
      <span className="order-1 flex items-center justify-end gap-2.5 md:order-none">
        <span className={cx("text-base font-semibold", muted ? "text-text-3" : "text-text")}>
          <span aria-hidden>{sign}</span> <bdi className="font-num">{formatAmount(m.amount)}</bdi> ج.م
        </span>
        {receipt && m.review_status === "confirmed" ? (
          <Link href={`/receipts/${m.id}`} target="_blank" aria-label="اطبع إيصال الاستلام" title="اطبع إيصال الاستلام"
            className="tap inline-flex size-8 items-center justify-center rounded-full text-text-3 hover:bg-card-2 hover:text-text"><Printer aria-hidden size={16} strokeWidth={1.8} /></Link>
        ) : <span aria-hidden className="size-8" />}
      </span>
    </li>
  );
}

function Movements({ moves, clientName, today }: { moves: AccountMove[]; clientName: string; today: string }) {
  return (
    <section aria-label="الحركات" className="overflow-hidden rounded-xl border border-border-2 bg-card shadow-card">
      <h2 className="border-b border-border-2 px-5 py-3.5 text-md font-bold text-title md:px-6">الحركات</h2>
      {moves.length ? (
        <ul>{moves.map((m) => <Move key={m.id} m={m} today={today} />)}</ul>
      ) : (
        <p className="px-6 py-8 text-center text-base leading-7 text-text-3">
          لسه مفيش حركات. دوس «+ حركة»، أو قول لـ Clausia: «استلمت من {clientName.split(/\s+/)[0]} 3000 فودافون كاش».
        </p>
      )}
    </section>
  );
}

export function AccountsTab({ clientId, clientName, data, today }: { clientId: string; clientName: string; data: ClientAccounts; today: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Summary data={data} today={today} />
      <Fees clientId={clientId} cases={data.cases} />
      <Movements moves={data.moves} clientName={clientName} today={today} />
    </div>
  );
}
