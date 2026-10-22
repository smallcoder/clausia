/**
 * Home's page side of the split layout (docs/design/split/Split*Home): date eyebrow + big greeting, today's roll next to
 * «محتاجة قرار». The chat is the panel beside it (its greeting and the brief are PR 3), so there is no composer here.
 * Text line heights are set to the px the mockups render with `line-height: normal`, so block heights match whichever Arabic font loads.
 */
import type { HomeData } from "./data";
import { formatLongDay, greeting } from "./text";
import { TodayCard } from "./TodayCard";
import { UndecidedCard } from "./UndecidedCard";

/** «مساء الخير، أستاذ تجريبي» → breaks after the comma on mobile, one line on desktop */
function Greeting({ text }: { text: string }) {
  const at = text.indexOf("، ");
  if (at < 0) return <>{text}</>;
  return <>{text.slice(0, at + 1)}<br className="sm:hidden" /> {text.slice(at + 2)}</>;
}

export function HomeView({ data, displayName }: { data: HomeData; displayName: string }) {
  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col px-5 pt-3 leading-[normal] sm:px-10 sm:pt-10">
      <p className="text-sm font-semibold leading-4 tracking-[0.02em] text-text-3 sm:leading-[17px]">{formatLongDay(data.today)}</p>
      <h1 className="mt-1.5 text-xl font-bold leading-[1.2] text-title sm:mt-2 sm:text-2xl sm:leading-[1.15] sm:tracking-[-0.01em]">
        <Greeting text={greeting(displayName)} />
      </h1>

      <div className="mt-6 flex flex-col gap-3 md:mt-7 md:grid md:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] md:gap-4">
        <TodayCard todays={data.todays} tomorrows={data.tomorrows} tomorrow={data.tomorrow} nextDate={data.nextDate} />
        <UndecidedCard count={data.undecided} className="order-first md:order-none" />
      </div>
    </div>
  );
}
