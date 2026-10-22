/**
 * One shared loading pattern (owner item 18): the page's real layout as solid shapes — title, stats, then the
 * card or table shapes — on card + hairline tokens, with one calm shimmer and no spinners. The top bar comes
 * from the layout and stays; the composer shell stays at the bottom (inert until the page arrives).
 */
import { TitleRow } from "@/components/shell/TitleRow";

type Kind = "home" | "chat" | "case" | "roll" | "cases";

const Bar = ({ w, h = 12, className = "" }: { w: string; h?: number; className?: string }) => (
  <span aria-hidden className={`skel block ${className}`} style={{ width: w, height: h }} />
);

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border-2 bg-card p-5 shadow-card sm:p-6 ${className}`}>{children}</div>;
}

function Rows({ n, line = true }: { n: number; line?: boolean }) {
  return (
    <div>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={`flex items-center gap-4 py-4 ${line && i ? "border-t border-border-2" : ""}`}>
          <Bar w="28px" h={28} className="rounded-xl" />
          <div className="flex-1 space-y-2"><Bar w={`${62 - (i % 3) * 9}%`} h={13} /><Bar w={`${38 - (i % 2) * 8}%`} h={10} /></div>
          <Bar w="70px" h={10} className="hidden sm:block" />
        </div>
      ))}
    </div>
  );
}

/** Phone header: the title with its stats under it (the desktop one is the title row below). */
function Header({ stats = 3, eyebrow = true }: { stats?: number; eyebrow?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6 pt-4 sm:hidden">
      <div className="space-y-3">
        {eyebrow ? <Bar w="120px" h={11} /> : null}
        <Bar w="min(320px, 70vw)" h={38} className="rounded-md" />
      </div>
      {stats ? (
        <div className="flex w-full gap-4">
          {Array.from({ length: stats }, (_, i) => <div key={i} className="flex-1 space-y-2"><Bar w="64px" h={36} className="rounded-xl" /><Bar w="56px" h={10} /></div>)}
        </div>
      ) : null}
    </div>
  );
}

/** Desktop title row (the page's real one, shell/TitleRow): the title, its stats inline, the far-end capsules, the hairline. */
function TitleRowSkeleton({ stats, caps = 0 }: { stats: number; caps?: number }) {
  return (
    <TitleRow className="hidden">
      <Bar w="100px" h={37} className="rounded-md" />
      <div className="flex items-center">
        {Array.from({ length: stats }, (_, i) => <div key={i} className="flex items-center gap-1.75 border-s border-border px-4"><Bar w="22px" h={18} /><Bar w="50px" h={11} /></div>)}
      </div>
      <div className="ms-auto flex gap-1">{Array.from({ length: caps }, (_, i) => <Bar key={i} w="88px" h={34} className="rounded-full" />)}</div>
    </TitleRow>
  );
}

/** Home on desktop: the composer is part of the stack, as in the real page (44px under the cards, the column wide: chips, the box, the note). */
function HomeStackComposer() {
  return (
    <>
      <div aria-hidden className="hidden pb-6 sm:mt-11 sm:block">
        <div className="flex justify-center gap-2 pb-3.5">{[130, 118, 160, 96].map((w) => <span key={w} className="skel h-control rounded-full" style={{ width: w }} />)}</div>
        <div className="glass flex h-34 flex-col justify-between rounded-xl p-4">
          <Bar w="55%" h={12} />
          <div className="flex items-center justify-between"><span className="size-10 rounded-full border border-border" /><span className="size-10 rounded-full bg-primary-fill opacity-30" /></div>
        </div>
        <div className="mt-2.5 flex h-4 justify-center"><Bar w="260px" h={10} /></div>
      </div>
      <div aria-hidden className="hidden h-16 shrink-0 sm:block" />
    </>
  );
}

function ComposerShell({ tall = false, mobileOnly = false }: { tall?: boolean; mobileOnly?: boolean }) {
  const only = mobileOnly ? "sm:hidden " : "";
  if (tall)
    return (
      <>
        <div aria-hidden className={`${only}h-44 shrink-0`} />
        <div className={`${only}bg-fade pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(18px+env(safe-area-inset-bottom))] pt-10 sm:px-6 sm:pb-6 sm:pt-15`} /* ds-allow: safe-area inset needs calc() */>
          <div className="glass mx-auto flex max-w-composer h-29 flex-col justify-between rounded-xl p-3.5 sm:h-34 sm:p-4">
            <Bar w="55%" h={12} />
            <div className="flex items-center justify-between"><span className="size-control rounded-full border border-border sm:size-10" /><span className="size-control rounded-full bg-primary-fill opacity-30 sm:size-10" /></div>
          </div>
        </div>
      </>
    );
  return (
    <>
      <div aria-hidden className="h-28 shrink-0" />
      <div className="bg-fade pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3.5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-10 sm:px-10 sm:pb-7.5 sm:pt-15" /* ds-allow: safe-area inset needs calc() */>
        <div className="glass mx-auto flex max-w-composer h-13 items-center gap-2 rounded-xl p-1.5 sm:h-14 sm:p-1.75">
          <span className="size-control rounded-full border border-border sm:size-10" />
          <Bar w="45%" h={12} />
          <span className="ms-auto size-control rounded-full bg-primary-fill opacity-30 sm:size-10" />
        </div>
      </div>
    </>
  );
}

export function PageSkeleton({ kind }: { kind: Kind }) {
  const narrow = kind === "home" || kind === "chat";
  return (
    <div role="status" aria-busy="true" aria-label="جارٍ التحميل"
      className={`skel-shimmer mx-auto flex w-full flex-1 flex-col px-4 sm:px-10 ${kind === "home" ? "sm:justify-center " : ""}${narrow ? "max-w-narrow sm:px-6" : "max-w-page"}`}>
      {kind === "home" ? (
        <>
          <div className="space-y-3 pt-4 sm:pt-10"><Bar w="110px" h={11} /><Bar w="min(380px, 80vw)" h={40} className="rounded-md" /></div>
          <div className="mt-6 flex gap-3"><Bar w="30px" h={30} className="rounded-sm" /><div className="flex-1 space-y-2"><Bar w="80%" h={14} /><Bar w="55%" h={14} /></div></div>
          <div className="mt-8 grid gap-4 sm:grid-cols-[1fr_minmax(0,0.55fr)]"><Card className="order-2 sm:order-none"><Rows n={3} /></Card><Card className="order-1 sm:order-none"><Bar w="90px" h={11} /><Bar w="110px" h={72} className="mt-6 rounded-md" /><Bar w="60%" h={10} className="mt-6" /></Card></div>
        </>
      ) : null}
      {kind === "chat" ? (
        <div className="space-y-6 pt-4 sm:pt-6">
          <div className="flex justify-center"><Bar w="220px" h={30} className="rounded-full" /></div>
          <div className="ms-auto w-7/10 rounded-lg border border-border-2 bg-card p-4"><Bar w="90%" h={12} /><Bar w="60%" h={12} className="mt-2" /></div>
          <div className="flex gap-3"><Bar w="28px" h={28} className="rounded-sm" /><div className="flex-1 space-y-2"><Bar w="75%" h={13} /><Bar w="40%" h={13} /></div></div>
          <Card><Bar w="140px" h={14} /><Rows n={4} /><Bar w="100%" h={44} className="mt-3 rounded-full" /></Card>
        </div>
      ) : null}
      {kind === "case" ? (
        <>
          {/* desktop (item 19): breadcrumb row with the status chip, client «ضد» opponent, one card of 4 spec | 3 stats */}
          <div className="hidden items-center justify-between pt-8 sm:flex">
            <div className="flex items-center gap-3"><span className="size-8 rounded-full border border-border" /><Bar w="130px" h={12} /></div>
            <div className="flex items-center gap-3"><Bar w="64px" h={22} className="rounded-full" /><span className="size-10 rounded-full border border-border" /></div>
          </div>
          <div className="space-y-3 pt-4 sm:pt-5"><Bar w="50px" h={10} /><div className="flex items-end gap-3"><Bar w="min(240px, 60vw)" h={36} className="rounded-md" /><Bar w="130px" h={18} className="hidden sm:block" /></div><Bar w="180px" h={14} className="sm:hidden" /></div>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:hidden">{Array.from({ length: 4 }, (_, i) => <div key={i} className="space-y-2"><Bar w="60px" h={10} /><Bar w="120px" h={14} /></div>)}</div>
          {/* same columns as the header card: 4 spec cells (1fr) | 3 stat cells (0.7fr) */}
          <div className="mt-6 hidden grid-cols-[repeat(4,minmax(0,1fr))_repeat(3,minmax(0,0.7fr))] items-center rounded-xl border border-border-2 bg-card py-5 shadow-card sm:grid">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className={`min-w-0 space-y-2 px-6 ${i ? "border-s border-border-2" : ""}`}>
                {i < 4 ? <><Bar w="50px" h={9} /><Bar w="85%" h={13} /></> : <><Bar w="38px" h={28} className="rounded-xl" /><Bar w="46px" h={9} /></>}
              </div>
            ))}
          </div>
          <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
            <div className="space-y-5"><div className="flex gap-3"><Bar w="32px" h={32} className="rounded-sm" /><div className="flex-1 space-y-2"><Bar w="85%" h={14} /><Bar w="50%" h={14} /></div></div><Card><Bar w="80px" h={14} /><Rows n={3} /></Card><div className="grid gap-4 sm:grid-cols-2"><Card><Rows n={2} line={false} /></Card><Card><Rows n={2} line={false} /></Card></div></div>
            <div className="hidden space-y-5 lg:block"><Card><Bar w="70px" h={56} className="rounded-md" /><Bar w="60%" h={12} className="mt-4" /></Card><Card><Rows n={3} /></Card><Card><Rows n={3} /></Card></div>
          </div>
        </>
      ) : null}
      {kind === "roll" ? (
        <>
          <Header stats={1} />
          <TitleRowSkeleton stats={2} caps={1} />
          {/* the month label line, then the day strip: 7 tiles a week (a full-width row on mobile; the card with its two round buttons on desktop) */}
          <div className="mt-4.5 flex h-7 items-center px-1 sm:px-2"><Bar w="74px" h={11} /></div>
          <div className="relative mt-2 grid grid-cols-7 sm:gap-1.5 sm:rounded-xl sm:border sm:border-border-2 sm:bg-card sm:px-12 sm:py-1.5 sm:shadow-card">
            <span aria-hidden className="absolute start-1.5 top-1/2 hidden size-9 -translate-y-1/2 rounded-full border border-border sm:block" />
            {Array.from({ length: 7 }, (_, i) => <div key={i} className="flex flex-col items-center gap-2 py-3"><Bar w="32px" h={10} /><Bar w="30px" h={24} className="rounded-xl" /><Bar w="14px" h={5} /></div>)}
            <span aria-hidden className="absolute end-1.5 top-1/2 hidden size-9 -translate-y-1/2 rounded-full border border-border sm:block" />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_455px]">
            <div className="space-y-6 border-s border-border-2 ps-6">{[0, 1, 2].map((i) => <div key={i} className="space-y-3"><Bar w="200px" h={14} /><Card className={i ? "" : "pb-8"}><Rows n={1} line={false} />{i ? null : <Bar w="100%" h={48} className="mt-3 rounded-full" />}</Card></div>)}</div>
            <div className="hidden lg:block"><Card><Bar w="140px" h={14} /><Rows n={3} /></Card></div>
          </div>
        </>
      ) : null}
      {kind === "cases" ? (
        <>
          <Header />
          <TitleRowSkeleton stats={3} caps={4} />
          <div className="mt-6 flex gap-2 sm:hidden">{Array.from({ length: 4 }, (_, i) => <Bar key={i} w="88px" h={34} className="rounded-full" />)}</div>
          <Card className="mt-4 sm:mt-4.5 !p-0"><div className="border-b border-border-2 px-6 py-3"><Bar w="40%" h={10} /></div><div className="px-6"><Rows n={7} /></div></Card>
        </>
      ) : null}
      {kind === "home" ? <><ComposerShell tall mobileOnly /><HomeStackComposer /></> : <ComposerShell tall={kind === "chat"} />}
    </div>
  );
}
