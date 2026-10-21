// The case page header (docs/design/*Case.dc.html), v2: who first — «موكلنا», the client's name big, «ضد <opponent>».
// Desktop (item 19): row 1 = back · breadcrumb «القضايا / <number>» … status chip, then «…» at the far end (owner:
// it holds the moved links — case data, hearings, case chat, JSON); row 2 = eyebrow
// + the name with «ضد <opponent>» on the same line; row 3 = one solid card of 7 cells split by hairlines — number,
// court, circuit, type | facts, docs, needs review (big light numbers, gold only when > 0).
// Mobile: back + «…» floating, eyebrow + status, the name, «ضد» below, then a 2×2 solid spec card, no stats (the tabs
// and the banner carry them). Sizes follow the mockups to the pixel. Text the mockups leave at `line-height: normal`
// gets 1.35 (SF Arabic's normal in the mockup render).
// Sub-views (?tab=…) get a short header: the case's who-line as eyebrow and the view name as title.
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { BackBtn, two, type HeroStat } from "@/components/shell/PageHero";
import type { CaseFile } from "@/lib/case-file";
import { CASE_STATUS } from "@/lib/labels";
import { CaseMenu } from "./CaseMenu";
import { specSheet, statusTone, whoLine } from "./case-view";

const TONE = { good: ["bg-good", "text-good"], warn: ["bg-gold", "text-gold"], neutral: ["bg-text-4", "text-text-3"] } as const;

