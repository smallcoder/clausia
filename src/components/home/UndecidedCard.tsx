/**
 * «محتاجة قرار» (docs/design/*Home.dc.html): a solid card with a huge light number — the real count of hearings before today
 * with no decision. Gold only when the count is above 0; at 0 the number is plain and the card says so calmly.
 * Desktop: a column beside today's roll. Mobile: one horizontal card above it.
 */
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { two } from "@/components/shell/PageHero";

const HREF = "/hearings?filter=undecided";
const CARD = "rounded-xl border border-border-2 bg-card shadow-card transition hover:shadow-pop";
const NUM = "font-num font-extralight leading-none tracking-[-0.05em]";

/** «جلسة فاتت من غير قرار» / «جلستين فاتوا…» / «N جلسات فاتت…» */
function sub(n: number) {
  if (n === 1) return "جلسة فاتت من غير قرار";
  if (n === 2) return "جلستين فاتوا من غير قرار";
  return n > 10 ? "جلسة فاتت من غير قرار" : "جلسات فاتت من غير قرار";
}

function Label({ on }: { on: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 text-sm font-semibold leading-[17px] md:gap-2 ${on ? "text-gold" : "text-text-3"}`}>
      {on ? <span aria-hidden className="size-1.5 rounded-full bg-gold" /> : null}محتاجة قرار
    </span>
  );
}

function Pill() {
  return (
    <span className="bg-primary-fill inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3.5 text-sm font-semibold md:h-control md:gap-1.5 md:px-4 md:text-base">
      سجّلها <ChevronLeft strokeWidth={2.2} aria-hidden className="size-3.25 md:size-3.5" />
    </span>
  );
}

export function UndecidedCard({ count, className = "" }: { count: number; className?: string }) {
  const on = count > 0;
  const line = on ? sub(count) : "كل الجلسات اللي فاتت قراراتها متسجلة";
  const label = on ? `${count} ${sub(count)} — سجّلها` : "مفيش جلسات محتاجة قرار";
  return (
    <Link href={HREF} aria-label={label} className={`${CARD} ${className}`}>
      {/* mobile: number · label + line · pill */}
      <span className="flex items-center gap-3.5 px-4.5 py-4 md:hidden">
        <span className={`${NUM} text-display ${on ? "text-gold" : "text-title"}`}>{two(count)}</span>
        <span className="min-w-0 flex-1">
          <Label on={on} />
          <span className="mt-0.75 block text-sm leading-4 text-text-3">{line}</span>
        </span>
        {on ? <Pill /> : null}
      </span>
      {/* desktop: label · huge number · line + pill */}
      <span className="hidden h-full flex-col p-6.5 md:flex">
        <Label on={on} />
        <span className={`${NUM} flex flex-1 items-center text-display-xl ${on ? "text-gold" : "text-title"}`}>{two(count)}</span>
        <span className="flex min-h-control items-center justify-between gap-3">
          <span className="text-sm leading-[17px] text-text-3">{line}</span>
          {on ? <Pill /> : null}
        </span>
      </span>
    </Link>
  );
}
