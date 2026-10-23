/** «24 قضية مفتوحة | 5 جلسات الأسبوع ده» (docs/design/split/Split*Home): two light numbers in one solid card. */
import Link from "next/link";

const NUM = "stat-num block text-xl text-title";
const LABEL = "mt-1 block whitespace-nowrap text-sm leading-[normal] text-text-3";

/** the label agrees with its number: «جلسة» for 1, «جلستين» for 2, «جلسات» for 3–10, «جلسة» for 11+ (then «الأسبوع ده») */
const weekLabel = (n: number) => `${n === 2 ? "جلستين" : n >= 3 && n <= 10 ? "جلسات" : "جلسة"} الأسبوع ده`;

export function StatsCard({ openCases, weekHearings, className = "" }: { openCases: number; weekHearings: number; className?: string }) {
  return (
    <div className={`flex gap-5 rounded-xl border border-border-2 bg-card px-5 py-5 shadow-card 3xl:px-6 ${className}`}>
      <Link href="/cases" className="block shrink-0 3xl:flex-1">
        <span className={NUM}>{openCases}</span>
        <span className={LABEL}>قضية مفتوحة</span>
      </Link>
      <Link href="/hearings" className="block flex-1 border-s border-border-2 ps-4 3xl:ps-5">
        <span className={NUM}>{weekHearings}</span>
        <span className={LABEL}>{weekLabel(weekHearings)}</span>
      </Link>
    </div>
  );
}
