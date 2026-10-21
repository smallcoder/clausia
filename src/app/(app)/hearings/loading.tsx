/** Roll skeleton: header, day strip, timeline and side card — the same footprint as the page, so nothing jumps. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1360px] px-4 sm:px-10" aria-busy="true" aria-label="جارٍ التحميل">
      <div className="px-1 pt-3 sm:px-2 sm:pt-[36px]">
        <div className="skeleton h-3.5 w-40 rounded-full" />
        <div className="skeleton mt-3 h-10 w-32 rounded-[12px] sm:h-12" />
      </div>
      <div className="skeleton mt-[18px] h-[60px] rounded-[18px] sm:mt-[26px] sm:h-[92px] sm:rounded-[30px]" />
      <div className="mt-6 grid items-start gap-7 sm:mt-[30px] lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="skeleton h-[150px] rounded-[24px] sm:rounded-[28px]" />
          <div className="skeleton h-[72px] rounded-[20px] sm:h-[86px] sm:rounded-[24px]" />
          <div className="skeleton h-[72px] rounded-[20px] sm:h-[86px] sm:rounded-[24px]" />
        </div>
        <div className="skeleton hidden h-[300px] rounded-[28px] lg:block" />
      </div>
    </div>
  );
}
