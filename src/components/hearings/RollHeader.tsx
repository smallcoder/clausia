/**
 * The roll's own header and Clausia line. Header, desktop: the shared title row (shell/TitleRow, as the Cases mockup
 * draws it) — «الرول» (34px), the stats inline, the controls («النهارده») at the far end, a hairline under it; the
 * day strip comes below the hairline. Mobile (drawn to docs/design/*Roll.dc.html): eyebrow + «الرول» on the start
 * side, the «محتاجة قرار» pill on the end side of the same row, bottom-aligned. The eyebrow (the date) is phone-only:
 * on desktop the day's own heading says it.
 */
import type { ReactNode } from "react";
import { BackBtn } from "@/components/shell/PageHero";
import { PageTitle, TitleRow, TitleStats, type TitleStatData } from "@/components/shell/TitleRow";

export function RollHeader({ back, eyebrow, title, stats = [], action }: { back?: string; eyebrow: ReactNode; title: ReactNode; stats?: TitleStatData[]; action?: ReactNode }) {
  return (
    <TitleRow className="flex items-end justify-between gap-6 px-1 pt-3 leading-[normal] sm:justify-start">
      <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
        {/* the round button is 44px tall on desktop: its margin keeps the row as tall as the title */}
        {back ? <span className="sm:-my-1.5"><BackBtn href={back} /></span> : null}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-3 sm:hidden">{eyebrow}</div>
          <PageTitle className="mt-1 sm:mt-0">{title}</PageTitle>
        </div>
      </div>
      <TitleStats stats={stats} mobile={false} />
      {action ? <div className="sm:ms-auto">{action}</div> : null}
    </TitleRow>
  );
}

/** «C» + a templated sentence (mockup: 28px mark, 14.5px text, line-height 1.8). */
export function RollSays({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 px-2">
      <span aria-hidden className="mark font-num inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-sm font-extrabold">C</span>
      <p className="mt-0.5 min-w-0 flex-1 text-base leading-[1.8] text-text-3">{children}</p>
    </div>
  );
}
