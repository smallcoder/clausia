/**
 * Cases list header, exactly as docs/design/*Cases.dc.html draws it (the shared PageHero differs in spacing):
 * desktop: eyebrow + title at the start, the three stats at the end, bottoms aligned; every stat has a hairline
 * on its start side and 26px side padding. Mobile: eyebrow + title, then the stats as a row of equal thirds
 * (hairline before the 2nd and 3rd only). Line heights are the px the mockup's `normal` renders (body is 1.6).
 */
import Link from "next/link";
import { two, type HeroStat } from "@/components/shell/PageHero";

const isZero = (v: number | string) => v === 0 || v === "0" || v === "00";

function Stat({ s }: { s: HeroStat }) {
  const gold = s.highlight && !isZero(s.value);
  const cls = "block min-w-0 flex-1 px-3.5 border-border-2 not-first:border-s sm:flex-none sm:border-s sm:px-6.5 transition hover:opacity-80";
  const body = (
    <>
      <div className={`stat-num text-xl sm:text-2xl ${gold ? "text-gold" : "text-title"}`}>{typeof s.value === "number" ? two(s.value) : s.value}</div>
      <div className={`mt-1.5 flex items-center gap-1.25 text-xs leading-[15px] sm:mt-2 sm:gap-1.5 sm:text-sm sm:leading-[17px] ${gold ? "text-gold" : "text-text-3"}`}>
        {gold ? <span aria-hidden className="size-[5px] rounded-full bg-gold sm:size-1.5" /> : null}{s.label}
      </div>
    </>
  );
  return s.href ? <Link href={s.href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function CasesHero({ eyebrow, title, stats }: { eyebrow: string; title: string; stats: HeroStat[] }) {
  return (
    <header className="pt-3 sm:flex sm:items-end sm:justify-between sm:gap-6 sm:px-2 sm:pt-9">
      <div className="px-1 sm:px-0">
        <div className="text-sm font-semibold leading-4 tracking-[0.02em] text-text-3 sm:leading-[17px]">{eyebrow}</div>
        <h1 className="mt-1 text-xl font-bold leading-[1.1] text-title sm:mt-1.5 sm:text-2xl sm:tracking-[-0.01em]">{title}</h1>
      </div>
      <div className="-mx-2.5 mt-5 flex sm:mx-0 sm:mb-1 sm:mt-0">
        {stats.map((s) => <Stat key={s.label} s={s} />)}
      </div>
    </header>
  );
}
