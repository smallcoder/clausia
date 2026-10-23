/**
 * The clients list (docs/design/ia/IAClient*): one solid table like the cases list. Desktop (md+): name, phone, number of cases, next hearing
 * (the whole row is the link). Phone: the name with the phone under it, the next hearing and the case count at the end.
 * A value that is not recorded is a dash, never a guess. Line heights follow CaseListRow so the two lists read the same.
 */
import Link from "next/link";
import { dateLabel } from "@/components/caselist/CaseListRow";
import { DateText } from "@/components/ui";
import type { ClientRow } from "@/lib/clients";

/** md+ column template, shared by the header and every row: name, phone, cases, next hearing */
const COLS = "md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,220px)_120px_150px] md:gap-6";

/** «قضية», «قضيتين», «3 قضايا», «12 قضية» */
const casesWord = (n: number) => (n === 1 ? "قضية" : n === 2 ? "قضيتين" : `${n} ${n <= 10 ? "قضايا" : "قضية"}`);

export function ClientsHeader() {
  return (
    <div className={`hidden px-7.5 pb-3 pt-4 text-sm leading-4 font-medium text-text-4 ${COLS}`}>
      <span>الموكل</span><span>التليفون</span><span>القضايا</span><span>الجلسة الجاية</span>
    </div>
  );
}

export function ClientListRow({ c, today }: { c: ClientRow; today: string }) {
  const next = c.next_hearing ? dateLabel(c.next_hearing, today) : null;
  const nextCls = next?.today ? "font-bold text-text" : "font-medium text-text-3";
  const nextText = next ? <DateText value={next.text} /> : <span aria-label="لا جلسة جاية">—</span>;
  const phone = c.phone?.trim() || null;
  return (
    <li className="border-t border-border-2 first:border-t-0 md:first:border-t">
      <Link href={`/clients/${c.id}`} className={`flex min-h-11 items-center gap-3 py-3.25 transition-colors md:px-7.5 md:py-3.75 md:hover:bg-card-2 ${COLS}`}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold leading-[19px] text-text md:text-md md:leading-[21px]">{c.name}</span>
          {/* phone: the phone number under the name */}
          {phone ? <span className="font-num mt-0.75 block truncate text-end text-xs leading-4 text-text-4 md:hidden" dir="ltr">{phone}</span> : null}
        </span>

        <span className="hidden truncate text-base leading-[18px] text-text-3 md:block">{phone ? <span className="font-num" dir="ltr">{phone}</span> : <span className="text-text-4">مش متسجل</span>}</span>
        <span className="hidden text-base leading-[18px] text-text-3 md:block">{c.cases ? casesWord(c.cases) : <span className="text-text-4">—</span>}</span>
        <span className={`hidden text-base leading-[18px] md:block ${nextCls}`}>{nextText}</span>

        {/* phone: the next hearing, the case count under it */}
        <span className="flex shrink-0 flex-col items-end text-left md:hidden">
          <span className={`text-sm leading-4 ${nextCls}`}>{nextText}</span>
          <span className="mt-0.75 text-xs leading-4 text-text-4">{c.cases ? casesWord(c.cases) : "بلا قضايا"}</span>
        </span>
      </Link>
    </li>
  );
}
