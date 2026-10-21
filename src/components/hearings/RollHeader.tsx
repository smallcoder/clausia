/**
 * The roll's own header and Clausia line, drawn to docs/design/*Roll.dc.html (the shared PageHero / ClausiaSays
 * wrap the action under the title on mobile and use other sizes). Header: eyebrow + «الرول» on the start side,
 * the controls on the end side of the same row, bottom-aligned (desktop: «05 جلسات الأسبوع»; mobile: the
 * «محتاجة قرار» pill).
 */
import type { ReactNode } from "react";
import { BackBtn } from "@/components/shell/PageHero";

export function RollHeader({ back, eyebrow, title, action }: { back?: string; eyebrow: ReactNode; title: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-6 px-1 pt-3 leading-[normal] sm:px-2 sm:pt-[36px]">
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        {back ? <BackBtn href={back} /> : null}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-3 sm:tracking-[0.02em]">{eyebrow}</div>
          <h1 className="mt-1 text-xl font-bold leading-[1.1] text-title sm:mt-1.5 sm:text-2xl">{title}</h1>
        </div>
      </div>
      {action}
    </header>
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
