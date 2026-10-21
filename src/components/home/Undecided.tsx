/** «محتاجة قرار»: the highlighted tile next to the roll (desktop) / the wide gold row under it (mobile). */
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { two } from "@/components/shell/PageHero";

const HREF = "/hearings?filter=undecided";
const GOLD = "border border-gold-text/25 bg-accent-grad dark:border-border text-ink-solid shadow-accent transition hover:brightness-105";
const QUIET = "border border-border-2 bg-card text-text shadow-card";

export function UndecidedTile({ count, className = "" }: { count: number; className?: string }) {
  return (
    <Link href={HREF} className={`min-w-0 flex-col justify-between gap-3 rounded-[20px] p-4 ${count ? GOLD : QUIET} ${className}`}>
      <span className="text-[13px] font-bold">محتاجة قرار</span>
      <span className="font-num text-[34px] font-extrabold leading-none tracking-[-0.04em]">{two(count)}</span>
      <span className={`text-[12.5px] font-semibold ${count ? "" : "text-text-3"}`}>{count ? "سجّلها دلوقتي ←" : "كل القرارات متسجلة"}</span>
    </Link>
  );
}

export function UndecidedRow({ count, className = "" }: { count: number; className?: string }) {
  const label = count === 1 ? "جلسة محتاجة قرار" : count > 10 ? "جلسة محتاجة قرار" : "جلسات محتاجة قرار";
  return (
    <Link href={HREF} className={`items-center gap-2.5 rounded-2xl px-3 py-2.5 ${count ? GOLD : QUIET} ${className}`}>
      <span className="font-num text-[22px] font-extrabold leading-none tracking-[-0.03em]">{two(count)}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{count ? `${label} · سجّلها دلوقتي` : "مفيش جلسات محتاجة قرار"}</span>
      <ChevronLeft size={16} strokeWidth={2.2} aria-hidden className="shrink-0" />
    </Link>
  );
}
