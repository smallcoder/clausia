/**
 * Home, laid out exactly as docs/design/{Light,Dark}{,Mobile}Home.dc.html: date eyebrow + big greeting, the Clausia
 * line built from real counts (no LLM), today's roll next to «محتاجة قرار» (stacked on mobile, «محتاجة قرار» first),
 * then the fixed Home composer. Text line heights are set to the px the mockups render with `line-height: normal`,
 * so block heights match whichever Arabic font loads.
 * Writes only via confirmation cards.
 */
import type { ReactNode } from "react";
import type { HomeData } from "./data";
import { HomeComposer } from "./HomeComposer";
import { clausiaLine, formatLongDay, greeting } from "./text";
import { TodayCard } from "./TodayCard";
import { UndecidedCard } from "./UndecidedCard";

/** «مساء الخير، أستاذ تجريبي» → breaks after the comma on mobile, one line on desktop */
function Greeting({ text }: { text: string }) {
  const at = text.indexOf("، ");
  if (at < 0) return <>{text}</>;
  return <>{text.slice(0, at + 1)}<br className="sm:hidden" /> {text.slice(at + 2)}</>;
}

/** The Clausia line as drawn on Home: C mark (26 / 30px, no shadow; dark adds a 1px hairline around it) + the sentence. */
function ClausiaLine({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 flex max-w-[700px] gap-2.5 sm:mt-[22px] sm:gap-3.5">
      <span aria-hidden className="mark font-num inline-flex size-[26px] shrink-0 items-center justify-center rounded-sm text-sm font-extrabold sm:size-[30px] sm:text-base dark:size-[28px] dark:border dark:border-border sm:dark:size-[32px]">C</span>
      <p className="mt-px min-w-0 text-md leading-[1.75] text-text-3 sm:mt-0.5 sm:text-lg sm:leading-[1.8]">{children}</p>
    </div>
  );
}

export function HomeView({ data, displayName }: { data: HomeData; displayName: string }) {
  const line = clausiaLine({ today: data.todays, tomorrow: data.tomorrows, undecided: data.undecided });
  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-1 flex-col px-5 pt-3 leading-[normal] sm:px-6 sm:pt-[52px]">
      <p className="text-sm font-semibold leading-4 tracking-[0.02em] text-text-3 sm:leading-[17px]">{formatLongDay(data.today)}</p>
      <h1 className="mt-1.5 text-xl font-bold leading-[1.2] text-title sm:mt-2 sm:text-2xl sm:leading-[1.15] sm:tracking-[-0.01em]">
        <Greeting text={greeting(displayName)} />
      </h1>

      <ClausiaLine>
        {line.roll}<span className="hidden sm:inline">{line.where}</span>.
        {line.late ? <> وفيه <span className="font-semibold text-gold">{line.late.gold}</span>{line.late.tail}</> : line.calm}
        {line.ask ? <span className="hidden sm:inline">{line.ask}</span> : null}
      </ClausiaLine>

      <div className="mt-[18px] flex flex-col gap-3 md:mt-[30px] md:grid md:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] md:gap-4">
        <TodayCard todays={data.todays} tomorrows={data.tomorrows} tomorrow={data.tomorrow} nextDate={data.nextDate} />
        <UndecidedCard count={data.undecided} className="order-first md:order-none" />
      </div>

      <div className="min-h-8 flex-1" />

      <HomeComposer />
    </div>
  );
}
