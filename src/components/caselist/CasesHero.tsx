/**
 * Cases list header, as docs/design/next/Head*Cases.dc.html draws it (the title row, shared with Roll and a case's
 * sub-views: shell/TitleRow). Desktop: one row — «القضايا» (34px), the three stats inline, and the filter capsules
 * (`children`) at the far end — with a hairline under it. The eyebrow is not in the mockup, so it is phone-only.
 * Phone: eyebrow + title, the stats as a row of equal thirds, then the filters (unchanged).
 */
import { PageTitle, TitleRow, TitleStats, type TitleStatData } from "@/components/shell/TitleRow";

export function CasesHero({ eyebrow, title, stats, children }: { eyebrow: string; title: string; stats: TitleStatData[]; children?: React.ReactNode }) {
  return (
    <TitleRow className="pt-3">
      <div className="px-1 sm:px-0">
        <div className="text-sm font-semibold leading-4 tracking-[0.02em] text-text-3 sm:hidden">{eyebrow}</div>
        <PageTitle className="mt-1 sm:mt-0">{title}</PageTitle>
      </div>
      <TitleStats stats={stats} />
      {children}
    </TitleRow>
  );
}
