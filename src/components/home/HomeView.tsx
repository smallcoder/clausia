/**
 * Home (docs/design/*Home.dc.html, v2): date eyebrow + big greeting, the Clausia line built from real counts (no LLM),
 * today's roll next to «محتاجة قرار» (stacked on mobile, «محتاجة قرار» first), then the floating hero composer.
 * Writes only via confirmation cards.
 */
import { Composer, type ComposerChip } from "@/components/shell/Composer";
import { ClausiaSays } from "@/components/shell/PageHero";
import type { HomeData } from "./data";
import { clausiaLine, formatLongDay, greeting } from "./text";
import { TodayCard } from "./TodayCard";
import { UndecidedCard } from "./UndecidedCard";

const CHIPS: ComposerChip[] = [
  { label: "موكل وقضية جديدة", text: "موكل جديد: " },
  { label: "سجّل قرار جلسة", text: "قرار جلسة النهارده في قضية " },
  { label: "المطلوب مني الأسبوع ده", text: "إيه المطلوب مني الأسبوع ده؟" },
  { label: "ارفع ورقة", attach: true },
];

const PLACEHOLDER = "اكتب لـ Clausia… حصل إيه في الجلسة، موكل جديد، أو أي سؤال عن قضاياك";

/** «مساء الخير، أستاذ تجريبي» → breaks after the comma on mobile, one line on desktop */
function Greeting({ text }: { text: string }) {
  const at = text.indexOf("، ");
  if (at < 0) return <>{text}</>;
  return <>{text.slice(0, at + 1)}<br className="sm:hidden" /> {text.slice(at + 2)}</>;
}

export function HomeView({ data, displayName }: { data: HomeData; displayName: string }) {
  const line = clausiaLine({ today: data.todays, tomorrow: data.tomorrows, undecided: data.undecided });
  return (
    <div className="mx-auto flex w-full max-w-[1024px] flex-1 flex-col px-5 pt-3 sm:px-8 sm:pt-[52px]">
      <p className="text-[12px] font-semibold tracking-[0.02em] text-text-3 sm:text-[13px]">{formatLongDay(data.today)}</p>
      <h1 className="mt-1.5 text-[30px] font-bold leading-[1.2] text-title sm:mt-2 sm:text-[44px] sm:leading-[1.15] sm:tracking-[-0.01em]">
        <Greeting text={greeting(displayName)} />
      </h1>

      <div className="mt-4 max-w-[700px] sm:mt-[22px]">
        <ClausiaSays>
          <p className="text-[15.5px] leading-[1.75] text-text-3 sm:text-[18px] sm:leading-[1.8]">
            {line.roll}<span className="hidden sm:inline">{line.where}</span>.
            {line.late ? <> وفيه <span className="font-semibold text-gold">{line.late.gold}</span>{line.late.tail}</> : line.calm}
            {line.ask ? <span className="hidden sm:inline">{line.ask}</span> : null}
          </p>
        </ClausiaSays>
      </div>

      <div className="mt-[18px] flex flex-col gap-3 md:mt-[30px] md:grid md:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] md:gap-4">
        <TodayCard todays={data.todays} tomorrows={data.tomorrows} tomorrow={data.tomorrow} nextDate={data.nextDate} />
        <UndecidedCard count={data.undecided} className="order-first md:order-none" />
      </div>

      {data.lastRecorded ? (
        <p className="mt-5 hidden text-[12px] leading-normal text-text-4 md:block">آخر ما سجّلته: {data.lastRecorded}</p>
      ) : null}

      <div className="min-h-8 flex-1" />

      <Composer size="hero" target={{ kind: "new" }} chips={CHIPS} placeholder={PLACEHOLDER} />
    </div>
  );
}
