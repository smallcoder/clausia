/** Roll skeleton: hero, day strip, court cards — the same footprint as the page, so nothing jumps. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1424px] px-2.5 pt-2.5 sm:px-8 sm:pt-4" aria-busy="true" aria-label="جارٍ التحميل">
      <div className="skeleton h-[208px] rounded-[24px] sm:h-[120px] sm:rounded-[28px]" />
      <div className="px-1.5 sm:px-0">
        <div className="mt-[64px] grid grid-cols-6 gap-1.5 sm:gap-2.5">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-16 rounded-[16px] sm:h-[76px] sm:rounded-[18px]" />)}
        </div>
        <div className="skeleton mt-5 h-6 w-3/4 rounded-full" />
        <div className="mt-4 grid gap-3.5 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton h-[150px] rounded-[22px]" />)}
        </div>
      </div>
    </div>
  );
}
