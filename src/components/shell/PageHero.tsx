/**
 * v2 page header (docs/design/DESIGN.md): no hero card. Eyebrow, a large title on the page, and large light
 * stat numbers. A stat that needs action is gold only when its count is above 0. Values come from real queries.
 * (Kept the v1 name `PageHero` so call sites stay stable; `icon` is accepted and ignored in v2.)
 */
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export interface HeroStat {
  value: number | string;
  label: string;
  /** the item that needs action: gold when its count > 0 */
  highlight?: boolean;
  href?: string;
}

/** 3 → «03», like the mockups */
export const two = (n: number) => (n >= 0 && n < 10 ? `0${n}` : String(n));

const isZero = (v: number | string) => v === 0 || v === "0" || v === "00";

export function StatTile({ s }: { s: HeroStat }) {
  const gold = s.highlight && !isZero(s.value);
  const body = (
    <>
      <div className={`stat-num text-[40px] sm:text-[44px] ${gold ? "text-gold" : "text-title"}`}>{typeof s.value === "number" ? two(s.value) : s.value}</div>
      <div className={`mt-2 flex items-center gap-1.5 text-[12px] ${gold ? "font-semibold text-gold" : "text-text-3"}`}>
        {gold ? <span aria-hidden className="size-1.5 rounded-full bg-gold" /> : null}{s.label}
      </div>
    </>
  );
  const cls = "block min-w-[88px] px-5 first:ps-0 sm:px-7";
  return s.href ? <Link href={s.href} className={`${cls} transition hover:opacity-80`}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function StatRow({ stats, className = "" }: { stats: HeroStat[]; className?: string }) {
  return (
    <div className={`flex items-end divide-x divide-x-reverse divide-[var(--hairline-v2)] ${className}`}>
      {stats.map((s) => <StatTile key={s.label} s={s} />)}
    </div>
  );
}

export function BackBtn({ href }: { href: string }) {
  return (
    <Link href={href} aria-label="رجوع" className="glass glass-icon inline-flex size-11 shrink-0 items-center justify-center rounded-full">
      <ChevronRight size={20} strokeWidth={2} aria-hidden />
    </Link>
  );
}

export function PageHero({ back, action, eyebrow, title, subtitle, stats, className = "" }: {
  back?: string;
  /** small round control next to the title (e.g. a filter); v2 shows it on all widths */
  action?: ReactNode;
  icon?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  stats?: HeroStat[];
  className?: string;
}) {
  return (
    <header className={`flex flex-wrap items-end justify-between gap-x-10 gap-y-6 pt-4 sm:pt-8 ${className}`}>
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        {back ? <BackBtn href={back} /> : null}
        <div className="min-w-0">
          {eyebrow ? <div className="text-[12px] font-semibold text-text-3 sm:text-[13px]">{eyebrow}</div> : null}
          <h1 className="mt-1 text-[32px] font-bold leading-[1.15] text-title sm:text-[46px]">{title}</h1>
          {subtitle ? <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-text-3 sm:text-[15px]">{subtitle}</div> : null}
        </div>
      </div>
      {action || stats?.length ? (
        <div className="flex items-end gap-5">
          {stats?.length ? <StatRow stats={stats} /> : null}
          {action}
        </div>
      ) : null}
    </header>
  );
}

/** v2 status: a small dot + a word. needs decision = gold · today = gold outline · active = green · reserved/done = muted · against us = red */
export function StatusChip({ tone, children }: { tone: "good" | "warn" | "neutral" | "bad" | "accent"; children: ReactNode }) {
  if (tone === "accent")
    return <span className="inline-flex h-[22px] items-center rounded-full border border-[var(--accent-edge)] px-2.5 text-[11.5px] font-bold text-gold">{children}</span>;
  const c = { good: ["bg-good", "text-good"], warn: ["bg-gold", "text-gold"], neutral: ["bg-text-4", "text-text-3"], bad: ["bg-bad", "text-bad"] }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${c[1]}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${c[0]}`} />{children}
    </span>
  );
}

/** The Clausia speaker line: «C» mark + text (a templated sentence from real data, not an LLM call). */
export function ClausiaSays({ children, label, size = "lg" }: { children: ReactNode; label?: string; size?: "lg" | "md" }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`mark font-num inline-flex shrink-0 items-center justify-center font-black shadow-mark ${size === "lg" ? "size-[30px] rounded-[9px] text-[14px]" : "size-[26px] rounded-[8px] text-[12px]"}`}>C</span>
      <div className="min-w-0 flex-1 pt-0.5">
        {label ? <div className="text-[12px] font-bold text-gold">{label}</div> : null}
        <div className={`leading-[1.85] text-text-3 ${size === "lg" ? "text-[15.5px] sm:text-[18px]" : "text-[15px]"}`}>{children}</div>
      </div>
    </div>
  );
}

/** Solid content card (28px radius, hairline, deep soft shadow). */
export function Panel({ title, meta, children, className = "" }: { title?: ReactNode; meta?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[28px] border border-border-2 bg-card shadow-card ${className}`}>
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline-v2)] px-6 py-4">
          <h2 className="text-[17px] font-bold text-title">{title}</h2>
          {meta ? <div className="text-xs text-text-4">{meta}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
