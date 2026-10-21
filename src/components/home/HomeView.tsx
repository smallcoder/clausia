/**
 * Home (docs/design/*Home.dc.html): date + greeting, the Clausia line built from real counts, today's roll next to
 * «محتاجة قرار», the last thing Clausia saved, then the big composer at the bottom. Writes only via confirmation cards.
 */
import { ClausiaSays } from "@/components/shell/PageHero";
import { Composer } from "@/components/shell/Composer";
import type { HomeData } from "./data";
import { clausiaSentence, formatLongDay, greeting } from "./text";
import { TodayCard } from "./TodayCard";
import { UndecidedRow, UndecidedTile } from "./Undecided";

const CHIPS = [
  { label: "+ موكل وقضية جديدة", text: "موكل جديد: " },
  { label: "سجّل قرار جلسة النهارده", text: "قرار جلسة النهارده في قضية " },
  { label: "إيه المطلوب مني الأسبوع ده؟", text: "إيه المطلوب مني الأسبوع ده؟" },
];

export function HomeView({ data, displayName }: { data: HomeData; displayName: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-1 flex-col px-[18px] pt-2.5 sm:px-6 sm:pt-7">
      <p className="text-xs font-semibold text-text-3 sm:text-[13px]">{formatLongDay(data.today)}</p>
      <h1 className="mt-0.5 text-[22px] font-extrabold leading-[1.3] text-text sm:mt-1 sm:text-[28px]">{greeting(displayName)}</h1>

      <div className="mt-[18px] sm:mt-7">
        <ClausiaSays>
          <p className="text-[15px] leading-[1.75] sm:text-[16px] sm:leading-[1.8]">
            {clausiaSentence({ today: data.todays, tomorrow: data.tomorrows, undecided: data.undecided })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 sm:mt-3.5 sm:gap-3">
            <TodayCard todays={data.todays} tomorrows={data.tomorrows} tomorrow={data.tomorrow} nextDate={data.nextDate} className="flex-[3_1_360px]" />
            <UndecidedTile count={data.undecided} className="hidden flex-[1_1_180px] sm:flex" />
            <UndecidedRow count={data.undecided} className="flex w-full sm:hidden" />
          </div>
          {data.lastRecorded ? (
            <p className="mt-[18px] hidden text-xs leading-normal text-text-4 sm:block">آخر ما سجّلته: {data.lastRecorded}</p>
          ) : null}
        </ClausiaSays>
      </div>

      <div className="min-h-10 flex-1" />

      <div className="sticky bottom-0 z-20 -mx-1.5 bg-gradient-to-t from-bg from-60% to-transparent px-1.5 pb-[calc(26px+env(safe-area-inset-bottom))] pt-[30px] sm:mx-0 sm:px-0 sm:pb-7 sm:pt-5">
        <Composer size="hero" target={{ kind: "new" }} chips={CHIPS} />
      </div>
    </div>
  );
}
