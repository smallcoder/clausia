/**
 * Inner-page hero header (Roll, Case, Chat, Cases) — docs/design/DESIGN.md:
 * back button, icon tile, eyebrow, big title, subtitle line, 3 stat tiles (the action tile highlighted).
 * Dark: solid ink section with an accent edge. Light: white card, gray tiles, highlighted tile in ink with accent text.
 * Stat values must come from real queries.
 */
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export interface HeroStat {
  value: number | string;
  label: string;
  /** the item that needs action (one per hero) */
  highlight?: boolean;
  href?: string;
}

/** 3 → «03», like the mockups */
export const two = (n: number) => (n >= 0 && n < 10 ? `0${n}` : String(n));

function BackBtn({ href }: { href: string }) {
  return (
    <Link href={href} aria-label="رجوع" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card-2 text-text">
      <ChevronRight size={20} strokeWidth={2.2} aria-hidden />
    </Link>
  );
}

export function StatTile({ s }: { s: HeroStat }) {
  const body = (
    <>
      <div className="font-num text-[28px] font-extrabold leading-none">{typeof s.value === "number" ? two(s.value) : s.value}</div>
      <div className={`mt-1 text-[11px] ${s.highlight ? "font-semibold" : "text-text-3"}`}>{s.label}</div>
    </>
  );
  const cls = s.highlight
    ? "bg-tile-hi shadow-[var(--tile-hi-shadow)]"
    : "border border-[var(--tile-border)] bg-[var(--tile)] text-text";
  return s.href ? (
    <Link href={s.href} className={`block rounded-2xl px-3.5 py-3 transition hover:brightness-105 ${cls}`}>{body}</Link>
  ) : (
    <div className={`rounded-2xl px-3.5 py-3 ${cls}`}>{body}</div>
  );
}

export function PageHero({ back, action, icon, eyebrow, title, subtitle, stats, className = "" }: {
  back?: string;
  /** small button at the far end (e.g. the mobile «…» or filter); on mobile it shares the top row with back */
  action?: ReactNode;
  icon: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  stats?: HeroStat[];
  className?: string;
}) {
  return (
    <section className={`flex flex-wrap items-center gap-4 rounded-[24px] border border-[var(--hero-border)] bg-hero px-4 py-4 shadow-[var(--hero-shadow)] sm:gap-6 sm:rounded-[28px] sm:px-6 sm:py-[22px] ${className}`}>
      {back || action ? (
        <div className="flex w-full items-center justify-between sm:hidden">
          {back ? <BackBtn href={back} /> : <span />}
          {action}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-[1_1_380px] items-center gap-3 sm:gap-4">
        {back ? (<span className="hidden sm:contents"><BackBtn href={back} /></span>) : null}
        <div className="mark inline-flex size-12 shrink-0 items-center justify-center rounded-[16px] shadow-tile sm:size-[60px] sm:rounded-[19px]">
          {icon}
        </div>
        <div className="min-w-0">
          {eyebrow ? <div className="truncate text-xs font-bold text-gold-text">{eyebrow}</div> : null}
          <h1 className="mt-0.5 text-[22px] font-extrabold leading-tight text-text sm:text-[26px]">{title}</h1>
          {subtitle ? <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-text-3">{subtitle}</div> : null}
        </div>
      </div>
      {stats?.length ? (
        <div className="grid w-full flex-[0_1_470px] grid-cols-3 gap-2.5">
          {stats.map((s) => <StatTile key={s.label} s={s} />)}
        </div>
      ) : null}
    </section>
  );
}

/** Status chip used in heroes and rows: good (active / upcoming), warn (needs a decision), neutral (done). */
export function StatusChip({ tone, children }: { tone: "good" | "warn" | "neutral" | "bad" | "accent"; children: ReactNode }) {
  const cls = { good: "bg-good-bg text-good", warn: "bg-[var(--amber-bg)] text-[var(--amber-text)]", neutral: "bg-card-2 text-text-3", bad: "bg-bad-bg text-bad", accent: "bg-[var(--accent-wash)] text-gold-text" }[tone];
  return <span className={`inline-flex h-[22px] items-center rounded-full px-2.5 text-[11px] font-bold ${cls}`}>{children}</span>;
}

/** The Clausia speaker line: «C» avatar + text (a templated sentence from real data, not an LLM call). */
export function ClausiaSays({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mark font-num inline-flex size-[34px] shrink-0 items-center justify-center rounded-full text-[14px] font-black shadow-mark">C</span>
      <div className="min-w-0 flex-1 pt-0.5">
        {label ? <div className="text-xs font-bold text-gold-text">{label}</div> : null}
        <div className="text-[16px] leading-[1.8] text-text-2">{children}</div>
      </div>
    </div>
  );
}

/** Card surface used for sections (22px radius, 1px border, soft deep shadow). */
export function Panel({ title, meta, children, className = "" }: { title?: ReactNode; meta?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[22px] border border-border-2 bg-card shadow-card ${className}`}>
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-border-2 px-5 py-4">
          <h2 className="text-[17px] font-bold text-text">{title}</h2>
          {meta ? <div className="text-xs text-text-4">{meta}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
