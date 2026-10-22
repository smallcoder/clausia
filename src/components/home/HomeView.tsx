/**
 * Home's page side of the split layout (docs/design/split/Split*Home): date eyebrow + big greeting, «الجلسات الجاية» next to
 * a column of «محتاجة قرار» and the two counts (open cases, hearings this week). The chat is the panel beside it (the morning
 * brief, the «noticed» cards and the chips are its top), so there is no composer here.
 * Text line heights are set to the px the mockups render with `line-height: normal`, so block heights match whichever Arabic font loads.
 */
import type { HomeData } from "./data";
import { StatsCard } from "./StatsCard";
import { formatLongDay, greeting } from "./text";
import { UndecidedCard } from "./UndecidedCard";
import { UpcomingCard } from "./UpcomingCard";

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

      <div className="mt-6 flex flex-col gap-3 md:mt-7 md:grid md:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] md:gap-4">
        <UpcomingCard rows={data.upcoming} today={data.today} />
        <div className="flex flex-col gap-3 md:gap-4">
          <UndecidedCard count={data.undecided} className="md:flex-1" />
          <StatsCard openCases={data.openCases} weekHearings={data.weekHearings} />
        </div>
      </div>
    </div>
  );
}
