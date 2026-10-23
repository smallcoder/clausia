/**
 * The title row of a list page on desktop (docs/design/next/Head*Cases.dc.html): one row with the title (34px),
 * the stats inline after it, and the filters / controls at the far end; a hairline under it, then the content.
 * Used by Cases, Roll and a case's sub-views (documents, hearings, details). The big title stays only on Home.
 *
 * Below `sm` nothing here changes the phone headers: each page keeps its own mobile layout, and this file only
 * adds the `sm:` row on top (the row starts 52px under the 88px top bar, so its top sits 140px from the screen's top,
 * as the mockup draws it). A page puts its mobile-only bits in `sm:hidden` and its desktop-only bits in `hidden sm:…`.
 */
import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";
import { cx } from "@/components/ui";
import { two, type HeroStat } from "@/components/shell/PageHero";

/**
 * The row: 20px between the parts, 8px side padding, 18px above the hairline (mockup). `top` is the space above it on
 * desktop: "page" = 52px under the top bar (the first thing on a list page), "sub" = 22px under a breadcrumb row.
 * `as` is "div" when the row sits inside another header.
 */
export function TitleRow({ children, className, top = "page", as: Tag = "header" }: { children: ReactNode; className?: string; top?: "page" | "sub"; as?: "header" | "div" }) {
  return (
    <Tag className={cx("sm:flex sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-3 sm:border-b sm:border-border sm:px-2 sm:pb-4.5", top === "page" ? "sm:pt-13" : "sm:mt-5.5", className)}>
      {children}
    </Tag>
  );
}

/** the page title: 30px on a phone, 34px (`text-page-title`, the one owner-specified step) on desktop, weight 700 */
export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cx("text-xl font-bold leading-[1.1] text-title sm:text-page-title", className)}>{children}</h1>;
}

export type TitleStatData = HeroStat & {
  /** the phone's wording, when it differs from the desktop one */
  mobileLabel?: string;
  /** a client-side handler: the stat is then a plain <a> (it keeps its href for new tabs and no-JS) */
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  /** the stat is the page's current view (aria-current), drawn as selected */
  current?: boolean;
  title?: string;
};

const isZero = (v: number | string) => v === 0 || v === "0" || v === "00";

/**
 * One stat. Desktop (mockup): a baseline row, the number 7px before its label, 16px each side, a hairline on the start
 * side (so also between the title and the first stat). The number is 24px as drawn (`text-page-stat`, the second owner-specified size
 beside the 34px title); the 13px label snaps to 12.5px (`text-sm`). Gold only when it needs action and its count is above 0.
 * Phone: the number over its label, a hairline before the 2nd and 3rd, equal thirds (as Cases drew it before).
 */
function Stat({ s }: { s: TitleStatData }) {
  const gold = s.highlight && !isZero(s.value);
  // `tap`: the stat is a link drawn ~19px tall on desktop; its tap area stays 44px
  const cls = "tap block min-w-0 flex-1 border-border-2 px-3.5 not-first:border-s transition hover:opacity-80 sm:flex sm:flex-none sm:items-baseline sm:gap-1.75 sm:border-s sm:border-border sm:px-4";
  const body = (
    <>
      <div className={`stat-num text-xl sm:text-page-stat sm:font-normal sm:tracking-normal ${gold ? "text-gold" : "text-title"}`}>{typeof s.value === "number" ? two(s.value) : s.value}</div>
      <div className={`mt-1.5 flex items-center gap-1.25 text-xs leading-[15px] sm:mt-0 sm:text-sm sm:leading-[17px] ${gold ? "text-gold-text-small" : "text-text-3"} ${s.current ? "font-semibold text-title underline decoration-2 underline-offset-4" : ""}`}>
        {gold ? <span aria-hidden className="size-dot rounded-full bg-gold sm:size-1.5" /> : null}
        {s.mobileLabel ? <><span className="sm:hidden">{s.mobileLabel}</span><span className="hidden sm:inline">{s.label}</span></> : s.label}
      </div>
    </>
  );
  if (!s.href) return <div className={cls}>{body}</div>;
  // a handler (the roll's week view) or a same-page hash (an item sheet) needs a plain <a>
  if (s.onClick || s.href.includes("#"))
    return <a href={s.href} onClick={s.onClick} aria-current={s.current ? "page" : undefined} title={s.title} className={cls}>{body}</a>;
  return <Link href={s.href} aria-current={s.current ? "page" : undefined} title={s.title} className={cls}>{body}</Link>;
}

/** the stats of a row: on a phone a row of equal thirds under the title (`mobile` = show them there), on desktop inline */
export function TitleStats({ stats, mobile = true }: { stats: TitleStatData[]; mobile?: boolean }) {
  if (!stats.length) return null;
  return (
    <div className={cx("-mx-2.5 mt-5 sm:mx-0 sm:mt-0 sm:flex sm:items-center", mobile ? "flex" : "hidden")}>
      {stats.map((s) => <Stat key={s.label} s={s} />)}
    </div>
  );
}
