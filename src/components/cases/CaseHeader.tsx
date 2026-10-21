// The case page header (docs/design/*Case.dc.html), v2: who first — «موكلنا» + status, the client's name big,
// «ضد <opponent>» below — then the spec sheet (number · court · circuit · type) and the large light stats.
// Desktop: one row with hairline separators; mobile: a 2×2 solid card, no stats (the tabs and the banner carry them).
// Sizes follow the mockups to the pixel. Text the mockups leave at `line-height: normal` gets 1.35: that is SF Arabic's
// normal in the mockup render; the app's normal is taller (~1.5) because the loaded Vazirmatn joins the line metrics.
// Sub-views (?tab=…) get a short header: the case's who-line as eyebrow and the view name as title.
import { ChevronRight, Ellipsis } from "lucide-react";
import Link from "next/link";
import { BackBtn, two, type HeroStat } from "@/components/shell/PageHero";
import type { CaseFile } from "@/lib/case-file";
import { CASE_STATUS } from "@/lib/labels";
import { specSheet, statusTone, whoLine } from "./case-view";

const TONE = { good: ["bg-good", "text-good"], warn: ["bg-gold", "text-gold"], neutral: ["bg-text-4", "text-text-3"] } as const;

/** Mockup: 28px outlined pill (content box, so 30px with its hairline), 6px dot, 12.5px semibold word. */
function StatusPill({ status }: { status: string }) {
  const [dot, text] = TONE[statusTone(status)];
  return (
    <span className={`box-content inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--hairline-v2)] px-3 text-[12.5px] font-semibold ${text}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />{CASE_STATUS[status as keyof typeof CASE_STATUS] ?? status}
    </span>
  );
}

/** Mobile mockup: 42px round glass buttons. */
const ROUND = "glass glass-icon inline-flex size-[42px] shrink-0 items-center justify-center rounded-full";

/** Desktop mockup stats: 0 26px each with a hairline on its right (every one, the first too); number 44px light, label 12.5px. */
function CaseStats({ stats }: { stats: HeroStat[] }) {
  return (
    <div className="mb-1 flex max-sm:hidden">
      {stats.map((s) => {
        const gold = s.highlight && Number(s.value) > 0;
        const body = (
          <>
            <div className={`stat-num text-[44px] ${gold ? "text-gold" : "text-title"}`}>{typeof s.value === "number" ? two(s.value) : s.value}</div>
            <div className={`mt-2 flex items-center gap-1.5 text-[12.5px] ${gold ? "text-gold" : "text-text-3"}`}>
              {gold ? <span aria-hidden className="size-1.5 rounded-full bg-gold" /> : null}{s.label}
            </div>
          </>
        );
        const cls = "block border-s border-[var(--hairline-v2)] px-[26px]";
        if (!s.href) return <div key={s.label} className={cls}>{body}</div>;
        // a same-page hash (e.g. #item-…) must fire hashchange so the item sheet opens: plain <a>
        return s.href.includes("#")
          ? <a key={s.label} href={s.href} className={`${cls} transition hover:opacity-80`}>{body}</a>
          : <Link key={s.label} href={s.href} className={`${cls} transition hover:opacity-80`}>{body}</Link>;
      })}
    </div>
  );
}

export function CaseHeader({ cf, caseId, stats }: { cf: CaseFile; caseId: string; stats: HeroStat[] }) {
  const who = whoLine(cf);
  const spec = specSheet(cf);
  return (
    <div className="leading-[1.35]">
      {/* mobile: back + more at 14px from the top and the sides */}
      <div className="-mx-0.5 flex items-center justify-between pt-3.5 sm:hidden">
        <Link href="/cases" aria-label="رجوع" className={ROUND}><ChevronRight size={20} strokeWidth={2} aria-hidden /></Link>
        <Link href={`/cases/${caseId}?tab=details`} aria-label="بيانات الدعوى" title="بيانات الدعوى" className={ROUND}><Ellipsis size={20} strokeWidth={2} aria-hidden /></Link>
      </div>
      <header className="flex flex-wrap items-end justify-between gap-6 pt-[18px] sm:px-2 sm:pt-6">
        <div className="flex min-w-0 items-start gap-[18px] max-sm:w-full">
          <span className="mt-[18px] hidden sm:block"><BackBtn href="/cases" /></span>
          <div className="min-w-0 max-sm:w-full">
            <div className="flex items-center gap-2.5 px-1 max-sm:justify-between sm:px-0">
              <span className="text-[12px] font-semibold text-gold">{who.client ? "موكلنا" : "القضية"}</span>
              <StatusPill status={cf.case.status} />
            </div>
            <h1 className="mt-1.5 px-1 text-[28px] font-bold leading-[1.2] text-title sm:px-0 sm:text-[40px] sm:leading-[1.15]">{who.client ?? who.fallback}</h1>
            {who.opponent ? (
              <p className="mt-[3px] px-1 text-[16px] text-text sm:mt-1 sm:px-0 sm:text-[20px] sm:leading-[1.4]"><span className="text-text-4">ضد</span> {who.opponent}</p>
            ) : null}
            <dl className="mt-4 grid grid-cols-2 overflow-hidden rounded-[22px] border border-border-2 bg-card shadow-card lg:-mx-[22px] lg:mt-[22px] lg:flex lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none">
              {spec.map((s, i) => (
                <div key={s.label} className={`min-w-0 border-[var(--hairline-v2)] px-3.5 py-3 lg:border-t-0 lg:border-e-0 lg:px-[22px] lg:py-0 ${i % 2 === 0 ? "border-e" : ""} ${i >= 2 ? "border-t" : ""} ${i > 0 ? "lg:border-s" : ""}`}>
                  <dt className="text-[11px] text-text-4 lg:text-[11.5px]"><span className="lg:hidden">{s.short}</span><span className="hidden lg:inline">{s.label}</span></dt>
                  <dd className={`mt-1 text-[14px] leading-[1.4] lg:mt-[5px] lg:text-[14.5px] lg:leading-[1.35] ${s.value ? "font-semibold text-text" : "text-text-4"}`}>
                    {s.value ? (s.mobile ? <><span className="lg:hidden">{s.mobile}</span><span className="hidden lg:inline">{s.value}</span></> : s.value) : (s.fem ? "مش متسجلة" : "مش متسجل")}
                    {s.value && s.extra ? <span className="hidden lg:inline"> · {s.extra}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <CaseStats stats={stats} />
      </header>
    </div>
  );
}

/** The sub-views' header: back to the case, the who-line as eyebrow, the view name as title. */
export function CaseSubHeader({ cf, caseId, title }: { cf: CaseFile; caseId: string; title: string }) {
  const who = whoLine(cf);
  return (
    <header className="flex items-start gap-3 pt-2 sm:gap-[18px] sm:px-2 sm:pt-6">
      <span className="sm:mt-[18px]"><BackBtn href={`/cases/${caseId}`} /></span>
      <div className="min-w-0 pt-0.5 sm:pt-0">
        <Link href={`/cases/${caseId}`} className="text-[12px] font-semibold text-text-3 hover:text-text sm:text-[13px]">
          {who.client ?? who.fallback}{who.client && who.opponent ? <span className="text-text-4"> ضد </span> : null}{who.client && who.opponent ? who.opponent : null}
        </Link>
        <h1 className="mt-1 text-[30px] font-bold leading-[1.2] text-title sm:text-[44px] sm:leading-[1.15]">{title}</h1>
      </div>
    </header>
  );
}