/** Mockup: 28px outlined pill (content box, so 30px with its hairline), 6px dot, 12.5px semibold word. */
function StatusPill({ status }: { status: string }) {
  const [dot, text] = TONE[statusTone(status)];
  return (
    <span className={`box-content inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--hairline-v2)] px-3 text-sm font-semibold ${text}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />{CASE_STATUS[status as keyof typeof CASE_STATUS] ?? status}
    </span>
  );
}

/** Mobile mockup: 42px round glass buttons. */
const ROUND = "tap glass glass-icon inline-flex size-[42px] shrink-0 items-center justify-center rounded-full";

/** Desktop mockup card, stats part: 0 24px each, a hairline on the start side except the first; 32px light number,
 *  11.5px label 7px below (a 5px gold dot when it needs action). Gold only when the count is above zero. */
function StatCell({ s, first }: { s: HeroStat; first: boolean }) {
  const gold = s.highlight && Number(s.value) > 0;
  const body = (
    <>
      <div className={`stat-num text-xl tracking-normal ${gold ? "text-gold" : "text-title"}`}>{typeof s.value === "number" ? two(s.value) : s.value}</div>
      <div className={`mt-[7px] flex items-center gap-[5px] text-xs leading-4 ${gold ? "text-gold" : "text-text-3"}`}>
        {gold ? <span aria-hidden className="size-[5px] rounded-full bg-gold" /> : null}{s.label}
      </div>
    </>
  );
  const cls = `block min-w-0 px-6 ${first ? "" : "border-s border-[var(--hairline-v2)]"}`;
  if (!s.href) return <div className={cls}>{body}</div>;
  // a same-page hash (e.g. #item-…) must fire hashchange so the item sheet opens: plain <a>
  return s.href.includes("#")
    ? <a href={s.href} className={`${cls} transition hover:opacity-80`}>{body}</a>
    : <Link href={s.href} className={`${cls} transition hover:opacity-80`}>{body}</Link>;
}

export function CaseHeader({ cf, caseId, chatHref, stats }: { cf: CaseFile; caseId: string; chatHref: string; stats: HeroStat[] }) {
  const who = whoLine(cf);
  const spec = specSheet(cf);
  const number = spec[0].value;
  const empty = (fem?: boolean) => (fem ? "مش متسجلة" : "مش متسجل");
  return (
    <header className="leading-[1.35]">
      {/* mobile: back + more at 14px from the top and the sides */}
      <div className="-mx-0.5 flex items-center justify-between pt-3.5 sm:hidden">
        <Link href="/cases" aria-label="رجوع" className={ROUND}><ChevronRight size={20} strokeWidth={2} aria-hidden /></Link>
        <CaseMenu caseId={caseId} chatHref={chatHref} align="end" className="size-[42px]" />
      </div>

      {/* desktop row 1: 40px back · breadcrumb … status chip · «…» (owner decision: «…» next to the chip) */}
      <div className="hidden items-center gap-3 px-2 pt-6 sm:flex">
        <Link href="/cases" aria-label="رجوع" className={`${ROUND} sm:size-10`}><ChevronRight size={20} strokeWidth={2.2} aria-hidden /></Link>
        <nav aria-label="المسار" className="min-w-0 flex-1 truncate text-sm text-text-3">
          <Link href="/cases" className="tap hover:text-text hover:underline">القضايا</Link>
          {number ? <><span aria-hidden className="mx-1.5 text-text-4">/</span><span className="font-semibold text-text">{number}</span></> : null}
        </nav>
        <StatusPill status={cf.case.status} />
        <CaseMenu caseId={caseId} chatHref={chatHref} align="end" className="size-10" />
      </div>

      {/* who: mobile = eyebrow + status, name, «ضد» below; desktop = eyebrow, then name + «ضد» on one line */}
      <div className="px-1 pt-[18px] sm:mt-[22px] sm:px-2 sm:pt-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gold">{who.client ? "موكلنا" : "القضية"}</span>
          <span className="sm:hidden"><StatusPill status={cf.case.status} /></span>
        </div>
        <h1 className="mt-1.5 text-xl font-bold leading-[1.2] text-title sm:mt-1 sm:text-2xl sm:leading-[1.15]">
          {who.client ?? who.fallback}
          {who.opponent ? <span className="max-sm:hidden"><span className="ms-2.5 text-lg font-normal text-text-4">ضد</span> <span className="text-xl font-medium text-text">{who.opponent}</span></span> : null}
        </h1>
        {who.opponent ? <p className="mt-[3px] text-md text-text sm:hidden"><span className="text-text-4">ضد</span> {who.opponent}</p> : null}
      </div>

      {/* below lg: the 2×2 spec card (mobile mockup) */}
      <dl className="mt-4 grid grid-cols-2 overflow-hidden rounded-[22px] border border-border-2 bg-card shadow-card lg:hidden">
        {spec.map((s, i) => (
          <div key={s.label} className={`min-w-0 border-[var(--hairline-v2)] px-3.5 py-3 ${i % 2 === 0 ? "border-e" : ""} ${i >= 2 ? "border-t" : ""}`}>
            <dt className="text-xs text-text-4">{s.short}</dt>
            {/* long court / type names stay one line with «…», the full name in the tooltip (owner decision) */}
            <dd title={s.clip && s.value ? s.value : undefined}
              className={`mt-1 text-base leading-[1.4] ${s.clip ? "truncate" : ""} ${s.value ? "font-semibold text-text" : "text-text-4"}`}>
              {s.value ? s.mobile ?? s.value : empty(s.fem)}
            </dd>
          </div>
        ))}
      </dl>

      {/* lg+: one card, 4 spec cells (1fr) | a 1px hairline | 3 stat cells (0.7fr), 20px top and bottom */}
      <div className="mt-[22px] hidden grid-cols-[repeat(4,minmax(0,1fr))_1px_repeat(3,minmax(0,0.7fr))] items-stretch rounded-[26px] border border-border-2 bg-card py-5 shadow-card lg:grid">
        <dl className="contents">
          {spec.map((s, i) => (
            <div key={s.label} className={`min-w-0 px-6 ${i > 0 ? "border-s border-[var(--hairline-v2)]" : ""}`}>
              <dt className="text-xs leading-4 text-text-4">{s.label}</dt>
              <dd className={`mt-[7px] text-md leading-[1.4] ${s.value ? "font-semibold text-text" : "text-text-4"}`}>
                {s.value ?? empty(s.fem)}{s.value && s.extra ? ` · ${s.extra}` : null}
              </dd>
            </div>
          ))}
        </dl>
        <div aria-hidden className="-my-1 bg-[var(--hairline-v2)]" />
        {stats.map((s, i) => <StatCell key={s.label} s={s} first={i === 0} />)}
      </div>
    </header>
  );
}

/** The sub-views' header: back to the case, the who-line as eyebrow, the view name as title. */
export function CaseSubHeader({ cf, caseId, title }: { cf: CaseFile; caseId: string; title: string }) {
  const who = whoLine(cf);
  return (
    <header className="flex items-start gap-3 pt-2 sm:gap-[18px] sm:px-2 sm:pt-6">
      <span className="sm:mt-[18px]"><BackBtn href={`/cases/${caseId}`} /></span>
      <div className="min-w-0 pt-0.5 sm:pt-0">
        <Link href={`/cases/${caseId}`} className="text-sm font-semibold text-text-3 hover:text-text">
          {who.client ?? who.fallback}{who.client && who.opponent ? <span className="text-text-4"> ضد </span> : null}{who.client && who.opponent ? who.opponent : null}
        </Link>
        <h1 className="mt-1 text-xl font-bold leading-[1.2] text-title sm:text-2xl sm:leading-[1.15]">{title}</h1>
      </div>
    </header>
  );
}
