// The case page header (docs/design/*Case.dc.html), v2: who first — «موكلنا» + status, the client's name big,
// «ضد <opponent>» below — then the spec sheet (number · court · circuit · type) and the large light stats.
// Desktop: one row with hairline separators; mobile: a 2×2 solid card, no stats (the tabs and the banner carry them).
// Sub-views (?tab=…) get a short header: the case's who-line as eyebrow and the view name as title.
import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { BackBtn, StatRow, StatusChip, type HeroStat } from "@/components/shell/PageHero";
import type { CaseFile } from "@/lib/case-file";
import { CASE_STATUS } from "@/lib/labels";
import { specSheet, statusTone, whoLine } from "./case-view";

function StatusPill({ status }: { status: string }) {
  return (
    <span className="inline-flex h-7 items-center rounded-full border border-border-2 px-3">
      <StatusChip tone={statusTone(status)}>{CASE_STATUS[status as keyof typeof CASE_STATUS] ?? status}</StatusChip>
    </span>
  );
}

function MoreBtn({ caseId }: { caseId: string }) {
  return (
    <Link href={`/cases/${caseId}?tab=details`} aria-label="بيانات الدعوى" title="بيانات الدعوى"
      className="glass glass-icon inline-flex size-11 shrink-0 items-center justify-center rounded-full">
      <Ellipsis size={20} strokeWidth={2} aria-hidden />
    </Link>
  );
}

export function CaseHeader({ cf, caseId, stats }: { cf: CaseFile; caseId: string; stats: HeroStat[] }) {
  const who = whoLine(cf);
  const spec = specSheet(cf);
  return (
    <>
      <div className="flex items-center justify-between pt-1 sm:hidden">
        <BackBtn href="/cases" />
        <MoreBtn caseId={caseId} />
      </div>
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6 pt-4 sm:px-2 sm:pt-6">
        <div className="flex min-w-0 items-start gap-[18px] max-sm:w-full">
          <span className="mt-[18px] hidden sm:block"><BackBtn href="/cases" /></span>
          <div className="min-w-0 max-sm:w-full">
            <div className="flex items-center gap-2.5 px-1 max-sm:justify-between sm:px-0">
              <span className="text-[12px] font-semibold text-gold">{who.client ? "موكلنا" : "القضية"}</span>
              <StatusPill status={cf.case.status} />
            </div>
            <h1 className="mt-1.5 px-1 text-[30px] font-bold leading-[1.2] text-title sm:px-0 sm:text-[44px] sm:leading-[1.15]">{who.client ?? who.fallback}</h1>
            {who.opponent ? (
              <p className="mt-1 px-1 text-[16px] leading-[1.4] text-text sm:px-0 sm:text-[20px]"><span className="text-text-4">ضد</span> {who.opponent}</p>
            ) : null}
            <dl className="mt-4 grid grid-cols-2 overflow-hidden rounded-[22px] border border-border-2 bg-card shadow-card lg:-mx-[22px] lg:mt-[22px] lg:flex lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none">
              {spec.map((s, i) => (
                <div key={s.label} className={`min-w-0 border-[var(--hairline-v2)] px-3.5 py-3 lg:border-t-0 lg:border-e-0 lg:px-[22px] lg:py-0 ${i % 2 === 0 ? "border-e" : ""} ${i >= 2 ? "border-t" : ""} ${i > 0 ? "lg:border-s" : ""}`}>
                  <dt className="text-[11px] text-text-4 lg:text-[11.5px]"><span className="lg:hidden">{s.short}</span><span className="hidden lg:inline">{s.label}</span></dt>
                  <dd className={`mt-1 text-[14px] leading-[1.4] lg:mt-[5px] lg:text-[14.5px] ${s.value ? "font-semibold text-text" : "text-text-4"}`}>
                    {s.value ?? (s.fem ? "مش متسجلة" : "مش متسجل")}{s.value && s.extra ? <span className="hidden lg:inline"> · {s.extra}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <StatRow stats={stats} className="mb-1 max-sm:hidden" />
      </header>
    </>
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
