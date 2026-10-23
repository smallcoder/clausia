import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatDmy } from "@/lib/dates";
import { MONEY_METHOD } from "@/lib/labels";
import { formatAmount } from "@/lib/money";
import type { Database } from "@/lib/db/types";
import { PrintButton } from "./PrintButton";

export interface Receipt {
  office: string;
  client: string;
  /** whole piasters */
  amount: number;
  /** ISO date */
  date: string;
  method: Database["public"]["Enums"]["money_method"];
  /** «إخلاء لعدم سداد الأجرة · 772 لسنة 2025», or «دفعة على الحساب» for the general account */
  about: string;
  note: string | null;
  backHref: string;
}

/**
 * «إيصال استلام»: the paper. The toolbar (back, print) is hidden in print; the paper is drawn as ink on white in either theme (globals.css `.receipt-paper`).
 * The office's own style (letterhead, logo, serial number) comes with PR 6: this is the plain layout.
 */
export function ReceiptSheet({ r }: { r: Receipt }) {
  const rows: [string, React.ReactNode][] = [
    ["استلمنا من", r.client],
    ["مبلغ وقدره", <span key="a"><bdi className="font-num text-xl font-bold">{formatAmount(r.amount)}</bdi> جنيهًا مصريًا</span>],
    ["طريقة الدفع", MONEY_METHOD[r.method]],
    ["وذلك عن", <bdi key="c">{r.about}</bdi>],
    ...(r.note ? [["ملاحظة", r.note] as [string, React.ReactNode]] : []),
  ];
  return (
    <main className="min-h-dvh px-4 py-6 print:min-h-0 print:p-0">
      <div className="mx-auto mb-4 flex max-w-xl items-center justify-between gap-3 print:hidden">
        <Link href={r.backHref} className="tap inline-flex min-h-11 items-center gap-1 text-base font-semibold text-text-2 hover:text-text">
          <ChevronRight aria-hidden size={18} strokeWidth={2} />رجوع للحسابات
        </Link>
        <PrintButton />
      </div>
      <article className="receipt-paper mx-auto max-w-xl rounded-lg border border-border bg-card px-6 py-8 shadow-card print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none sm:px-10">
        <header className="flex items-start justify-between gap-4 border-b border-border-strong pb-5">
          <div>
            <p className="text-md font-semibold text-text-3">{r.office}</p>
            <h1 className="mt-1 text-xl font-bold leading-tight text-title">إيصال استلام</h1>
          </div>
          <p className="text-base text-text-3">التاريخ: <bdi className="font-num font-semibold text-text">{formatDmy(r.date)}</bdi></p>
        </header>
        <dl className="mt-6 space-y-5">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-4 border-b border-border-2 pb-3.5">
              <dt className="text-base text-text-3">{k}</dt>
              <dd className="min-w-0 break-words text-md font-semibold text-text">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-14 grid grid-cols-2 gap-10 text-center text-base text-text-3">
          <div><div className="h-10 border-b border-border-strong" /><p className="mt-2">المستلم</p></div>
          <div><div className="h-10 border-b border-border-strong" /><p className="mt-2">التوقيع</p></div>
        </div>
      </article>
    </main>
  );
}
